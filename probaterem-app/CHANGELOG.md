# Változásnapló

## 1.1 – 2026-10-26

Az 1.0 statikus alkalmazás meglévő képernyőire és XLSX-generátorára épül; nincs új keretrendszer vagy futásidejű külső függőség.

- Javított, időzónától független hónapléptetés; valós naptári dátumok és mai határ.
- Elkülönített pénzügyi, validációs, adatbázis- és exportmodulok.
- Egész forintos BigInt köztes számítás, ellenőrzött összesítés, felfelé kerekítés és nulla aktív tag kezelése.
- Történeti egyenlegek és FIFO-tartozásrészletezés; jövőbeli pénzmozgások tiltása.
- Atomi olvasás/validáció/üzleti írás/audit; párhuzamos visszafizetések és elavult szerkesztések védelme.
- Dupla űrlapbeküldés elleni védelem.
- Teljes séma- és kapcsolati ellenőrzés íráskor és importkor, biztonságos azonosítókkal.
- Több tagsági időszak, kilépés utáni rendezés és megmaradó túlfizetés; visszafizetési ütközések elutasítása visszamenőleges változáskor is.
- Tényleges tulajdonosi kifizetés megőrzése, díjeltérés figyelmeztetése és történeti státusz.
- A főoldalon és havi/időszaki riportban az inaktív tagok és pénzmozgásaik is láthatók.
- Naplószűrés tag és dátumtartomány szerint, tranzakcióazonosító és változástörténet.
- Közös riportadatok mindhárom Excel- és PDF-útvonalhoz; numerikus kiegészítő pénzcellák, javított XML-kezelés.
- Stabil nyomtatási PDF-előnézet külön indítógombbal, magyar karakterekkel, tördeléssel és ismételt táblafejléccel.
- Verziózott JSON-mentés (2), 1.0-s importmigráció, teljes helyi védőmentés csere/migráció előtt, visszaállítási audit.
- Helyi védőmentések külön letöltőfelülete és nyers mentési lehetőség adatbázishibánál.
- Mentési idő csak sikeresen lezárt File System Access írás után; hagyományos letöltésnél nincs hamis sikerállítás.
- 30 napos emlékeztető, 7 napos halasztás; régi nem igazolt `last` metaadat megőrzése `legacyLast` néven.
- Saját scope-ra korlátozott offline gyorsítótár; más alkalmazások cache-e megmarad; frissítés felhasználói aktiválással, új kiadás erőforrásainak friss hálózati előtöltésével a régi HTTP-cache helyett.
- Helyi 192/512-es és maskable PNG-ikonok; látható offline állapot és előkészítési hiba.
- Mobilos minimum 44px gombmagasság, hosszú nevek/nagy összegek tördelése, dialógusfókusz és Escape/Tab kezelés.
- Automatizált Node/Chromium/IndexedDB/Excel/PDF/offline/frissítési tesztek és magyar dokumentáció.
- Opcionális, ellenőrzött demóadatok négy taggal; automatikus import nincs.

## Megmaradó korlátok

A PDF a böngésző „Mentés PDF-ként” funkcióját használja. Fizikai Android-eszközön a telepítési és rendszer-nyomtatási folyamat nem ellenőrzött. A fájlletöltés Androidon nem bizonyítja a fájl megőrzését. Nincs többeszközös szinkron, titkosítás vagy felhőmentés. Az audit helyi, nem hamisításbiztos. Részletek: README.md és TEST_REPORT.md.
