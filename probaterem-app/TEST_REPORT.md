# Tesztjelentés – Próbaterem-nyilvántartó 1.1

Dátum: 2026-10-26. A vizsgálat a kiadási csomag helyi statikus kiszolgálását használta; nem történt nyilvános telepítés vagy éles felhasználói adatokkal végzett művelet.

## Környezet és módszer

- Node.js 24.19.0, beépített `node:test` futtató.
- Pénzügyi tesztek négy időzónában: Europe/Budapest, UTC, America/New_York, Pacific/Auckland.
- Linux, Chromium 154.0.8037.57, Python Playwright 1.62.0.
- Valódi IndexedDB és Service Worker, minden teszthez elkülönített böngészőkörnyezet.
- Magyar nyelv és Europe/Budapest időzóna a felületi tesztekben; az eredeti 1.0 → 1.1 frissítési teszt UTC alatt, az eredeti hónapléptetési hiba elkerülésére.
- Mobil emuláció: érintőkijelző, 360, 390 és 430 CSS-pixel szélesség.
- Excel-független ellenőrzés: openpyxl 3.1.5.
- PDF: tényleges Chromium PDF-nyomtatás, `pdftotext` tartalomellenőrzés és egyoldalas vizuális ellenőrzés.

## Végső eredmény

- **28/28 Node-teszt sikeres**, mind a négy időzónában: 112 sikeres tesztvégrehajtás.
- **22/22 böngészőteszt sikeres**; nem nulla-tesztes futás, nincs kihagyott/letiltott/expected-failure teszt.
- A gyártási JavaScript-fájlok `node --check` szintaktikai ellenőrzése sikeres.
- Mindhárom XLSX visszaolvasható; az adatsorok és kiegészítő adatok egyeznek a közös riportobjektummal.
- Mindhárom riporthoz valódi PDF készült; a magyar nevek, riportcímek és pénzösszegek szövegként ellenőrzöttek.

Ez **50 külön automatizált teszteset**, a négy időzónás ismétlést külön számítva összesen 134 végrehajtás. A darabszám nem jelent 50 fizikailag különböző eszközt; a valódi eszközkorlátokat lent külön jelezzük.

Futási bizonyítékok: `tests/results/browser-run-final.txt`, `tests/results/finance-*.txt`. A végső csomag ezeket, három példariportot és három mobilképernyőképet is tartalmazza.

## A kért esetek lefedettsége

A Node-számok a `tests/finance.test.js` nevükben számozott eseteire, a B-számok a `tests/browser_test.py` metódusaira mutatnak.

| Kért eset | Ellenőrzés | Eredmény |
|---|---|---|
| 1. Pontos havi befizetés | Node 01, B01/B11 | sikeres |
| 2. Részleges befizetés | Node 02 | sikeres |
| 3. Több hónapra előrefizetés | Node 03 | sikeres |
| 4. Korábbi tartozás későbbi rendezése | Node 04, a korábbi hóvége változatlan | sikeres |
| 5. Túlfizetés továbbvezetése | Node 05, FIFO fedezett/nyitott előírások | sikeres |
| 6. Korábbi befizetés módosítása | Node 06 összeg/dátum/tag; B01 valódi UI/DB | sikeres |
| 7. Befizetés érvénytelenítése | Node 07, B01 | sikeres |
| 8. Érvénytelenítés visszavonása | Node 08, B01 | sikeres |
| 9. Tagsági időszak változása | Node 09, B15, átfedés elutasítása is | sikeres |
| 10. Kilépett tag tartozásrendezése | Node 10, a riportban is szerepel | sikeres |
| 11. Új tag belépése | Node 11, B01 atomi tag+időszak | sikeres |
| 12. Korábbi tag visszalépése | Node 12, B15 | sikeres |
| 13. Részleges visszafizetés | Node 13, B02 UI és tényleges DB | sikeres |
| 14. Teljes visszafizetés | Node 14, azonos napi több visszafizetés is | sikeres |
| 15. Túl nagy visszafizetés tiltása | Node 15, B03 párhuzamos verseny | sikeres |
| 16. Utólag érvénytelenné váló visszafizetés | Node 16, B02 változatlan DB/log elutasítás után | sikeres |
| 17. Visszamenőleges díjváltozás | Node 17, B14 | sikeres |
| 18. Felfelé kerekítés | Node 18: 61 001 / 4 = 15 251, többlet 3 | sikeres |
| 19. Nulla aktív tag | Node 19 | sikeres |
| 20. Tulajdonosi rendezés/visszavonás | Node 20, B14; tényleges összeg megőrzése | sikeres |
| 21. Teljes adatmentés | Node 21–22; B07 tényleges JSON-letöltés | sikeres |
| 22. Teljes visszaállítás | Node 21–22, B05 fájlfeltöltés és import | sikeres |
| 23. Sérült mentés elutasítása | Node 23 és sématesztek; B06 hét hibás fájl/típus | sikeres |
| 24. XLSX-adatok helyessége | Node 24–25, B09 mindhárom export független beolvasással | sikeres |
| 25. PDF-adatok helyessége | B09 mindhárom előnézet celláinak egyezése és generált PDF tartalma | sikeres; Android rendszerablak nem tesztelt |
| 26. Androidos mobilnézet | B10 360/390/430 px, minden képernyő, hosszú név és 1 milliárd Ft, 44px gombok | emuláció sikeres; fizikai telefon nem tesztelt |
| 27. Offline működés | B11 offline újratöltés + befizetés a valódi DB-be; B19/B22 offline frissítés után | Chromiumban sikeres |
| 28. Napló megőrzése | Node 28–29, B01/B05/B13/B20/B22 | sikeres |
| 29. Frissítés utáni adatintegritás | B13 helyi 1.0 tartalmi migráció, B19 cache-kiadásváltás, B22 tényleges eredeti 1.0 csomag → 1.1 | sikeres |

## További tárolási és regressziós ellenőrzések

- B03: két, ugyanarra a jóváírásra indított 15 000 Ft-os visszafizetésből pontosan egy teljesül. A második elutasítva; egyetlen visszafizetési audit marad.
- B04: két külön lapon megnyitott rekord szerkesztése; az elavult lap nem írhatja felül a másik lap mentését.
- B06: sérült JSON, ismeretlen verzió, hiányzó tábla, hibás tagnévtípus, lehetetlen hónap, hiányzó tagkapcsolat, hibás tulajdonosi dátum. Minden elutasítás után a teljes üzleti állapot és napló változatlan.
- B07: a tényleges JSON-letöltés visszaolvasva; csak lastAttempt metaadat keletkezik, igazolt last nincs, az emlékeztető megmarad.
- B08/B21: a fájlrendszer-API sikeres írás/lezárás, megszakítás és lemezhiba ágai **szimulált fájlkezelővel** ellenőrzöttek. Ezek nem a natív rendszer-fájlválasztó végponti tesztjei.
- B12: más alkalmazás saját, próbaként létrehozott cache-e és tartalma aktiválás után megmarad.
- B13: a régi üzleti rekordok változatlanok, last → legacyLast, migrációs audit; a letöltött védőmentés a teljes eredeti állapottal egyezik.
- B16: tényleges naplóbeli dátumszűrés.
- B17: emlékeztető halasztása és az állapot megmaradása újratöltés után.
- B18: két azonnali formbeküldésből pontosan egy befizetés keletkezik.
- B19: tényleges új worker telepítése, felhasználói frissítőgomb, régi saját cache eltűnése, DB megőrzése és offline újratöltés.
- B20: valódi IndexedDB ConstraintError kikényszerítése ütköző auditazonosítóval. Az új befizetés és audit egyaránt visszagörgetődik; a hibaobjektum is megmarad.
- B22: az eredeti, változatlan 1.0 ZIP-ből kiszolgált oldal és Service Worker; eredeti formátumú, feltöltött adatbázis; azonos eredeten fájlcsere; régi ablak bezárása; új worker aktiválódása; 1.1 migráció, pénzügyi egyenleg és offline újranyitás. A fixture-archívum a tesztcsomag része.
- Külön Node-regresszió ellenőrzi, hogy a migráció se rejtsen el duplikált metaadat-azonosítókat.

## A tesztelés közben javított hibák

A végső sikeres futások előtt a tesztek hibákat is jeleztek. Javult a fájlmentő API függvényként történő detektálása; a tényleges IndexedDB error/abort eseményekből a helyes hibaobjektum megőrzése; a PDF gyökérelemének fehér nyomtatási háttere; a migráció előtti metaadat-egyediség ellenőrzése; valamint az új Service Worker előtöltésénél a régi HTTP-cache megkerülése (`Request.cache: reload`). Az utóbbi hibát a tényleges eredeti 1.0-ról történő B22 frissítési próba találta meg. A tesztharness riport-oszlopindexét, Playwright-kiértékeléseit és formázástól függő frissítési fixture-jét szintén helyesbítettük. Az érintett ellenőrzések a javítások után újrafutottak. A végső eredményt a final nevű napló mutatja, nem az első próbafuttatás.

## Nem ellenőrzött vagy részlegesen ellenőrzött funkciók

- **Fizikai Android telefon, Chrome menüjéből telepítés, kezdőképernyős indítás és natív nyomtatási/fájlmentési rendszerablak:** nem futott. A mobil emuláció ezt nem bizonyítja.
- **Android billentyűzet okozta visualViewport-változás és valódi érintés ergonómiája:** fizikai eszközön nem vizsgált. A dialógus görgetése/fókusza és Escape-kezelése böngészőben működik.
- **File System Access tényleges rendszer-fájlválasztója és fizikai lemezhiba:** a vezérlési ágak szimuláltak. A fallback letöltés valódi; a fájl hosszú távú megőrzése nem igazolható automatikusan.
- **Excel asztali alkalmazás és LibreOffice interaktív megnyitás:** nem futott. Valódi OOXML ZIP-fájlokat független openpyxl sikeresen olvasott és összehasonlított.
- **Más böngészőmotorok, tárhelykvóta kimerítése, operációsrendszer-összeomlás, hosszú távú böngészőadat-kilakoltatás:** nem vizsgált.
- **Éles HTTPS-tárhely, tanúsítvány, cache-fejlécek:** nem telepítettük; ezek a választott tárhely feladatai. A tesztkiszolgáló loopback eredeten futott.
- **Többeszközös szinkron és titkosítás:** nincs ilyen funkció, ezért nem tesztelhető képesség.

Kiadás utáni javasolt elfogadási próba: külön Android-böngészőprofilon kézi demóimport, befizetés, JSON-letöltés ellenőrzése, telepítés, repülőgépes újraindítás, mindhárom PDF rendszermentése és a valódi billentyűzet melletti űrlapkezelés. A valódi üzleti adatokat ne használd első próbához.
