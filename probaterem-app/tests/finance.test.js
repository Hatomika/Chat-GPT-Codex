"use strict";
const { test } = require("node:test");
const a = require("node:assert/strict");
const F = require("../core.js");
function fixture(n = 1, fee = 10000) {
  const s = Object.fromEntries(F.TABLES.map((t) => [t, []]));
  s.settings = [
    { id: "startMonth", value: "2026-01" },
    { id: "bandName", value: "Tesztzenekar" },
  ];
  s.members = Array.from({ length: n }, (_, i) => ({
    id: "m" + i,
    name: "Tag " + i,
    opening: 0,
    order: i,
  }));
  s.membershipPeriods = s.members.map((m) => ({
    id: "t" + m.id,
    memberId: m.id,
    start: "2026-01",
    end: null,
  }));
  s.rentalFees = [{ id: "fee", start: "2026-01", amount: fee }];
  return s;
}
const pay = (s, amount, date = "2026-01-15", id = "p", memberId = "m0") =>
  s.payments.push({ id, memberId, amount, date, note: "", voided: false });
const refund = (s, amount, date = "2026-01-20", id = "r") =>
  s.refunds.push({ id, memberId: "m0", amount, date, note: "", voided: false });
test("01 Pontos havi befizetés", () => {
  let s = fixture();
  pay(s, 10000);
  a.equal(F.balanceAt(s, "m0", "2026-01"), 0);
});
test("02 Részleges befizetés", () => {
  let s = fixture();
  pay(s, 4000);
  a.equal(F.balanceAt(s, "m0", "2026-01"), -6000);
});
test("03 Több hónapra előre fizetés", () => {
  let s = fixture();
  pay(s, 30000);
  a.equal(F.balanceAt(s, "m0", "2026-03"), 0);
});
test("04 Későbbi rendezés nem változtatja meg a történeti egyenleget", () => {
  let s = fixture();
  pay(s, 20000, "2026-02-15");
  a.equal(F.balanceAt(s, "m0", "2026-01"), -10000);
  a.equal(F.balanceAt(s, "m0", "2026-02"), 0);
});
test("05 Túlfizetés továbbvitele és legrégebbi tartozás", () => {
  let s = fixture();
  pay(s, 15000);
  a.deepEqual(
    F.allocation(s, "m0", "2026-02").rows.map((x) => x.outstanding),
    [0, 5000],
  );
  a.equal(F.balanceAt(s, "m0", "2026-01"), 5000);
});
test("06 Korábbi befizetés módosítása (összeg, dátum, tag)", () => {
  let s = fixture(2, 20000);
  pay(s, 20000);
  s.payments[0].amount = 30000;
  a.equal(F.balanceAt(s, "m0", "2026-02"), 10000);
  s.payments[0].date = "2026-02-01";
  a.equal(F.balanceAt(s, "m0", "2026-01"), -10000);
  s.payments[0].memberId = "m1";
  a.equal(F.balanceAt(s, "m0", "2026-02"), -20000);
  a.equal(F.balanceAt(s, "m1", "2026-02"), 10000);
});
test("07 Érvénytelenítés", () => {
  let s = fixture();
  pay(s, 10000);
  s.payments[0].voided = true;
  a.equal(F.balanceAt(s, "m0", "2026-01"), -10000);
});
test("08 Érvénytelenítés visszavonása", () => {
  let s = fixture();
  pay(s, 10000);
  s.payments[0].voided = true;
  s.payments[0].voided = false;
  a.equal(F.balanceAt(s, "m0", "2026-01"), 0);
});
test("09 Tagsági időszak módosítása és átfedés", () => {
  let s = fixture(2);
  s.membershipPeriods[1].start = "2026-02";
  a.equal(F.monthly(s, "2026-01").share, 10000);
  s.membershipPeriods.push({
    id: "overlap",
    memberId: "m0",
    start: "2026-01",
    end: null,
  });
  a.throws(() => F.validateState(s), /Átfedő/);
});
test("10 Kilépett tag későbbi tartozásrendezése", () => {
  let s = fixture();
  s.membershipPeriods[0].end = "2026-01";
  pay(s, 10000, "2026-03-01");
  a.equal(F.balanceAt(s, "m0", "2026-03"), 0);
  a.equal(F.buildReport(s, "summary", "2026-03").rows[0][3], 10000);
});
test("11 Új tag belépése", () => {
  let s = fixture(2);
  s.membershipPeriods[1].start = "2026-02";
  a.equal(F.monthly(s, "2026-02").share, 5000);
  a.equal(F.balanceAt(s, "m1", "2026-02"), -5000);
});
test("12 Korábbi tag visszalépése", () => {
  let s = fixture();
  s.membershipPeriods[0].end = "2026-01";
  s.membershipPeriods.push({
    id: "return",
    memberId: "m0",
    start: "2026-03",
    end: null,
  });
  F.validateState(s);
  a.equal(F.balanceAt(s, "m0", "2026-03"), -20000);
});
test("13 Részleges túlfizetés-visszafizetés", () => {
  let s = fixture();
  pay(s, 20000);
  refund(s, 4000);
  F.validateState(s);
  a.equal(F.balanceAt(s, "m0", "2026-01"), 6000);
});
test("14 Teljes túlfizetés-visszafizetés, ugyanazon a napon több tétel", () => {
  let s = fixture();
  pay(s, 20000);
  refund(s, 4000);
  refund(s, 6000, "2026-01-20", "r2");
  F.validateState(s);
  a.equal(F.balanceAt(s, "m0", "2026-01"), 0);
});
test("15 Túl nagy visszafizetés elutasítása", () => {
  let s = fixture();
  pay(s, 20000);
  refund(s, 10001);
  a.throws(() => F.validateState(s), /ütközés/);
});
test("16 Visszamenőleges változás miatti visszafizetési ütközés", () => {
  let s = fixture();
  pay(s, 20000);
  refund(s, 10000);
  s.payments[0].amount = 19000;
  a.throws(() => F.validateState(s), /ütközés/);
  s.payments[0].amount = 20000;
  s.rentalFees[0].amount = 11000;
  a.throws(() => F.validateState(s), /ütközés/);
});
test("17 Visszamenőleges díjváltozás", () => {
  let s = fixture();
  s.rentalFees.push({ id: "newFee", start: "2026-02", amount: 12000 });
  a.equal(F.balanceAt(s, "m0", "2026-03"), -34000);
  s.rentalFees[0].amount = 11000;
  a.equal(F.balanceAt(s, "m0", "2026-03"), -35000);
});
test("18 Felfelé kerekítés 61001 / 4", () => {
  let s = fixture(4, 61001);
  a.equal(F.monthly(s, "2026-01").share, 15251);
  a.equal(F.monthly(s, "2026-01").extra, 3);
});
test("19 Nulla aktív tag", () => {
  let s = fixture(0, 61001);
  a.equal(F.monthly(s, "2026-01").share, 0);
  a.equal(F.monthly(s, "2026-01").extra, 0);
  F.validateState(s);
});
test("20 Tulajdonosi állapot, történeti dátum, tényleges összeg megőrzése", () => {
  let s = fixture();
  s.landlordPayments.push({
    id: "owner",
    month: "2026-01",
    paid: true,
    date: "2026-02-01",
    amount: 10000,
  });
  a.equal(F.landlordAt(s, "2026-01"), undefined);
  s.landlordPayments[0].date = "2026-01-31";
  s.rentalFees[0].amount = 12000;
  a.equal(F.landlordAt(s, "2026-01").amount, 10000);
  s.landlordPayments[0] = {
    id: "owner",
    month: "2026-01",
    paid: false,
    date: null,
    amount: 0,
  };
  a.equal(F.landlordAt(s, "2026-01"), undefined);
  F.validateState(s);
});
test("21–22 Teljes mentés és visszaolvasás", () => {
  let s = fixture();
  pay(s, 20000);
  refund(s, 5000);
  a.deepEqual(F.parseBackup(JSON.stringify(F.backupObject(s))), s);
});
test("23 Sérült, hiányos, inkompatibilis import", () => {
  a.throws(() => F.parseBackup("{"));
  a.throws(() =>
    F.parseBackup(
      JSON.stringify({
        format: "probaterem-backup",
        version: 99,
        created: new Date().toISOString(),
        tables: fixture(),
      }),
    ),
  );
  let s = fixture();
  delete s.payments;
  a.throws(() => F.backupObject(s));
});
test("24–25 Közös riportadatok: minden tag, numerikus pénzek, visszafizetés", () => {
  let s = fixture();
  pay(s, 20000);
  refund(s, 4000);
  let r = F.buildReport(s, "summary", "2026-01");
  a.deepEqual(r.rows[0], ["Tag 0", "Igen", 10000, 20000, 4000, 6000]);
  a.equal(typeof r.extra[0][2], "number");
  a.equal(F.buildReport(s, "ledger", "2026-01").rows.length, 2);
});
test("28 Napló és 29 verziózott 1.0 migráció adatvesztés nélkül", () => {
  let s = fixture();
  s.backupMetadata = [{ id: "last", value: "2026-01-01T00:00:00.000Z" }];
  s.auditLog = [
    {
      id: "a",
      at: new Date().toISOString(),
      kind: "create",
      table: "members",
      recordId: "m0",
      before: null,
      after: s.members[0],
    },
  ];
  let out = F.migrateV1(s);
  a.deepEqual(out.auditLog, s.auditLog);
  a.equal(
    out.backupMetadata.find((x) => x.id === "legacyLast").value,
    s.backupMetadata[0].value,
  );
  a.ok(!out.backupMetadata.some((x) => x.id === "last"));
  a.deepEqual(out.members, s.members);
});
test("Hónapléptetés: évváltás, szökőév, időzónától független", () => {
  a.equal(F.nextMonth("2026-01"), "2026-02");
  a.equal(F.nextMonth("2025-12"), "2026-01");
  a.equal(F.nextMonth("2026-01", -1), "2025-12");
  a.equal(F.monthList(fixture(), "2026-03").length, 3);
  a.ok(F.dateOK("2024-02-29"));
  a.ok(!F.dateOK("2026-02-29"));
  a.ok(!F.monthOK("2026-99"));
});
test("Mai határ, jövőbeli import elutasítása", () => {
  let s = fixture();
  pay(s, 10000, "2026-01-20");
  a.equal(F.balanceAt(s, "m0", "2026-01", "2026-01-15"), -10000);
  a.throws(() => F.validateState(s, "2026-01-15"));
});
test("Séma: típushibák, XSS azonosító, duplikáció, hibás kapcsolat és napló", () => {
  for (const change of [
    (s) => (s.members[0].id = "x' onclick='evil"),
    (s) => (s.members[0].name = {}),
    (s) => (s.rentalFees[0].amount = "10000"),
    (s) => (s.rentalFees[0].start = "2026-99"),
    (s) => s.members.push({ ...s.members[0] }),
    (s) => (s.membershipPeriods[0].memberId = "missing"),
    (s) => s.auditLog.push({ id: "bad" }),
    (s) => (s.members[0].opening = 10),
  ]) {
    let s = fixture();
    change(s);
    a.throws(() => F.validateState(s));
  }
});
module.exports = { fixture, pay, refund };

test("A migráció sem rejthet el sérült metaadat-azonosítókat", () => {
  const s = fixture();
  s.backupMetadata = [
    { id: "last", value: "2026-01-01T00:00:00.000Z" },
    { id: "last", value: "2026-02-01T00:00:00.000Z" },
  ];
  a.throws(() => F.migrateV1(s), /ismétlődő/);
});
