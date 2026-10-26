/* node demo/generate-demo.js – kizárólag külön JSON-fájlt készít, nincs adatbázisírás. */
const F = require("../core.js"),
  fs = require("node:fs"),
  path = require("node:path");
const s = Object.fromEntries(F.TABLES.map((t) => [t, []]));
s.settings = [
  { id: "bandName", value: "Demózenekar – Próbaterem" },
  { id: "startMonth", value: "2026-01" },
];
s.members = ["Kovács Anna", "Nagy Béla", "Szabó Csilla", "Tóth Dániel"].map(
  (name, i) => ({ id: "demo-member-" + i, name, order: i, opening: 0 }),
);
s.membershipPeriods = s.members.map((m, i) => ({
  id: "demo-period-" + i,
  memberId: m.id,
  start: "2026-01",
  end: i === 3 ? "2026-02" : null,
}));
s.membershipPeriods.push({
  id: "demo-return",
  memberId: s.members[3].id,
  start: "2026-04",
  end: null,
});
s.rentalFees = [
  { id: "demo-fee-1", start: "2026-01", amount: 61001 },
  { id: "demo-fee-2", start: "2026-04", amount: 64000 },
];
let n = 0;
function pay(i, date, amount, note) {
  s.payments.push({
    id: "demo-payment-" + ++n,
    memberId: s.members[i].id,
    date,
    amount,
    note,
    voided: false,
  });
}
pay(0, "2026-01-05", 50000, "Előrefizetés több hónapra");
pay(1, "2026-01-10", 15251, "Januári pontos befizetés");
pay(2, "2026-01-12", 8000, "Részleges befizetés");
pay(3, "2026-01-15", 15251, "Januári befizetés");
pay(1, "2026-02-10", 15251, "Februári befizetés");
pay(2, "2026-02-12", 22502, "Korábbi hátralék és februári díj");
pay(3, "2026-03-05", 15251, "Kilépés után februári tartozás rendezése");
pay(0, "2026-03-06", 30000, "Túlfizetés továbbvezetése");
pay(1, "2026-03-10", 20334, "Március: három aktív tag");
pay(2, "2026-03-12", 20334, "Márciusi befizetés");
for (let i = 0; i < 4; i++) pay(i, "2026-04-10", 16000, "Áprilisi befizetés");
pay(1, "2026-04-15", 1000, "Téves tétel – érvénytelenítve");
s.payments.at(-1).voided = true;
s.refunds = [
  {
    id: "demo-refund-1",
    memberId: s.members[0].id,
    date: "2026-01-25",
    amount: 10000,
    note: "Részleges túlfizetés visszaadása",
    voided: false,
  },
];
s.landlordPayments = [
  {
    id: "demo-owner-1",
    month: "2026-01",
    paid: true,
    date: "2026-01-20",
    amount: 61001,
  },
  {
    id: "demo-owner-2",
    month: "2026-02",
    paid: true,
    date: "2026-02-20",
    amount: 61001,
  },
  { id: "demo-owner-3", month: "2026-03", paid: false, date: null, amount: 0 },
];
s.backupMetadata = [{ id: "appSchema", value: 2 }];
for (const table of F.TABLES.filter(
  (t) => !["auditLog", "backupMetadata"].includes(t),
))
  for (const r of s[table])
    s.auditLog.push({
      id: "demo-audit-" + s.auditLog.length,
      at: "2026-04-20T12:00:00.000Z",
      table,
      recordId: r.id,
      kind: "demo-create",
      before: null,
      after: structuredClone(r),
    });
s.auditLog.push({
  id: "demo-void-log",
  at: "2026-04-20T12:01:00.000Z",
  table: "payments",
  recordId: s.payments.at(-1).id,
  kind: "void",
  before: { ...s.payments.at(-1), voided: false },
  after: structuredClone(s.payments.at(-1)),
});
fs.writeFileSync(
  path.join(__dirname, "demo-adatok.json"),
  JSON.stringify(F.backupObject(s), null, 2) + "\n",
);
console.log(
  "Demó létrehozva és validálva: 4 tag, 15 befizetés, 1 visszafizetés, 2026. január–április.",
);
