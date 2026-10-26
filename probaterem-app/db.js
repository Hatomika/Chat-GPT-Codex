/* Atomi ellenőrzés + üzleti írás + változásnapló egyetlen IndexedDB-tranzakcióban. */
(function (root) {
  "use strict";
  let db;
  const { TABLES, validateState } = PT;
  const uid = () => crypto.randomUUID();
  function open(name, stores) {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => {
        for (const t of stores)
          if (!r.result.objectStoreNames.contains(t))
            r.result.createObjectStore(t, { keyPath: "id" });
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () =>
        reject(
          Error("Zárd be az alkalmazás többi régi lapját, majd töltsd újra."),
        );
    });
  }
  async function connect() {
    db = await open("probaterem-db", TABLES);
    return db;
  }
  function run(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TABLES, mode),
        s = {},
        result = { value: undefined };
      let remaining = TABLES.length,
        reason;
      tx.oncomplete = () => resolve(result.value);
      tx.onerror = (event) => {
        reason = reason || event.target.error || tx.error;
      };
      tx.onabort = () =>
        reject(reason || tx.error || Error("Megszakított tranzakció"));
      for (const t of TABLES) {
        const r = tx.objectStore(t).getAll();
        r.onsuccess = () => {
          s[t] = r.result;
          if (--remaining === 0)
            try {
              result.value = fn(tx, s);
            } catch (e) {
              reason = e;
              tx.abort();
            }
        };
      }
    });
  }
  const state = () => run("readonly", (_, s) => s);
  const all = async (t) => (await state())[t];
  function commit(changes) {
    return run("readwrite", (tx, s) => {
      const next = structuredClone(s),
        logs = [];
      for (const c of changes) {
        if (
          !TABLES.includes(c.table) ||
          ["auditLog", "backupMetadata"].includes(c.table)
        )
          throw Error("Tiltott üzleti tábla");
        const old = next[c.table].find((x) => x.id === c.record.id) || null;
        if (
          Object.hasOwn(c, "before") &&
          JSON.stringify(old) !== JSON.stringify(c.before)
        )
          throw Error(
            "Az adat közben megváltozott egy másik ablakban. Nyisd meg újra a szerkesztést.",
          );
        if (c.kind === "create" && old) throw Error("A rekord már létezik");
        next[c.table] = next[c.table]
          .filter((x) => x.id !== c.record.id)
          .concat(c.record);
        logs.push({
          id: uid(),
          at: new Date().toISOString(),
          table: c.table,
          recordId: c.record.id,
          kind: c.kind || "update",
          before: old,
          after: c.record,
        });
      }
      validateState(next);
      for (const c of changes) tx.objectStore(c.table).put(c.record);
      for (const log of logs) tx.objectStore("auditLog").add(log);
    });
  }
  function metadata(item) {
    return run("readwrite", (tx, s) => {
      const next = structuredClone(s);
      next.backupMetadata = next.backupMetadata
        .filter((x) => x.id !== item.id)
        .concat(item);
      validateState(next);
      tx.objectStore("backupMetadata").put(item);
    });
  }
  async function safetySnapshot(s, reason) {
    // Külön DB: egy hibás import vagy későbbi visszaállítás sem írja felül.
    const safety = await open("probaterem-safety", ["snapshots"]);
    try {
      await new Promise((res, rej) => {
        const tx = safety.transaction("snapshots", "readwrite");
        tx.oncomplete = res;
        tx.onerror = (event) =>
          rej(tx.error || event.target.error || Error("Sikertelen védőmentés"));
        tx.onabort = () => rej(tx.error || Error("Sikertelen védőmentés"));
        tx.objectStore("snapshots").add({
          id: uid(),
          at: new Date().toISOString(),
          reason,
          tables: structuredClone(s),
        });
      });
    } finally {
      safety.close();
    }
  }
  async function replace(s) {
    validateState(s);
    // A védőmentéshez tartozó állapot nem változhat meg észrevétlenül.
    const before = await state();
    await safetySnapshot(before, "restore");
    return run("readwrite", (tx, current) => {
      if (JSON.stringify(before) !== JSON.stringify(current))
        throw Error(
          "Az adatbázis megváltozott a védőmentés óta. Ismételd meg a visszaállítást.",
        );
      validateState(s);
      for (const t of TABLES) {
        tx.objectStore(t).clear();
        for (const r of s[t]) tx.objectStore(t).add(r);
      }
      tx.objectStore("auditLog").add({
        id: uid(),
        at: new Date().toISOString(),
        table: "settings",
        recordId: "startMonth",
        kind: "restore-database",
        before: {
          recordCount: TABLES.reduce((n, t) => n + current[t].length, 0),
        },
        after: { recordCount: TABLES.reduce((n, t) => n + s[t].length, 0) },
      });
    });
  }
  async function initialize() {
    await connect();
    const s = await state();
    const empty = TABLES.every((t) => s[t].length === 0);
    if (empty) {
      await commit([
        {
          table: "settings",
          record: { id: "startMonth", value: PT.ym(new Date()) },
          kind: "create",
          before: null,
        },
        {
          table: "settings",
          record: { id: "bandName", value: "Zenekar" },
          kind: "create",
          before: null,
        },
      ]);
      await metadata({ id: "appSchema", value: 2 });
    } else if (
      !s.backupMetadata.some((x) => x.id === "appSchema" && x.value === 2)
    ) {
      await safetySnapshot(s, "before-1.1-migration");
      const migrated = PT.migrateV1(s);
      await run("readwrite", (tx, current) => {
        if (JSON.stringify(current) !== JSON.stringify(s))
          throw Error(
            "Migráció közben megváltozott adatok. Töltsd újra az alkalmazást.",
          );
        tx.objectStore("backupMetadata").clear();
        for (const x of migrated.backupMetadata)
          tx.objectStore("backupMetadata").put(x);
        tx.objectStore("auditLog").add({
          id: uid(),
          at: new Date().toISOString(),
          table: "backupMetadata",
          recordId: "appSchema",
          kind: "migrate-1.0-to-1.1",
          before: { value: 1 },
          after: { value: 2 },
        });
      });
    }
    validateState(await state());
  }
  root.PTDB = {
    connect,
    initialize,
    state,
    all,
    commit,
    metadata,
    replace,
    safetySnapshot,
  };
})(globalThis);
