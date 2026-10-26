/* Próbaterem 1.1 – tiszta, megosztott pénzügyi és validációs függvények. */
(function (root) {
  "use strict";
  const TABLES = [
    "settings",
    "members",
    "membershipPeriods",
    "rentalFees",
    "payments",
    "refunds",
    "landlordPayments",
    "auditLog",
    "backupMetadata",
  ];
  const MAX_MONEY = 1000000000;
  function localDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const today = () => localDate(new Date());
  const ym = (d) => localDate(d).slice(0, 7);
  function monthOK(m) {
    return (
      typeof m === "string" && /^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(m)
    );
  }
  function dateOK(d) {
    if (
      typeof d !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      !monthOK(d.slice(0, 7))
    )
      return false;
    const [y, m, day] = d.split("-").map(Number);
    return day >= 1 && day <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function nextMonth(m, n = 1) {
    if (!monthOK(m) || !Number.isInteger(n))
      throw Error("Érvénytelen hónapléptetés");
    const [y, mo] = m.split("-").map(Number),
      total = y * 12 + mo - 1 + n;
    const out = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
    if (!monthOK(out)) throw Error("Hónap kívül az 1900–9999 tartományon");
    return out;
  }
  function settingsValue(s, k, def) {
    return s.settings.find((x) => x.id === k)?.value ?? def;
  }
  const startMonth = (s) => settingsValue(s, "startMonth", ym(new Date()));
  function monthList(s, end = ym(new Date())) {
    const first = startMonth(s),
      list = [];
    if (!monthOK(first) || !monthOK(end))
      throw Error("Érvénytelen elszámolási időszak");
    for (let m = first; m <= end; ) {
      list.push(m);
      if (m === end) break;
      m = nextMonth(m);
    }
    return list;
  }
  const validMoney = (x) =>
    typeof x === "number" && Number.isSafeInteger(x) && x > 0 && x <= MAX_MONEY;
  function safe(n) {
    const b = typeof n === "bigint" ? n : BigInt(n);
    if (
      b > BigInt(Number.MAX_SAFE_INTEGER) ||
      b < BigInt(Number.MIN_SAFE_INTEGER)
    )
      throw Error("Az összesített összeg túl nagy");
    return Number(b);
  }
  function sum(items, fn = (x) => x) {
    return safe(items.reduce((a, x) => a + BigInt(fn(x)), 0n));
  }
  const periodActive = (s, id, m) =>
    s.membershipPeriods.some(
      (p) => p.memberId === id && p.start <= m && (!p.end || p.end >= m),
    );
  const activeMembers = (s, m) =>
    s.members
      .filter((p) => periodActive(s, p.id, m))
      .sort(
        (a, b) =>
          (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, "hu"),
      );
  const feeAt = (s, m) =>
    [...s.rentalFees]
      .filter((x) => x.start <= m)
      .sort((a, b) => b.start.localeCompare(a.start))[0]?.amount ?? 0;
  function monthly(s, m) {
    const persons = activeMembers(s, m),
      rental = feeAt(s, m),
      n = BigInt(persons.length);
    const share = n ? safe((BigInt(rental) + n - 1n) / n) : 0;
    return {
      persons,
      rental,
      share,
      extra: n ? safe(BigInt(share) * n - BigInt(rental)) : 0,
    };
  }
  function cutoff(m, asOf = today()) {
    if (!monthOK(m) || m > asOf.slice(0, 7))
      throw Error("Jövőbeli hónaphoz nincs tényleges elszámolás");
    return m === asOf.slice(0, 7)
      ? asOf
      : `${m}-${new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate()}`;
  }
  function moneyEvents(s, id, until) {
    return ["payments", "refunds"]
      .flatMap((t) =>
        s[t]
          .filter((p) => p.memberId === id && !p.voided && p.date <= until)
          .map((p) => ({
            ...p,
            type: t === "payments" ? "payment" : "refund",
            amount: t === "payments" ? p.amount : -p.amount,
          })),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.type === b.type
            ? a.id.localeCompare(b.id)
            : a.type === "payment"
              ? -1
              : 1),
      );
  }
  function owedAt(s, id, m) {
    return sum(monthList(s, m), (mm) =>
      periodActive(s, id, mm) ? monthly(s, mm).share : 0,
    );
  }
  function balanceAt(s, id, m, asOf = today()) {
    return safe(
      BigInt(sum(moneyEvents(s, id, cutoff(m, asOf)), (e) => e.amount)) -
        BigInt(owedAt(s, id, m)),
    );
  }
  function paidIn(s, id, m, asOf = today()) {
    const end = cutoff(m, asOf);
    return sum(
      s.payments.filter(
        (p) =>
          p.memberId === id &&
          !p.voided &&
          p.date.startsWith(m) &&
          p.date <= end,
      ),
      (p) => p.amount,
    );
  }
  function refundedIn(s, id, m, asOf = today()) {
    const end = cutoff(m, asOf);
    return sum(
      s.refunds.filter(
        (p) =>
          p.memberId === id &&
          !p.voided &&
          p.date.startsWith(m) &&
          p.date <= end,
      ),
      (p) => p.amount,
    );
  }
  function refundLimit(s, id, date, excludeId) {
    return safe(
      BigInt(
        sum(
          s.payments.filter(
            (p) => p.memberId === id && !p.voided && p.date <= date,
          ),
          (p) => p.amount,
        ),
      ) -
        BigInt(
          sum(
            s.refunds.filter(
              (p) =>
                p.id !== excludeId &&
                p.memberId === id &&
                !p.voided &&
                p.date <= date,
            ),
            (p) => p.amount,
          ),
        ) -
        BigInt(owedAt(s, id, date.slice(0, 7))),
    );
  }
  function validateRefunds(s) {
    for (const p of s.refunds.filter((x) => !x.voided))
      if (refundLimit(s, p.memberId, p.date, p.id) < p.amount)
        throw Error(
          `Visszafizetési ütközés: ${p.date}, ${p.amount} Ft. Előbb javítsd vagy érvénytelenítsd az érintett visszafizetést.`,
        );
  }
  // FIFO: a nettó jóváírás a legrégebbi havi kötelezettséget csökkenti.
  function allocation(s, id, m, asOf = today()) {
    let credit = BigInt(
      sum(moneyEvents(s, id, cutoff(m, asOf)), (e) => e.amount),
    );
    const rows = monthList(s, m)
      .filter((mm) => periodActive(s, id, mm))
      .map((mm) => {
        const due = BigInt(monthly(s, mm).share),
          used = credit > 0n ? (credit < due ? credit : due) : 0n;
        credit -= used;
        return {
          month: mm,
          due: safe(due),
          covered: safe(used),
          outstanding: safe(due - used),
        };
      });
    return { rows, credit: safe(credit > 0n ? credit : 0n) };
  }
  function landlordAt(s, m, asOf = today()) {
    return s.landlordPayments.find(
      (p) => p.month === m && p.paid && p.date <= cutoff(m, asOf),
    );
  }
  function assert(ok, message) {
    if (!ok) throw Error(message);
  }
  const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  const idOK = (x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x);
  const timestampOK = (x) =>
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(x) &&
    Number.isFinite(Date.parse(x));
  function validateShape(s) {
    assert(isObj(s), "Hiányzó adatbázis");
    assert(
      Object.keys(s).every((t) => TABLES.includes(t)),
      "Ismeretlen adattábla a mentésben",
    );
    for (const t of TABLES) {
      assert(Array.isArray(s[t]), `Hiányzó tábla: ${t}`);
      const ids = new Set();
      for (const r of s[t]) {
        assert(
          isObj(r) && idOK(r.id) && !ids.has(r.id),
          `Hibás vagy ismétlődő azonosító: ${t}`,
        );
        ids.add(r.id);
      }
    }
  }
  function validateState(s, asOf = today()) {
    validateShape(s);
    const cfg = Object.fromEntries(s.settings.map((x) => [x.id, x.value]));
    assert(
      monthOK(cfg.startMonth) && cfg.startMonth <= asOf.slice(0, 7),
      "Érvénytelen nyilvántartási kezdő hónap",
    );
    assert(
      typeof cfg.bandName === "string" && cfg.bandName.length <= 100,
      "Érvénytelen zenekarnév",
    );
    for (const r of s.settings)
      assert(["startMonth", "bandName"].includes(r.id), "Ismeretlen beállítás");
    const ids = new Set(s.members.map((m) => m.id));
    for (const m of s.members) {
      assert(
        typeof m.name === "string" &&
          m.name.trim().length > 0 &&
          m.name.length <= 80,
        "Érvénytelen tagnév",
      );
      assert(
        m.opening === undefined || m.opening === 0,
        "Nem támogatott nyitóegyenleg; kézi, naplózott korrekció szükséges",
      );
      assert(
        m.order === undefined ||
          (Number.isSafeInteger(m.order) && m.order >= 0),
        "Érvénytelen tagsorrend",
      );
    }
    for (const p of s.membershipPeriods)
      assert(
        ids.has(p.memberId) &&
          monthOK(p.start) &&
          p.start <= asOf.slice(0, 7) &&
          (p.end === null || (monthOK(p.end) && p.end >= p.start)),
        "Érvénytelen tagsági időszak vagy kapcsolat",
      );
    for (const id of ids) {
      const ps = s.membershipPeriods
        .filter((p) => p.memberId === id)
        .sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < ps.length; i++)
        assert(
          ps[i - 1].end !== null && ps[i - 1].end < ps[i].start,
          "Átfedő tagsági időszakok",
        );
    }
    const txIds = new Set();
    for (const t of ["payments", "refunds"])
      for (const p of s[t]) {
        assert(!txIds.has(p.id), "Ismétlődő pénzmozgás-azonosító");
        txIds.add(p.id);
        assert(
          ids.has(p.memberId) &&
            validMoney(p.amount) &&
            dateOK(p.date) &&
            p.date >= cfg.startMonth + "-01" &&
            p.date <= asOf &&
            typeof p.voided === "boolean" &&
            (p.note === undefined ||
              (typeof p.note === "string" && p.note.length <= 4000)),
          "Érvénytelen pénzmozgás, dátum vagy tagkapcsolat",
        );
      }
    const starts = new Set();
    for (const f of s.rentalFees) {
      assert(
        monthOK(f.start) && validMoney(f.amount) && !starts.has(f.start),
        "Érvénytelen vagy ismétlődő díjváltozás",
      );
      starts.add(f.start);
    }
    const months = new Set();
    for (const p of s.landlordPayments) {
      assert(
        monthOK(p.month) &&
          p.month >= cfg.startMonth &&
          p.month <= asOf.slice(0, 7) &&
          !months.has(p.month) &&
          typeof p.paid === "boolean",
        "Érvénytelen vagy ismétlődő tulajdonosi hónap",
      );
      months.add(p.month);
      assert(
        p.paid
          ? dateOK(p.date) &&
              p.date >= cfg.startMonth + "-01" &&
              p.date <= asOf &&
              validMoney(p.amount)
          : p.date === null && p.amount === 0,
        "Érvénytelen tulajdonosi kifizetés",
      );
    }
    for (const l of s.auditLog)
      assert(
        timestampOK(l.at) &&
          typeof l.kind === "string" &&
          l.kind.length <= 80 &&
          TABLES.includes(l.table) &&
          idOK(l.recordId) &&
          Object.hasOwn(l, "before") &&
          Object.hasOwn(l, "after") &&
          (l.before === null || isObj(l.before)) &&
          (l.after === null || isObj(l.after)),
        "Sérült változásnapló",
      );
    for (const x of s.backupMetadata) {
      assert(
        ["last", "legacyLast", "lastAttempt", "snooze", "appSchema"].includes(
          x.id,
        ),
        "Ismeretlen mentési metaadat",
      );
      assert(
        x.id === "appSchema" ? x.value === 2 : timestampOK(x.value),
        "Érvénytelen mentési metaadat",
      );
      if (x.id === "last")
        assert(
          x.method === "file-system-access",
          "A mentés nincs megbízhatóan visszaigazolva",
        );
    }
    validateRefunds(s);
    // Ellenőrizzük a biztonságos összegzést is.
    for (const m of s.members) balanceAt(s, m.id, asOf.slice(0, 7), asOf);
    return s;
  }
  function migrateV1(raw) {
    validateShape(raw);
    const s = structuredClone(raw);
    assert(isObj(s) && Array.isArray(s.backupMetadata), "Hiányos 1.0-s mentés");
    const last = s.backupMetadata.find((x) => x.id === "last");
    if (last) {
      s.backupMetadata = s.backupMetadata.filter(
        (x) => x.id !== "last" && x.id !== "legacyLast",
      );
      s.backupMetadata.push({ id: "legacyLast", value: last.value });
    }
    s.backupMetadata = s.backupMetadata.filter((x) => x.id !== "appSchema");
    s.backupMetadata.push({ id: "appSchema", value: 2 });
    return validateState(s);
  }
  function parseBackup(text) {
    assert(
      typeof text === "string" &&
        new TextEncoder().encode(text).length <= 30 * 1024 * 1024,
      "Túl nagy mentés (legfeljebb 30 MB)",
    );
    let b;
    try {
      b = JSON.parse(text);
    } catch {
      throw Error("Sérült JSON-fájl");
    }
    assert(
      isObj(b) &&
        b.format === "probaterem-backup" &&
        [1, 2].includes(b.version) &&
        timestampOK(b.created),
      "Nem támogatott mentésformátum vagy verzió",
    );
    return b.version === 1 ? migrateV1(b.tables) : validateState(b.tables);
  }
  function backupObject(s) {
    validateState(s);
    return {
      format: "probaterem-backup",
      version: 2,
      appVersion: "1.1",
      created: new Date().toISOString(),
      tables: structuredClone(s),
    };
  }
  function buildReport(s, type, from, to = from, asOf = today()) {
    assert(
      ["summary", "period", "ledger"].includes(type) &&
        monthOK(from) &&
        monthOK(to) &&
        from <= to &&
        from >= startMonth(s) &&
        to <= asOf.slice(0, 7),
      "Érvénytelen riportidőszak",
    );
    if (type === "summary") to = from;
    let headers,
      rows = [],
      extra = [];
    if (type !== "ledger") {
      headers = [
        ...(type === "period" ? ["Hónap"] : []),
        "Tag",
        "Aktív",
        "Havi tagdíj (Ft)",
        "Havi befizetés (Ft)",
        "Havi visszafizetés (Ft)",
        "Halmozott egyenleg (Ft)",
      ];
      for (const mm of monthList(s, to).filter((x) => x >= from)) {
        const data = monthly(s, mm),
          land = landlordAt(s, mm, asOf);
        for (const m of s.members)
          rows.push([
            ...(type === "period" ? [mm] : []),
            m.name,
            periodActive(s, m.id, mm) ? "Igen" : "Nem",
            periodActive(s, m.id, mm) ? data.share : 0,
            paidIn(s, m.id, mm, asOf),
            refundedIn(s, m.id, mm, asOf),
            balanceAt(s, m.id, mm, asOf),
          ]);
        extra.push(
          [mm, "Terembérleti díj (Ft)", data.rental],
          [mm, "Aktív tagok", data.persons.length],
          [mm, "Havi díj / fő (Ft)", data.share],
          [mm, "Kerekítési többlet (Ft)", data.extra],
          [mm, "Tulajdonosi státusz", land ? "Rendezve" : "Nincs rendezve"],
          [mm, "Kifizetés dátuma", land?.date || ""],
          [mm, "Tényleges kifizetés (Ft)", land?.amount || 0],
          [
            mm,
            "Eltérés (kifizetett − előírt) (Ft)",
            land ? land.amount - data.rental : 0,
          ],
        );
      }
    } else {
      headers = [
        "Azonosító",
        "Dátum",
        "Tag",
        "Művelet",
        "Összeg (Ft)",
        "Megjegyzés",
        "Állapot",
      ];
      rows = ["payments", "refunds"]
        .flatMap((t) => s[t].map((p) => ({ ...p, type: t })))
        .filter((p) => p.date >= from + "-01" && p.date <= cutoff(to, asOf))
        .sort(
          (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
        )
        .map((p) => [
          p.id,
          p.date,
          s.members.find((m) => m.id === p.memberId).name,
          p.type === "payments" ? "Befizetés" : "Visszafizetés",
          p.type === "payments" ? p.amount : -p.amount,
          p.note || "",
          p.voided ? "Érvénytelen" : "Érvényes",
        ]);
    }
    return {
      title: {
        summary: "Havi állapot",
        period: "Időszaki elszámolás",
        ledger: "Befizetési napló",
      }[type],
      band: settingsValue(s, "bandName", "Zenekar"),
      from,
      to,
      headers,
      rows,
      extra,
      created: asOf,
    };
  }
  const api = {
    TABLES,
    localDate,
    today,
    ym,
    monthOK,
    dateOK,
    nextMonth,
    settingsValue,
    startMonth,
    monthList,
    validMoney,
    safe,
    sum,
    periodActive,
    activeMembers,
    feeAt,
    monthly,
    cutoff,
    moneyEvents,
    owedAt,
    balanceAt,
    paidIn,
    refundedIn,
    refundLimit,
    validateRefunds,
    allocation,
    landlordAt,
    validateState,
    migrateV1,
    parseBackup,
    backupObject,
    buildReport,
  };
  root.PT = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
