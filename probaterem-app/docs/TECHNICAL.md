# Fejlesztői és adatmodell-leírás

## Futás és fájlok

Build nélküli HTML/CSS/JavaScript. Betöltési sorrend: core.js → db.js → exports.js → app.js, mindegyik defer. A core modul Node alatt is futtatható; böngészőben `PT` névtéren érhető el, az adatbázis `PTDB` alatt. A képernyők az 1.0 kódjából fejlődtek tovább, a külső eseménykezelők ezért hagyományos globális függvények. Kiszolgálás közben nincs külső hálózati függőség. HTTPS szükséges az éles PWA-hoz.

## Sémák

Az eredeti `probaterem-db` nevű IndexedDB 1-es fizikai verzióját és kilenc adattárát tartjuk meg. Minden tár kulcsa `id`. A tartalmi séma `backupMetadata` / `appSchema` / `value: 2`; a mentés `version: 2`.

| Tár | Üzleti tartalom |
|---|---|
| settings | `startMonth` és `bandName`, `{id,value}` |
| members | `{id,name,order,opening:0}` – a stabil azonosító kapcsolja a pénzmozgásokat |
| membershipPeriods | `{id,memberId,start,end}` – a záró hónap inkluzív, null = folyamatos |
| rentalFees | `{id,start,amount}` – egy hónaphoz legfeljebb egy díj, érvényes a következőig |
| payments | `{id,memberId,date,amount,note,voided}` |
| refunds | a payments mezői, az összeg pozitív, a számításban levonás |
| landlordPayments | `{id,month,paid,date,amount}`; paid=false esetén date=null, amount=0 |
| auditLog | `{id,at,table,recordId,kind,before,after}` – nincs UI-szerkesztés/törlés |
| backupMetadata | appSchema, last, lastAttempt, legacyLast, snooze; last esetén method=file-system-access |

Minden befizetés és visszafizetés azonosítója együtt is egyedi; UUID-k generálódnak. Név és megjegyzés HTML-kódolást kap. Azonosítókhoz szűk ASCII-ábécét használunk, így attribútumban és inline eseményhívásban sem törhető meg a határ. Importban a teljes táblaszerkezetet ellenőrizzük, nem pusztán a JSON parse sikerét.

## Tranzakciók és versenyhelyzetek

A `PTDB.commit` egyetlen readwrite tranzakciót nyit az üzleti táblákra és az auditnaplóra. Minden tábla `getAll` kérése ugyanebben a tranzakcióban fut. Az utolsó `onsuccess` callbackben szinkronban készül a jelölt állapot és a validáció; ezt követik az írások. Nincs aszinkron await a tranzakción belül, ami idő előtti autocommitet okozna. Az egész readwrite készlet egymással versengő módosításait IndexedDB sorosítja. Tranzakcióhiba esetén az üzleti és auditírás is visszagörgetődik.

A dialógus a betöltött rekordot `before` feltételként adja át. Ha másik ablak közben módosította, a mentést elutasítjuk; a felhasználó újra megnyitja a szerkesztőt. Ez a mezők csendes elvesztését védi. A read-only pillanatkép is egyetlen tranzakció. Többeszközös adatösszefésülés nincs.

A teljes visszaállításnál először külön `probaterem-safety` adatbázisba kerül egy teljes, időbélyegzett pillanatkép. A csere előtt a fő adatbázis még egyszer összehasonlítódik a védőmentés alapjával. Ha közben változott, nincs felülírás. Védőmentés nélküli csere nincs. A védőmentések tára `snapshots`, automatikus törlési szabály nincs. A fő adatbázis JSON-mentésének nem részei a külön védőmentési előzmények.

## Pénzügyi idő és aritmetika

A hónapléptetés egész hónapindexen alapul; a helyi időpontot nem konvertáljuk UTC-hónappá. A dátum üzleti naptári nap, nem UTC-időpont. Az audit időpontja ISO UTC.

A havi teljes előírás az aktív tagoknál a hónap első napján lép fel. A tárolt pozitív pénzösszeg biztonságos egész Number, tételenként legfeljebb egymilliárd. Az osztás, felfelé kerekítés és az összesítés BigInt köztes értékekkel történik; veszélyes Number tartományt nem engedünk visszaadni.

A nettó pénzmozgás a legrégebbi havi kötelezettségeket fedezi (FIFO), a fennmaradó nettó jóváírás túlfizetés. Ez nem külön pénztár és nem fizikai banki allokációs táblázat. A havi riport a tényleges dátum szerint mutat befizetést, a FIFO-részletezés pedig azt, mely korábbi előírás fedezett a kiválasztott határnapig.

Minden visszafizetésnél az adott napig beérkezett befizetést, minden korábbi/azonos napi érvényes visszafizetést és a havi előírásokat ellenőrizzük. Napon belüli sorrend nincs: aznapi befizetés aznapi visszafizetést is fedezhet. Visszamenőleges módosítás után valamennyi aktív visszafizetést újból ellenőrizzük.

## Mentés és migráció

A `parseBackup` legfeljebb 30 MB-ot kezel. `format: probaterem-backup`, `created` ISO-idő, `tables` teljes táblakészlet. Az 1-es verzió klónozott példányon migrálódik; a nem igazolt last → legacyLast, a marker 2 lesz, a többi üzleti rekord és audit megmarad. A 2-es verzió közvetlen, teljes validációt kap.

A helyi 1.0-s adatbázis migrációja csak ellenőrzött és védőmentett állapotból indul. Érvénytelen adatnál nincs üzleti átírás. A fizikai DB-verziót nem emeljük, mert nincs új adattár vagy index. Ez nem teszi a régi 1.0-s kódot biztonságossá: frissítéskor a régi lapokat be kell zárni.

A visszaállításkor az importált napló teljes egészében megmarad, és egy restore-database bejegyzés adódik hozzá. A régi helyi állapot a külön védőmentési DB-ben marad. Ez nem kriptográfiai naplóvédelem.

## Export és PWA

XLSX: saját tárolt ZIP-bejegyzések CRC32-vel és OOXML-munkafüzettel; a szöveg inlineStr, a szám `<v>` cella. Nincs képletkiértékelés vagy külső link. Az XML-hez nem használható vezérlőkarakterek eltávolítódnak az exportban, az üzleti adat nem változik.

PDF: közös riportobjektum → kódolt HTML-táblázat → helyi böngészőnyomtatás. A felhasználó külön indítja a nyomtatást. Az előnézet megmarad megszakításkor is. A böngésző PDF-fájlja automatizálva ellenőrzött; a natív Android-nyomtatóablak nem.

A Service Worker `cache: reload` kérésekkel frissen tölti le a teljes új erőforráskészletet (ne örökölje az előző kiadás HTTP-cache-ét), a cache neve scope + kiadás. Nem törli más alkalmazások tárait. Saját frissítésnél az új worker várakozik; a felhasználói gomb SKIP_WAITING üzenetet küld, majd controllerchange újratölti a lapot. Következő kiadásnál a `CACHE` verzióját növelni kell. Felhasználói pénzügyi adatot a Service Worker nem tárol és nem exportál.

## Továbbfejlesztés

A pénzügyi szerződéseket a tests/finance.test.js, a tárolási/felületi szerződéseket a tests/browser_test.py ellenőrzi. Módosítás után ezeket futtasd. A cloud task már izolált környezetben fut: a meglévő checkoutot használd; csak kifejezett kérésre hozz létre Git worktree-t. A jelenlegi csomag nem került automatikusan GitHubra vagy nyilvános tárhelyre.
