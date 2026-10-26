"use strict";
const {
  TABLES,
  localDate,
  today,
  ym,
  nextMonth,
  dateOK,
  monthOK,
  validMoney,
  settingsValue,
  startMonth,
  monthList,
  periodActive,
  activeMembers,
  feeAt,
  monthly,
  moneyEvents,
  balanceAt,
  refundLimit,
  validateState,
  paidIn,
  refundedIn,
  landlordAt,
  allocation,
} = PT;
const { state, all } = PTDB;
let view = "home",
  month = ym(new Date()),
  memberId = null,
  reportType = "summary",
  reportFrom = month,
  reportTo = month;
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  uid = () => crypto.randomUUID();
const settings = (s) =>
  Object.fromEntries(s.settings.map((x) => [x.id, x.value]));
function fmt(n) {
  return n.toLocaleString("hu-HU") + " Ft";
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function labelMonth(m) {
  const [y, mo] = m.split("-");
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
  }).format(new Date(+y, +mo - 1, 1));
}
async function mutate(table, record, kind = "update", before) {
  const c = { table, record, kind };
  if (before !== undefined) c.before = before;
  await PTDB.commit([c]);
}
function toast(m, bad = false) {
  let n = $("#toast");
  n.textContent = m;
  n.style.background = bad ? "#7f1d1d" : "#14532d";
  n.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (n.style.display = "none"), 4000);
}
function btn(text, fn) {
  return `<button type="button" onclick="${fn}">${text}</button>`;
}
function dateField(id, value = today()) {
  return `<label for="${id}">Dátum</label><input id="${id}" type="date" value="${value}" required>`;
}
async function render() {
  let s = await state(),
    cfg = settings(s);
  if (startMonth(s) > month) month = startMonth(s);
  if (month > ym(new Date())) month = ym(new Date());
  let titles = {
    home: "Próbaterem",
    ledger: "Napló",
    members: "Tagok",
    reports: "Riportok",
    settings: "Beállítások",
    detail: "Tag részletei",
  };
  let content = "";
  try {
    content =
      view === "home"
        ? home(s)
        : view === "ledger"
          ? ledger(s)
          : view === "members"
            ? members(s)
            : view === "reports"
              ? reports(s)
              : view === "settings"
                ? settingScreen(s)
                : detail(s);
  } catch (e) {
    content = `<div class="warning">${esc(e.message)}</div>`;
  }
  app.innerHTML = `<main class="app"><header class="top"><div><div class="eyebrow">ZENEKARI PÉNZTÁR</div><h1>${esc(titles[view])}</h1></div><button aria-label="Beállítások" class="iconbtn" onclick="go('settings')">⚙</button></header>${content}</main><div class="nav"><div class="navinner">${[
    ["home", "⌂", "Főoldal"],
    ["ledger", "≡", "Napló"],
    ["members", "♙", "Tagok"],
    ["reports", "▥", "Riportok"],
  ]
    .map(
      (x) =>
        `<button class="${view === x[0] ? "active" : ""}" onclick="go('${x[0]}')"><span class="ico">${x[1]}</span>${x[2]}</button>`,
    )
    .join("")}</div></div>`;
  if (view === "home") backupReminder(s);
  runtimeStatus();
}
function go(v, id) {
  view = v;
  if (id) memberId = id;
  render();
}
function home(s) {
  let m = monthly(s, month),
    end = ym(new Date()),
    rent = landlordAt(s, month),
    items = s.members
      .map((p) => {
        let bal = balanceAt(s, p.id, month),
          paid = paidIn(s, p.id, month);
        return `<button class="person" onclick="go('detail','${p.id}')"><span><b>${esc(p.name)}</b>${periodActive(s, p.id, month) ? "" : '<br><small class="muted">Inaktív</small>'}</span><span class="values"><span>${fmt(paid)}</span><br><b class="${bal > 0 ? "positive" : bal < 0 ? "negative" : ""}">${bal > 0 ? "+" : ""}${fmt(bal)}</b></span></button>`;
      })
      .join("");
  return `<div class="monthnav"><button ${month <= startMonth(s) ? "disabled" : ""} onclick="changeMonth(-1)">‹</button><b>${labelMonth(month)}</b><button ${month >= end ? "disabled" : ""} onclick="changeMonth(1)">›</button></div><div class="card hero"><span class="muted">Havi próbateremdíj</span><strong>${fmt(m.rental)}</strong><div class="row small muted"><span>${m.persons.length} aktív tag</span><span>${fmt(m.share)} / fő</span></div>${!s.rentalFees.some((f) => f.start <= month) ? '<div class="warning">Ehhez a hónaphoz nincs beállított teremdíj.</div>' : ""}${!m.persons.length ? '<div class="warning">Nincs aktív tag: a teremdíj nem osztható szét.</div>' : ""}${m.extra ? `<div class="small muted">Kerekítési többlet: ${fmt(m.extra)}</div>` : ""}</div><button class="person" onclick="ownerDialog()"><span><b>Terembérlet</b><br><small class="muted">${rent ? `Kifizetve: ${rent.date}` : "Tulajdonosnak fizetve?"}</small></span><span class="pill ${rent ? "good" : "bad"}">${rent ? "Rendezve" : "Nincs rendezve"}</span></button>${rent && rent.amount !== m.rental ? `<div class="warning">Eltérés: tényleges kifizetés ${fmt(rent.amount)}, előírt díj ${fmt(m.rental)}. Különbözet: ${fmt(rent.amount - m.rental)}.</div>` : ""}<div class="section row"><span>Zenekari tagok</span><small class="muted">Havi / Egyenleg</small></div>${items || '<div class="empty">Ebben a hónapban nincs aktív tag.</div>'}<button class="primaryWide" onclick="paymentDialog()">＋ Új befizetés</button>${month !== end ? '<p class="note">Korábbi hónapot nézel: az egyenlegek az adott hónap végére vonatkoznak.</p>' : ""}`;
}
function changeMonth(n) {
  month = nextMonth(month, n);
  render();
}
function members(s) {
  return `<button class="primaryWide" onclick="memberDialog()">＋ Új tag</button><div class="section">Zenekari tagok</div>${
    s.members
      .map((m) => {
        let a = periodActive(s, m.id, month),
          bal = balanceAt(s, m.id, month);
        return `<button class="person" onclick="go('detail','${m.id}')"><span><b>${esc(m.name)}</b><br><small class="muted">${a ? "Aktív a kiválasztott hónapban" : "Nem aktív"}</small></span><span class="${bal > 0 ? "positive" : bal < 0 ? "negative" : ""}">${fmt(bal)}</span></button>`;
      })
      .join("") || '<div class="empty">Még nincs tag. Vegyél fel egyet!</div>'
  }`;
}
function detail(s) {
  let m = s.members.find((x) => x.id === memberId);
  if (!m) return "<p>Nincs ilyen tag.</p>";
  let bal = balanceAt(s, m.id, month);
  let logs = s.payments
    .filter((p) => p.memberId === m.id && !p.voided)
    .map((p) => ({ date: p.date, amount: p.amount, label: "Befizetés" }))
    .concat(
      s.refunds
        .filter((p) => p.memberId === m.id && !p.voided)
        .map((p) => ({
          date: p.date,
          amount: -p.amount,
          label: "Visszafizetés",
        })),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return `<button class="secondary" onclick="go('members')">← Tagok</button><h2>${esc(m.name)}</h2><div class="card"><span class="muted">Halmozott egyenleg (${labelMonth(month)})</span><h2 class="${bal > 0 ? "positive" : bal < 0 ? "negative" : ""}">${bal > 0 ? "+" : ""}${fmt(bal)}</h2></div><div class="actions"><button onclick="paymentDialog('${m.id}')">＋ Befizetés</button><button class="secondary" onclick="refundDialog('${m.id}')">↩ Visszafizetés</button></div><div class="actions"><button class="secondary" onclick="memberDialog('${m.id}')">Tag módosítása</button><button class="secondary" onclick="periodDialog('${m.id}')">Tagsági időszakok</button></div><div class="section">Havi elszámolás</div><div class="tablewrap"><table><thead><tr><th>Hónap</th><th class="num">Tagdíj</th><th class="num">Befizetés</th><th class="num">Egyenleg</th></tr></thead><tbody>${monthList(
    s,
    month,
  )
    .map((mm) => {
      let paid = paidIn(s, m.id, mm);
      return `<tr><td>${mm}</td><td class="num">${periodActive(s, m.id, mm) ? fmt(monthly(s, mm).share) : "–"}</td><td class="num">${fmt(paid)}</td><td class="num">${fmt(balanceAt(s, m.id, mm))}</td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><div class="section">Legrégebbi tartozások rendezése</div>${
    allocation(s, m.id, month)
      .rows.filter((r) => r.outstanding)
      .map(
        (r) =>
          `<div class="record row"><span>${r.month}</span><b class="negative">${fmt(r.outstanding)}</b></div>`,
      )
      .join("") || '<p class="note">Nincs fennálló havi tartozás.</p>'
  }<div class="section">Pénzmozgások</div>${logs.map((p) => `<div class="record row"><span>${p.date}<br><small class="muted">${p.label}</small></span><b>${fmt(p.amount)}</b></div>`).join("") || '<div class="empty">Még nincs pénzmozgás.</div>'}`;
}
function ledger(s) {
  let moves = [
    ...s.payments.map((p) => ({ ...p, type: "payments", text: "Befizetés" })),
    ...s.refunds.map((p) => ({ ...p, type: "refunds", text: "Visszafizetés" })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return `<div class="actions"><button onclick="paymentDialog()">＋ Befizetés</button><button class="secondary" onclick="refundDialog()">↩ Visszafizetés</button></div><label>Tag szerinti szűrés</label><select id="ledgerFilter" onchange="filterLedger()"><option value="">Összes tag</option>${s.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select><div class="grid2"><div><label for="ledgerFrom">Dátumtól</label><input id="ledgerFrom" type="date" onchange="filterLedger()"></div><div><label for="ledgerTo">Dátumig</label><input id="ledgerTo" type="date" onchange="filterLedger()"></div></div><div class="section">Pénzmozgások</div><div id="ledgerRows">${moveRows(s, moves)}</div><button class="secondary primaryWide" onclick="auditDialog()">Változásnapló megtekintése</button>`;
}
function moveRows(s, moves) {
  return (
    moves
      .map(
        (p) =>
          `<div class="record" data-member="${p.memberId}" data-date="${p.date}"><div class="row"><div><b>${esc(s.members.find((x) => x.id === p.memberId)?.name || "Ismeretlen")}</b><div class="muted small">${p.date} · ${p.text}${p.voided ? " · ÉRVÉNYTELEN" : ""}</div></div><b class="${p.type === "refunds" ? "negative" : "positive"}">${p.type === "refunds" ? "-" : "+"}${fmt(p.amount)}</b></div><div class="small muted">Azonosító: ${esc(p.id)}</div>${p.note ? `<p class="note">${esc(p.note)}</p>` : ""}<div class="actions" style="margin-top:10px"><button class="secondary" onclick="${p.type === "payments" ? "paymentDialog" : "refundDialog"}('${p.memberId}','${p.id}')">Szerkesztés</button><button class="dangerBtn" onclick="voidDialog('${p.type}','${p.id}')">${p.voided ? "Visszaállítás" : "Érvénytelenítés"}</button></div></div>`,
      )
      .join("") || '<div class="empty">Még nincs pénzmozgás.</div>'
  );
}
function filterLedger() {
  const id = $("#ledgerFilter").value,
    from = $("#ledgerFrom").value,
    to = $("#ledgerTo").value;
  let count = 0;
  document.querySelectorAll("#ledgerRows [data-member]").forEach((el) => {
    const show =
      (!id || el.dataset.member === id) &&
      (!from || el.dataset.date >= from) &&
      (!to || el.dataset.date <= to);
    el.hidden = !show;
    if (show) count++;
  });
  $("#filterEmpty")?.remove();
  if (!count)
    $("#ledgerRows").insertAdjacentHTML(
      "beforeend",
      '<div id="filterEmpty" class="empty">Nincs találat.</div>',
    );
}
function paymentDialog(mid = "", pid = "") {
  state().then((s) => {
    let p = s.payments.find((x) => x.id === pid);
    modal(
      `<h2>${p ? "Befizetés módosítása" : "Új befizetés"}</h2><form id="editForm"><label>Tag</label><select id="fmember" required>${s.members.map((m) => `<option value="${m.id}" ${m.id === (p?.memberId || mid) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select><label>Összeg (Ft)</label><input id="famount" type="number" inputmode="numeric" min="1" step="1" value="${p?.amount || ""}" required>${dateField("fdate", p?.date || today())}<label>Megjegyzés</label><textarea id="fnote" maxlength="4000">${esc(p?.note || "")}</textarea><div class="actions" style="margin-top:15px"><button type="submit">Mentés</button><button type="button" class="secondary" onclick="closeModal()">Mégse</button></div></form>`,
    );
    bindForm(async (e) => {
      e.preventDefault();
      try {
        let amount = Number($("#famount").value),
          date = $("#fdate").value;
        if (
          !validMoney(amount) ||
          !dateOK(date) ||
          date.slice(0, 7) < startMonth(s) ||
          date > today()
        )
          throw Error(
            "Érvénytelen összeg vagy dátum (a nyilvántartás kezdetétől a mai napig)",
          );
        let item = {
          id: p?.id || uid(),
          memberId: $("#fmember").value,
          amount,
          date,
          note: $("#fnote").value.trim(),
          voided: p?.voided || false,
        };
        await mutate("payments", item, p ? "update" : "create", p || null);
        closeModal();
        toast("Befizetés mentve");
        render();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}
function refundDialog(mid = "", rid = "") {
  state().then((s) => {
    let p = s.refunds.find((x) => x.id === rid);
    modal(
      `<h2>${p ? "Visszafizetés módosítása" : "Túlfizetés visszafizetése"}</h2><p class="note">A visszafizetés nem haladhatja meg az adott napon rendelkezésre álló pozitív egyenleget.</p><form id="editForm"><label>Tag</label><select id="fmember" required>${s.members.map((m) => `<option value="${m.id}" ${m.id === (p?.memberId || mid) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select><label>Összeg (Ft)</label><input id="famount" type="number" min="1" step="1" inputmode="numeric" value="${p?.amount || ""}" required>${dateField("fdate", p?.date || today())}<label>Megjegyzés</label><textarea id="fnote" maxlength="4000">${esc(p?.note || "")}</textarea><div class="actions" style="margin-top:15px"><button type="submit">Mentés</button><button type="button" class="secondary" onclick="closeModal()">Mégse</button></div></form>`,
    );
    bindForm(async (e) => {
      e.preventDefault();
      try {
        let amount = Number($("#famount").value),
          date = $("#fdate").value;
        if (
          !validMoney(amount) ||
          !dateOK(date) ||
          date.slice(0, 7) < startMonth(s) ||
          date > today()
        )
          throw Error(
            "Érvénytelen összeg vagy dátum (a nyilvántartás kezdetétől a mai napig)",
          );
        let item = {
          id: p?.id || uid(),
          memberId: $("#fmember").value,
          amount,
          date,
          note: $("#fnote").value.trim(),
          voided: p?.voided || false,
        };
        await mutate("refunds", item, p ? "update" : "create", p || null);
        closeModal();
        toast("Visszafizetés mentve");
        render();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}
function voidDialog(table, id) {
  state().then((s) => {
    let old = s[table].find((x) => x.id === id);
    if (!old) return;
    let t = !old.voided;
    modal(
      `<h2>${t ? "Tétel érvénytelenítése" : "Tétel visszaállítása"}</h2><p>${t ? "Biztosan érvényteleníted" : "Biztosan visszaállítod"} a(z) ${fmt(old.amount)} összegű tételt?</p><div class="actions"><button class="dangerBtn" id="confirmVoid">Megerősítés</button><button class="secondary" onclick="closeModal()">Mégse</button></div>`,
    );
    $("#confirmVoid").onclick = async () => {
      try {
        await mutate(table, { ...old, voided: t }, t ? "void" : "restore", old);
        closeModal();
        render();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });
}
function memberDialog(id = "") {
  state().then((s) => {
    let p = s.members.find((m) => m.id === id);
    modal(
      `<h2>${p ? "Tag módosítása" : "Új tag"}</h2><form id="editForm"><label>Név</label><input id="fname" maxlength="80" value="${esc(p?.name || "")}" required>${p ? "" : `<label>Tagság kezdő hónapja</label><input id="fstart" type="month" value="${month}" required>`}<div class="actions" style="margin-top:15px"><button type="submit">Mentés</button><button type="button" class="secondary" onclick="closeModal()">Mégse</button></div></form>`,
    );
    bindForm(async (e) => {
      e.preventDefault();
      try {
        let name = $("#fname").value.trim();
        if (!name) throw Error("Add meg a nevet");
        if (!p) {
          let start = $("#fstart").value;
          if (start < startMonth(s) || start > ym(new Date()))
            throw Error(
              "A kezdő hónap a nyilvántartott időszakon belül legyen",
            );
          let member = { id: uid(), name, order: s.members.length, opening: 0 },
            period = { id: uid(), memberId: member.id, start, end: null };
          await PTDB.commit([
            { table: "members", record: member, kind: "create", before: null },
            {
              table: "membershipPeriods",
              record: period,
              kind: "create",
              before: null,
            },
          ]);
        } else await mutate("members", { ...p, name }, "update", p);
        closeModal();
        toast("Tag mentve");
        render();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}
function periodDialog(mid) {
  state().then((s) => {
    let p = s.membershipPeriods
      .filter((x) => x.memberId === mid)
      .sort((a, b) => a.start.localeCompare(b.start));
    modal(
      `<h2>Tagsági időszakok</h2><p class="note">A kezdő és záró hónap is teljes havi tagságot jelent. Üres záró hónap esetén a tagság folyamatos.</p>${p.map((x) => `<div class="record"><div class="row"><span>${x.start} – ${x.end || "jelenleg"}</span><button class="secondary" onclick="editPeriod('${mid}','${x.id}')">Szerkesztés</button></div></div>`).join("")}<div class="actions"><button onclick="editPeriod('${mid}')">＋ Új időszak</button><button class="secondary" onclick="closeModal()">Bezárás</button></div>`,
    );
  });
}
function editPeriod(mid, id = "") {
  state().then((s) => {
    let p = s.membershipPeriods.find((x) => x.id === id);
    closeModal();
    modal(
      `<h2>${p ? "Időszak módosítása" : "Új tagsági időszak"}</h2><form id="editForm"><label>Kezdő hónap</label><input id="pstart" type="month" required value="${p?.start || month}"><label>Záró hónap (üres = folyamatos)</label><input id="pend" type="month" value="${p?.end || ""}"><div class="actions" style="margin-top:15px"><button type="submit">Mentés</button><button class="secondary" type="button" onclick="closeModal()">Mégse</button></div></form>`,
    );
    bindForm(async (e) => {
      e.preventDefault();
      try {
        let start = $("#pstart").value,
          end = $("#pend").value || null;
        if (
          start < startMonth(s) ||
          start > ym(new Date()) ||
          (end && end < start)
        )
          throw Error("Hibás tagsági időszak");
        let item = { id: p?.id || uid(), memberId: mid, start, end };
        await mutate(
          "membershipPeriods",
          item,
          p ? "update" : "create",
          p || null,
        );
        closeModal();
        render();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}
function ownerDialog() {
  state().then((s) => {
    let old = s.landlordPayments.find((x) => x.month === month);
    modal(
      `<h2>Terembérlet – ${labelMonth(month)}</h2><div class="card"><span class="muted">Előírt bérleti díj</span><h2>${fmt(feeAt(s, month))}</h2></div><form id="editForm"><div class="checkboxline"><input id="paid" type="checkbox" ${old?.paid ? "checked" : ""}><label for="paid">Rendezve – egy összegben kifizetve</label></div>${dateField("fdate", old?.date || today())}<label>Ténylegesen kifizetett összeg (Ft)</label><input id="famount" type="number" inputmode="numeric" min="1" step="1" value="${old?.amount || feeAt(s, month)}"><p class="note">Ha a teremdíj később módosul, a tényleges kifizetés összege változatlan marad.</p><div class="actions"><button type="submit">Mentés</button><button class="secondary" type="button" onclick="closeModal()">Mégse</button></div></form>`,
    );
    bindForm(async (e) => {
      e.preventDefault();
      try {
        let paid = $("#paid").checked,
          date = paid ? $("#fdate").value : null,
          amount = paid ? Number($("#famount").value) : 0;
        if (paid && (!dateOK(date) || date > today() || !validMoney(amount)))
          throw Error("Hibás dátum vagy összeg");
        let record = { id: old?.id || uid(), month, paid, date, amount };
        await mutate(
          "landlordPayments",
          record,
          old ? "update" : "create",
          old || null,
        );
        closeModal();
        render();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}
function feeDialog(id = "") {
  state().then((s) => {
    let p = s.rentalFees.find((x) => x.id === id);
    modal(
      `<h2>${p ? "Díjváltozás módosítása" : "Új díjváltozás"}</h2><form id="editForm"><label>Érvényesség kezdete</label><input type="month" id="fstart" value="${p?.start || month}" required><label>Havi bérleti díj (Ft)</label><input type="number" inputmode="numeric" id="famount" min="1" step="1" value="${p?.amount || ""}" required><div class="warning">Korábbi díj módosítása megváltoztathatja az érintett és későbbi egyenlegeket.</div><div class="actions"><button type="submit">Mentés</button><button type="button" class="secondary" onclick="closeModal()">Mégse</button></div></form>`,
    );
    bindForm(async (e) => {
      e.preventDefault();
      try {
        let start = $("#fstart").value,
          amount = Number($("#famount").value);
        if (
          start < startMonth(s) ||
          start > ym(new Date()) ||
          !validMoney(amount)
        )
          throw Error("Hibás érvényesség vagy összeg");
        if (!confirm("Újraszámoljuk az érintett hónapok egyenlegeit?")) return;
        await mutate(
          "rentalFees",
          { id: p?.id || uid(), start, amount },
          p ? "update" : "create",
          p || null,
        );
        closeModal();
        render();
      } catch (e) {
        toast(e.message, true);
      }
    });
  });
}
function auditDialog() {
  all("auditLog").then((a) => {
    modal(
      `<h2>Teljes változásnapló</h2><div style="max-height:65vh;overflow:auto">${
        a
          .sort((x, y) => y.at.localeCompare(x.at))
          .map(
            (l) =>
              `<div class="record"><b>${esc(l.kind)} · ${esc(l.table)}</b><div class="muted small">${new Date(l.at).toLocaleString("hu-HU")}</div><details><summary>Korábbi / új érték</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px">${esc(JSON.stringify({ before: l.before, after: l.after }, null, 2))}</pre></details></div>`,
          )
          .join("") || "Nincs változás"
      }</div><button class="secondary primaryWide" onclick="closeModal()">Bezárás</button>`,
    );
  });
}
function reports(s) {
  return `<div class="card"><label>Riport típusa</label><select id="reportType" onchange="reportType=this.value;render()"><option value="summary" ${reportType === "summary" ? "selected" : ""}>Havi állapot</option><option value="period" ${reportType === "period" ? "selected" : ""}>Időszaki elszámolás</option><option value="ledger" ${reportType === "ledger" ? "selected" : ""}>Befizetési napló</option></select>${reportType === "summary" ? `<label>Hónap</label><input type="month" id="rmonth" onchange="month=this.value" value="${month}" min="${startMonth(s)}" max="${ym(new Date())}">` : `<label>Kezdő hónap</label><input type="month" id="rfrom" onchange="reportFrom=this.value" value="${reportFrom}" min="${startMonth(s)}" max="${ym(new Date())}"><label>Záró hónap</label><input type="month" id="rto" onchange="reportTo=this.value" value="${reportTo}" min="${startMonth(s)}" max="${ym(new Date())}">`}<div class="actions" style="margin-top:15px"><button onclick="exportReport('xlsx')">⬇ Excel (.xlsx)</button><button class="secondary" onclick="exportReport('pdf')">▤ PDF</button></div><p class="note">PDF: a megnyíló nyomtatási ablakban válaszd a „Mentés PDF-ként” lehetőséget. A riport készítése offline is működik.</p></div><div class="section">Riport tartalma</div><div class="card">${reportType === "summary" ? "Aktív és inaktív tagok, havi befizetések és visszafizetések, halmozott egyenlegek, terembérlet állapota és kerekítés." : reportType === "period" ? "Havi tagdíjak, havi befizetések és záróegyenlegek, valamint a tulajdonosi kifizetések." : "Dátumozott befizetések és visszafizetések, megjegyzésekkel és státusszal."}</div>`;
}
async function exportReport(format) {
  try {
    let r = reportData(await state());
    let name = `Probaterem_${r.title.replaceAll(" ", "_")}_${r.from}_${r.to}`;
    if (format === "xlsx")
      download(
        makeXLSX(r),
        name + ".xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    else printReport(r);
  } catch (e) {
    toast(e.message, true);
  }
}

let modalFocus = null,
  modalKeys = null,
  generalSnapshot = null;
function modal(html) {
  if ($("#dialog")) closeModal();
  modalFocus = document.activeElement;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="modalBackdrop" id="dialog"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">${html}</div></div>`,
  );
  $("#dialog h2")?.setAttribute("id", "dialogTitle");
  $("#dialog").addEventListener("click", (e) => {
    if (e.target.id === "dialog") closeModal();
  });
  modalKeys = (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") {
      const nodes = [
        ...$("#dialog").querySelectorAll(
          'button,input,select,textarea,summary,[tabindex="0"]',
        ),
      ].filter((n) => !n.disabled && n.offsetParent !== null);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  document.addEventListener("keydown", modalKeys);
  $("#dialog").querySelector("input,select,button")?.focus();
}
function closeModal() {
  document.removeEventListener("keydown", modalKeys);
  $("#dialog")?.remove();
  modalFocus?.focus();
}
function settingScreen(s) {
  generalSnapshot = s.settings;
  const cfg = settings(s),
    last = s.backupMetadata.find((x) => x.id === "last"),
    attempt = s.backupMetadata.find((x) => x.id === "lastAttempt");
  return `<div class="section">Általános</div><div class="card"><label for="bandName">Zenekar neve</label><input id="bandName" value="${esc(cfg.bandName)}" maxlength="100"><label for="startMonth">Nyilvántartás kezdő hónapja</label><input id="startMonth" type="month" value="${esc(cfg.startMonth)}"><button class="primaryWide" onclick="saveGeneral()">Beállítások mentése</button><p class="note">A kezdő hónap módosítása újraszámolja a kötelezettségeket. Nem zárható ki már rögzített pénzmozgás a nyilvántartásból.</p></div><button class="secondary primaryWide" onclick="go('members')">Zenekari tagok kezelése</button><div class="section">Havi próbateremdíj</div>${[
    ...s.rentalFees,
  ]
    .sort((a, b) => b.start.localeCompare(a.start))
    .map(
      (x) =>
        `<div class="record row"><span>${x.start} hónaptól<br><b>${fmt(x.amount)}</b></span><button class="secondary" onclick="feeDialog('${x.id}')">Módosítás</button></div>`,
    )
    .join(
      "",
    )}<button class="primaryWide" onclick="feeDialog()">＋ Díjváltozás felvétele</button><div class="section">Adatmentés</div><div class="card"><p class="note">Utolsó böngésző által visszaigazolt fájlírás: ${last ? esc(new Date(last.value).toLocaleString("hu-HU")) : "nincs igazolt mentés"}</p>${attempt ? `<p class="note">Utolsó letöltéskezdeményezés (nem igazolt megőrzés): ${esc(new Date(attempt.value).toLocaleString("hu-HU"))}</p>` : ""}<button class="primaryWide" onclick="backup()">⬇ Teljes JSON biztonsági mentés</button><button class="secondary primaryWide" onclick="restoreDialog()">⬆ Visszaállítás JSON-fájlból</button><button class="outline primaryWide" onclick="safetyDialog()">Helyi védőmentések kimentése</button><p class="note">30 napos emlékeztető, 7 napos halasztással. A fájlt külön eszközön is őrizd meg. A helyi védőmentés nem véd a böngészőadatok törlésétől.</p></div><div class="section">Program</div><p class="note">Próbaterem 1.1 · Offline PWA · IndexedDB · PIN nélkül</p><button class="outline primaryWide" onclick="checkUpdate()">Frissítés keresése</button><div id="pwaStatus" class="note" role="status"></div>`;
}
async function saveGeneral() {
  try {
    const name = $("#bandName").value.trim(),
      start = $("#startMonth").value;
    if (!monthOK(start) || start > ym(new Date()))
      throw Error("Hibás kezdő hónap");
    const before = generalSnapshot;
    if (
      start !== before.find((x) => x.id === "startMonth").value &&
      !confirm(
        "A kezdő hónap módosítása újraszámolja a korábbi kötelezettségeket. Folytatod?",
      )
    )
      return;
    await PTDB.commit([
      {
        table: "settings",
        record: { id: "bandName", value: name },
        before: before.find((x) => x.id === "bandName"),
        kind: "update",
      },
      {
        table: "settings",
        record: { id: "startMonth", value: start },
        before: before.find((x) => x.id === "startMonth"),
        kind: "update",
      },
    ]);
    toast("Beállítások mentve");
    await render();
  } catch (e) {
    toast(e.message, true);
  }
}
function reportData(s) {
  const from =
      reportType === "summary" ? $("#rmonth").value : $("#rfrom").value,
    to = reportType === "summary" ? from : $("#rto").value;
  return PT.buildReport(s, reportType, from, to);
}
function printReport(r) {
  document.querySelector(".reportprint")?.remove();
  document.querySelector("#printControls")?.remove();
  const holder = document.createElement("article");
  holder.className = "reportprint";
  holder.innerHTML = `<h1>${esc(r.band || "Próbaterem")} – ${esc(r.title)}</h1><p>${esc(r.from)} – ${esc(r.to)} · Készült: ${esc(r.created)}</p><p class="small">${r.to === ym(new Date()) ? "Az aktuális hónap pénzmozgásai a mai napig szerepelnek." : "Történeti hó végi állapot."}</p><table><thead><tr>${r.headers.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${r.rows.map((row) => `<tr>${row.map((v) => `<td class="${typeof v === "number" ? "num" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>${r.extra.length ? `<h2>Kiegészítő adatok</h2><table><tbody>${r.extra.map((row) => `<tr>${row.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}`;
  const controls = document.createElement("div");
  controls.id = "printControls";
  controls.className = "actions";
  controls.innerHTML =
    '<button onclick="window.print()">Nyomtatás / Mentés PDF-ként</button><button class="secondary" onclick="closePrint()">Vissza az alkalmazáshoz</button>';
  document.body.append(controls, holder);
  document.body.classList.add("printing");
  window.scrollTo(0, 0);
  // A nyomtatás külön felhasználói gombbal indul, Androidon sem vész el az előnézet.
}
function closePrint() {
  document.querySelector(".reportprint")?.remove();
  $("#printControls")?.remove();
  document.body.classList.remove("printing");
}
async function backup() {
  // A fájlválasztót közvetlenül a kattintásból kell indítani, await nélkül előtte.
  const name = `Probaterem_backup_${today()}.json`;
  try {
    let handle;
    if (typeof window.showSaveFilePicker === "function")
      handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "JSON biztonsági mentés",
            accept: { "application/json": [".json"] },
          },
        ],
      });
    const s = await state(),
      text = JSON.stringify(PT.backupObject(s), null, 2);
    if (handle) {
      const stream = await handle.createWritable();
      try {
        await stream.write(text);
        await stream.close();
      } catch (e) {
        await stream.abort().catch(() => {});
        throw e;
      }
      await PTDB.metadata({
        id: "last",
        value: new Date().toISOString(),
        method: "file-system-access",
      });
      toast(
        "A böngésző sikeresen visszaigazolta a fájlírást. Külön másolatot is őrizz meg!",
      );
    } else {
      download(text, name, "application/json");
      await PTDB.metadata({
        id: "lastAttempt",
        value: new Date().toISOString(),
      });
      toast(
        "Letöltés kezdeményezve. Ellenőrizd a fájlt; megőrzése nem igazolható.",
      );
    }
    await render();
  } catch (e) {
    if (e.name !== "AbortError") toast("Mentési hiba: " + e.message, true);
  }
}
function restoreDialog() {
  modal(
    `<h2>Teljes adatbázis visszaállítása</h2><div class="warning">Az import lecseréli a jelenlegi adatokat és naplót. Először készíts külső mentést. Az alkalmazás külön helyi védőmentést is készít, amely nem helyettesíti a letöltött fájlt.</div><button class="secondary primaryWide" onclick="backup()">Jelenlegi adatok mentése előbb</button><label for="restoreFile">Mentésfájl (.json)</label><input type="file" id="restoreFile" accept=".json,application/json"><div class="actions"><button class="dangerBtn" id="restoreConfirm">Visszaállítás</button><button class="secondary" onclick="closeModal()">Mégse</button></div>`,
  );
  $("#restoreConfirm").onclick = restore;
}
async function restore() {
  const button = $("#restoreConfirm");
  try {
    const file = $("#restoreFile").files[0];
    if (!file) throw Error("Válassz mentésfájlt");
    if (file.size > 30 * 1024 * 1024) throw Error("Túl nagy mentésfájl");
    const imported = PT.parseBackup(await file.text());
    if (
      !confirm(
        `Ellenőrzött mentés: ${imported.members.length} tag, ${imported.payments.length} befizetés. Az összes jelenlegi üzleti adatot lecseréljük. Folytatod?`,
      )
    )
      return;
    button.disabled = true;
    await PTDB.replace(imported);
    closeModal();
    view = "home";
    month = ym(new Date());
    reportFrom = month;
    reportTo = month;
    toast("Az adatbázis visszaállítva");
    await render();
  } catch (e) {
    toast("Visszaállítás sikertelen: " + e.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}
function backupReminder(s) {
  const last = s.backupMetadata.find((x) => x.id === "last")?.value,
    delay = s.backupMetadata.find((x) => x.id === "snooze")?.value,
    now = Date.now();
  if (
    (delay && Date.parse(delay) > now) ||
    (last && now - Date.parse(last) < 30 * 86400000)
  )
    return;
  const n = document.createElement("div");
  n.id = "backupNotice";
  n.className = "card";
  n.innerHTML = `<b>⚠ Biztonsági mentés ajánlott</b><p class="note">${last ? "Több mint 30 nap telt el az utolsó igazolt fájlírás óta." : "Nincs böngésző által igazolt mentés. Ha már letöltötted, ellenőrizd és őrizd meg a fájlt."}</p><div class="actions"><button id="doBackup">Mentés</button><button id="snoozeBackup" class="secondary">Halasztás 7 nappal</button></div>`;
  app.querySelector(".app").prepend(n);
  $("#doBackup").onclick = backup;
  $("#snoozeBackup").onclick = async () => {
    try {
      await PTDB.metadata({
        id: "snooze",
        value: new Date(now + 7 * 86400000).toISOString(),
      });
      n.remove();
    } catch (e) {
      toast(e.message, true);
    }
  };
}
async function safetyDialog() {
  try {
    const conn = await new Promise((res, rej) => {
      const r = indexedDB.open("probaterem-safety", 1);
      r.onupgradeneeded = () =>
        r.result.createObjectStore("snapshots", { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    let snapshots;
    try {
      snapshots = await new Promise((res, rej) => {
        const r = conn
          .transaction("snapshots")
          .objectStore("snapshots")
          .getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    } finally {
      conn.close();
    }
    modal(
      `<h2>Helyi védőmentések</h2><p class="note">Migráció vagy visszaállítás előtti teljes állapotok. A helyi adatokat egy böngészőadattörlés eltávolíthatja; töltsd le a szükséges példányt.</p>${
        snapshots
          .sort((a, b) => b.at.localeCompare(a.at))
          .map(
            (x, i) =>
              `<button class="secondary primaryWide" data-safety="${i}">${esc(new Date(x.at).toLocaleString("hu-HU"))} · ${esc(x.reason)}</button>`,
          )
          .join("") || "<p>Még nincs védőmentés.</p>"
      }<button class="outline primaryWide" onclick="closeModal()">Bezárás</button>`,
    );
    document.querySelectorAll("[data-safety]").forEach(
      (b) =>
        (b.onclick = () => {
          const s = snapshots[Number(b.dataset.safety)];
          download(
            JSON.stringify(
              {
                format: "probaterem-backup",
                version: s.tables.backupMetadata.some(
                  (x) => x.id === "appSchema" && x.value === 2,
                )
                  ? 2
                  : 1,
                created: s.at,
                tables: s.tables,
              },
              null,
              2,
            ),
            `Probaterem_vedomentes_${s.at.slice(0, 10)}.json`,
            "application/json",
          );
        }),
    );
  } catch (e) {
    toast(e.message, true);
  }
}
let swRegistration = null,
  applyUpdate = false,
  pwaMessage = "Az offline erőforrások ellenőrzése…";
function runtimeStatus() {
  let banner = $("#runtimeStatus");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "runtimeStatus";
    banner.className = "note runtime";
    banner.setAttribute("role", "status");
    document.body.append(banner);
  }
  banner.textContent = navigator.onLine
    ? pwaMessage
    : "Offline mód · helyi adatbázis";
  if (swRegistration?.waiting) {
    banner.textContent = "Új alkalmazásverzió érhető el. ";
    const b = document.createElement("button");
    b.textContent = "Frissítés betöltése";
    b.onclick = () => {
      if (
        $("#dialog") &&
        !confirm("A nyitott szerkesztő mentetlen adatai elvesznek. Frissítesz?")
      )
        return;
      applyUpdate = true;
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    };
    banner.append(b);
  }
  if ($("#pwaStatus")) $("#pwaStatus").textContent = pwaMessage;
}
async function checkUpdate() {
  try {
    await swRegistration?.update();
    toast(
      swRegistration
        ? "Frissítésellenőrzés elindítva"
        : "A PWA még nem regisztrált",
    );
    runtimeStatus();
  } catch (e) {
    toast("Frissítés: " + e.message, true);
  }
}
async function registerPWA() {
  if (!("serviceWorker" in navigator) || !isSecureContext) {
    pwaMessage = "Offline telepítéshez HTTPS és naprakész böngésző szükséges.";
    runtimeStatus();
    return;
  }
  try {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (applyUpdate) location.reload();
    });
    swRegistration = await navigator.serviceWorker.register("./sw.js");
    swRegistration.addEventListener("updatefound", () => {
      const w = swRegistration.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed") setTimeout(runtimeStatus, 0);
      });
    });
    let timer;
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error(
                  "Az offline előkészítés még nem fejeződött be. Ellenőrizd a kapcsolatot, majd töltsd újra az oldalt.",
                ),
              ),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    pwaMessage = "Offline erőforrások készen · 1.1";
    runtimeStatus();
  } catch (e) {
    pwaMessage = "Az offline előkészítés sikertelen: " + e.message;
    runtimeStatus();
  }
}
window.addEventListener("online", runtimeStatus);
window.addEventListener("offline", runtimeStatus);
window.addEventListener("unhandledrejection", (e) => {
  toast("Műveleti hiba: " + (e.reason?.message || e.reason), true);
});
async function init() {
  try {
    await PTDB.initialize();
    await render();
    registerPWA();
    navigator.storage?.persist?.().catch(() => {});
  } catch (e) {
    app.innerHTML = `<main class="app"><h1>Adatbázis-ellenőrzési hiba</h1><p class="warning">${esc(e.message)}</p><p>A meglévő üzleti adatokat nem írtuk felül. Készíts nyers mentést; az adatokat külön kell javítani.</p><button id="rawExport">Nyers helyi adatok kimentése</button><button class="secondary primaryWide" onclick="safetyDialog()">Helyi védőmentések</button></main>`;
    $("#rawExport").onclick = async () => {
      try {
        const s = await state();
        download(
          JSON.stringify(
            {
              format: "probaterem-backup",
              version: 1,
              created: new Date().toISOString(),
              tables: s,
            },
            null,
            2,
          ),
          `Probaterem_helyreallitas_${today()}.json`,
          "application/json",
        );
      } catch (err) {
        toast(err.message, true);
      }
    };
  }
}
init();
function bindForm(handler) {
  const form = $("#editForm");
  let saving = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    saving = true;
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await handler(e);
    } finally {
      saving = false;
      if (submit) submit.disabled = false;
    }
  };
}
