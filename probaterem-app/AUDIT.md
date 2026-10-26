# Az 1.0-s változat átvizsgálása

Forrás: a kapott `probaterem-nyilvantarto-1.0.zip` összes fájlja; 2026-10-26.
A hivatkozott sorszámok az eredeti, tömörített `app.js` sorai. Ez statikus kódvizsgálat és célzott reprodukció; nem a korábbi fejlesztő állításainak átvétele.

| ID | Súlyosság | Érintett hely | Reprodukció / következmény | Javítás az 1.1-ben |
|---|---|---|---|---|
| A01 | kritikus | app.js:6, nextMonth | Europe/Budapest alatt `new Date(2026,1,1).toISOString().slice(0,7)` = 2026-01. A 2026-01 → következő hónap nem lép tovább; monthList végtelen ciklussal lefagyaszthatja a felületet. | Naptári egész hónapindex, UTC-konverzió nélkül; időzónatesztek. |
| A02 | magas | app.js:66–67, backup | A letöltés megszakítása után is beíródik a `last`; a felirat visszaigazolt mentést állít és elnyomja az emlékeztetőt. | Csak sikeres File System Access írás/zárás után igazolt mentés. Letöltési tartalékútnál csak kezdeményezés. A régi `last` nem bizonyíték, `legacyLast` lesz. |
| A03 | kritikus | app.js:16,29,47,52 | Két ablak ugyanazt a túlfizetést párhuzamos visszafizetéshez ellenőrzi. Az ellenőrzés és írás külön tranzakció; együtt túl nagy visszafizetés maradhat. A tag+időszak felvétel is előzetes pillanatképet használ. | Minden változás: teljes konzisztens olvasás, validáció, üzleti írás és audit egyetlen sorosított readwrite tranzakcióban. Elavult szerkesztés elutasítása. |
| A04 | kritikus | app.js:30–32,69 | Importban hibás hónap (`2026-99`), név helyett objektum, szöveges pénzösszeg, hibás tulajdonosi rekord vagy hiányzó beállítás átjuthat. ID-k csak stringként ellenőrzöttek, HTML-es attribútumba kerülhetnek. | Típus-, tartomány-, egyediség-, kapcsolat-, hónap-, dátum- és auditvalidáció; biztonságos azonosítók; mindez írás és import előtt. |
| A05 | magas | app.js:26,38,41,56 | Az adott hónap minden pénzmozgása beszámít a mai nap utánra dátumozott importból is; a havi státusz egy későbbi hónapban kifizetett bérletet korábban rendezettként mutathatja. | Mai napig vágás a jelen hónapban, tényleges hóvége korábban; jövőbeli pénzmozgás elutasítása; történeti tulajdonosi státusz. |
| A06 | magas | app.js:38,50,56 | Korábbi teremdíj átírása után az eredeti kifizetett összeg ugyan megmarad, de a főoldal nem figyelmeztet eltérésre. | Eltérés figyelmeztetése és számszerű megjelenítése a főoldalon és riportokban. |
| A07 | közepes | app.js:42–43 | A befizetési naplóban csak tagszűrő van, időszakszűrő nincs. | Kezdő- és záródátum, tagszűrő; üres eredmény jelzése. |
| A08 | magas | app.js:56 | Havi/időszaki riport csak aktív tagokat tartalmaz. Kilépett tag későbbi befizetése és megmaradt tartozása/túlfizetése kimarad; havi visszafizetés sem szerepel. | Minden tag, aktivitás, előírás, befizetés, visszafizetés, záróegyenleg; közös számítás a UI-val. |
| A09 | közepes | app.js:56,64 | Az időszaki kiegészítő pénzadatok összefűzött szövegként szerepelnek Excelben. Az XML érvénytelen vezérlőkarakterekre nincs felkészítve; nincs exportteszt. | Minden pénzadat numerikus cella, XML-tisztítás, fehérkarakter-megőrzés; független openpyxl-beolvasás. A meglévő ZIP/OOXML export megtartható. |
| A10 | közepes | app.js:58, style.css print | PDF valójában nyomtatás; hosszú szöveg nincs korlátozva/tördelve, nincs exportelőnézet és ellenőrzött PDF. Egyperces időzített eltávolítás zavarhat hosszú nyomtatáskor. | Stabil, bezárható nyomtatási előnézet; ismétlődő táblafejléc, tördelés. Az engedélyezett „Mentés PDF-ként” út dokumentálva; Chromium PDF valóban ellenőrizve. |
| A11 | magas | sw.js | Az aktiválás minden más eredetbeli cache-t töröl, más alkalmazásét is. skipWaiting + claim kérdés nélkül válthat vegyes verzióra; az addAll régi HTTP-cache fájlokat is örökölhet. Hibák elnyelve. | Saját, scope-hoz kötött cache; csak saját előző verziók takarítása; frissítés felhasználói gombbal; offline állapot és hiba kijelzése; friss erőforrás-kérések cache:reload móddal. |
| A12 | közepes | manifest.webmanifest | Csak SVG ikon van, raszteres 192/512 nincs; Android telepíthetőség eszközfüggő. | Helyi PNG ikonok 192/512 méretben, külön maskable ikon. |
| A13 | magas | app.js:69, init | Visszaállítás atomi, de nincs előzetes automatikus helyi védőmentés vagy verziózott tartalmi migráció. Elhibázott csere a régi naplót is felülírja. | Külön adatbázisban teljes védőmentés migráció/import előtt; előzetes exportgomb, megerősítés, verziózott import, restore-audit; ellenőrzési hiba esetén nincs csere. |
| A14 | közepes | style.css, modal | 7px függőleges paddinges naplógombok 44px alatt; hosszú név/nagy összeg kilóghat, dialógus fókusz és Escape-kezelés hiányzik. | Minimum 44px célméret, tördelés, mobil grid, görgethető dialógus, fókusz-visszaállítás és billentyűkezelés. |
| A15 | közepes | teljes csomag | Nincs automatizált teszt vagy tényleges tesztjelentés; pénzügyi/import/offline regressziók észrevétlenek. | Node pénzügyi és valódi Chromium/IndexedDB tesztek; exportfüggetlen ellenőrzés, dokumentált korlátok. |
| A16 | közepes | app.js:9,22,26 | Tranzakciónként van felső korlát, de összesített safe-integer ellenőrzés nincs. Pénzügyi előírásnál lebegőpontos osztás/kerekítés. Nem nulla rejtett `opening` importból megváltoztatja a specifikált egyenletet. | BigInt köztes egész aritmetika, biztonságos Number tárolás, nem nulla rejtett nyitóegyenleg elutasítása adatvesztés nélkül. |
| A17 | közepes | app.js:12, transaction | Egy IndexedDB-kérés hibája a tranzakció error eseményében még null tx.error-t adhat. A Promise null értékkel utasítható el, emiatt az e.message hibajelzés is elromolhat. | A kérés hibaobjektumának megőrzése és az abort eseményben történő végső elutasítás. Valódi ConstraintError és rollback tesztelve. |

## Megőrzött, ellenőrzött megoldások

- A képernyők és sötét vizuális kialakítás használható alapot adnak; nincs ok teljes újraírásra vagy keretrendszerre.
- A befizetés és audit írása eredetileg is közös tranzakcióban volt, de a megelőző ellenőrzés nem: ezt a különbséget A03 kezeli.
- Az érvénytelenítés logikai jelölés, nem törlés; megmarad.
- Az egyenleg alapelve (befizetés − előírás − visszafizetés) helyes, de a dátumhatár, adattisztaság és tesztelés javítandó.
- A visszafizetés korlátját a meglévő kód is ellenőrzi, de hibás/versengő állapot ellen nem teljes körűen.
- Az Excel valódi OOXML/ZIP, nem átnevezett CSV; a saját, függőség nélküli export megtartható.
- A nyomtatási PDF-út a követelményleírás által megengedett megoldás; a korlátját világosan jelezni kell.

Az eredeti ZIP változatlan maradt. Részletek a javításokról: CHANGELOG.md; tényleges futtatási eredmények: TEST_REPORT.md.
