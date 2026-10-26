# Próbaterem-nyilvántartó 1.1

Magyar nyelvű, sötét témájú, helyi IndexedDB-t használó statikus PWA zenekarok próbatermi elszámolásához. Nincs regisztráció, PIN, szerveroldali adatbázis, CDN vagy automatikus felhőszinkron. Az 1.0-s alkalmazás javított változata, az eredeti képernyők megtartásával.

## Gyors indítás asztali gépen

1. Bontsd ki a ZIP-et. A `probaterem-app` mappába lépj be.
2. Ha van Python 3, indítsd innen:

   ```sh
   python -m http.server 8000 --bind 127.0.0.1
   ```

3. A böngészőben nyisd meg a `http://localhost:8000/` címet.
4. Várd meg az „Offline erőforrások készen” állapotot.

A fájlkezelőből megnyitott `index.html` (`file://`) nem megfelelő PWA-környezet. Az alkalmazás futtatásához nem kell Node, npm, Python-csomag vagy build. A Python csak a helyi statikus kiszolgáló egyik lehetséges eszköze.

## Android telepítés

1. Másold a `probaterem-app` tartalmát **HTTPS-es statikus tárhelyre**, például egy `/probaterem/` alkönyvtárba. A fájlok neveit és egymáshoz viszonyított helyét tartsd meg. Az ikonok és a JavaScript-fájlok is szükségesek.
2. Naprakész Chrome Android böngészőben nyisd meg a tárhely címét. Ne inkognitó módban használd.
3. Várd meg az offline előkészítést. Az első letöltéshez internet kell.
4. A Chrome menüjében válaszd a „Telepítés” vagy „Hozzáadás a kezdőképernyőhöz” műveletet, ha felajánlja.
5. Próbáld ki repülőgépes módban, hogy újraindítás után is betöltődik.

Telefonon a sima HTTP-s helyi hálózati IP általában nem biztonságos eredet: ez nem helyettesíti a HTTPS-t. A telefon `localhost` címe magára a telefonra mutat.

Az offline gyorsítótár csak alkalmazásfájlokat tartalmaz. Az üzleti adatok az IndexedDB-ben vannak. Az offline használat, a telepítési menü és a fájlmentő felület böngészőfüggő; fizikai Android-telefont ebben a kiadásban nem teszteltünk. A tesztelt mobilméretek és korlátok a TEST_REPORT.md-ben szerepelnek.

## Tárhely beállítása és frissítés

A kiszolgáló a `.js` fájlokat JavaScriptként, a `.webmanifest` fájlt lehetőleg `application/manifest+json` típussal szolgálja ki. A `sw.js` és `index.html` ne kapjon hosszú, megváltoztathatatlan HTTP-cache-élettartamot; javasolt `Cache-Control: no-cache`. A Service Worker scope-ja az alkalmazás mappája, gyökérszintű engedély nem szükséges.

Frissítés előtt készíts JSON-mentést. A teljes új csomagot tedd ugyanarra a HTTPS-eredetre és ugyanabba az útvonalba, lehetőleg atomi tárhelycserével. Az új verzió csak teljes erőforrás-letöltés után aktiválható; a „Frissítés betöltése” gomb újratölti a lapot. Előbb mentsd a nyitott szerkesztést. A többi alkalmazásablakot is zárd be, majd nyisd újra; a régi kódot futtató lapokkal ne dolgozz tovább párhuzamosan.

1.0 → 1.1 frissítésnél az első alkalommal a régi Service Worker még a korábbi felületet mutathatja. Online nyisd meg az alkalmazást, majd zárd be **az összes** ablakát és a telepített PWA-t, és nyisd meg újra. Ne töröld a webhelyadatokat! Az 1.0-s szolgáltatásfrissítés felületi kezelése hiányos volt.

Az adatok böngészőprofilhoz és webes eredethez kötődnek. Más domain, port, HTTP/HTTPS vagy böngésző másik adatbázist jelenthet. Egy eredeten, eltérő alkönyvtárakban futó példányok azonos `probaterem-db` adatbázist használnak: külön zenekarokhoz külön eredetet vagy böngészőprofilt használj. Az alútvonalanként külön gyorsítótár ezt nem változtatja meg.

## Első beállítás és napi használat

1. **Beállítások:** add meg a zenekar nevét és a nyilvántartás kezdő hónapját.
2. **Havi próbateremdíj:** vegyél fel díjat a kezdő hónaptól. A díj a következő változásig érvényes. Ha még nincs díj, a főoldal figyelmeztet; addig az előírás nulla.
3. **Tagok:** vedd fel a tagokat és kezdő hónapjukat. Utólag a tagsági időszakok módosíthatók. A záró hónap még aktív hónap. Visszalépéshez zárd le az előző időszakot és vegyél fel új, nem átfedő időszakot ugyanahhoz a taghoz.
4. **Főoldal:** az előző/következő gombbal nézd a hónapokat. Nincs havi nyitás vagy zárás. A havi befizetés mellett a halmozott egyenleg jelenik meg. Piros: tartozás, zöld: túlfizetés.
5. **Új befizetés:** add meg a tagot, tényleges dátumot, egész forintösszeget és opcionális megjegyzést. Kilépett tag is fizethet.
6. **Napló:** tagra és dátumra szűrhetsz, szerkeszthetsz, érvényteleníthetsz és visszavonhatod az érvénytelenítést. A tétel megmarad. Az azonosító és teljes változástörténet megtekinthető.
7. **Tag részletei:** havi előírás, befizetés, egyenleg, legrégebbi fennálló havi tartozások és pénzmozgási történet; itt indítható visszafizetés is.
8. **Terembérlet:** havonta jelöld, hogy egy összegben rendezve van-e; add meg a tényleges kifizetés napját és összegét. A rendezés visszavonható, a régi adatok naplóban megmaradnak.

Nem kell a banki befizetéseket kézzel hónapokhoz rendelni. A tag azonosítóját használjuk, ezért átnevezése nem veszti el a befizetéseit. A főoldal az inaktív tagokat is mutatja, így a tartozásuk vagy túlfizetésük nem tűnik el.

## Pénzügyi szabályok

- Egy tag havi hozzájárulása az adott havi teremdíj / aktív taglétszám, **felfelé egész forintra kerekítve**. Példa: 61 001 / 4 → 15 251 Ft/fő, 3 Ft kerekítési többlet.
- A tagok azonos összeget fizetnek; a kerekítési többlet látható, külön pénztár nincs. Nulla aktív tagnál nincs osztás vagy tagi előírás, és figyelmeztetés jelenik meg.
- A teljes havi kötelezettség a hónap elején esedékes; tagság csak egész hónapokra állítható.
- Egyenleg = tényleges befizetések − előírások − tényleges visszafizetések. A legrégebbi előírás rendeződik először; a maradék túlfizetés továbbvihető.
- Korábbi hónapban az akkori hónap végéig, jelen hónapban a mai napig figyelembe vehető pénzmozgások számítanak. Jövőbeli befizetés/visszafizetés nem rögzíthető. A nap a készülék helyi naptári napja: állíts be helyes dátumot és időzónát.
- Azonos napi pénzmozgásoknál a napi befizetések rendelkezésre állnak az aznapi visszafizetésekhez; a visszafizetések összesített fedezete számít, nincs napon belüli időpont.
- A tagság vagy a díj visszamenőleges módosítása minden érintett későbbi egyenlegben érvényesül. A jelentések a **jelenleg ismert, korrigált** adatokból mutatnak történeti pénzügyi állapotot, nem a régi képernyők változatlan archivált másolatai. Az eredeti értékek az auditban találhatók.
- Fedezet nélküli visszafizetést létrehozó bármilyen módosítást elutasítunk. Előbb a téves visszafizetést kell helyesbíteni vagy érvényteleníteni. Másik hibás pénzmozgás bevitelével ne kerüld meg az ütközést.
- A tulajdonosi kifizetés összege díjváltozáskor nem módosul. Eltérés esetén külön figyelmeztetés és riportadat jelenik meg. Később teljesített kifizetés nem mutatja korábban rendezettnek a hónapot.
- Tételenként 1–1 000 000 000 egész HUF támogatott; negatív vagy tört összeg nem. Visszafizetéshez külön tranzakciót használj. A köztes aritmetika BigInt, a tárolt pénzösszeg egész, biztonságos JavaScript-szám. A támogatott hónapformátum `YYYY-MM`, 1900-tól.
- A nyilvántartás kezdetét nem lehet már rögzített pénzmozgások utánra tolni. A tagság korábbi kezdete megőrizhető; az előírások a nyilvántartás kezdetétől számítanak.

## Biztonsági mentés

**Beállítások → Teljes JSON biztonsági mentés.** A fájl minden üzleti táblát és a teljes naplót tartalmazza; verziózott formátumú, dátumozott nevű.

Ha a böngésző támogatja a File System Access fájlválasztóját, a sikeres írás és lezárás után rögzül az utolsó visszaigazolt fájlírás ideje. Ez sem helyettesíti a külön eszközön tárolt másolatot. A megszakított vagy hibás írás nem számít sikernek.

A hagyományos letöltési ágon (jellemzően Androidon) csak a **letöltés kezdeményezése** igazolható. Az alkalmazás nem állítja, hogy megőrizted a fájlt, és az igazolt mentés dátumát sem írja át. Keresd meg a Letöltések között, nyisd meg/ellenőrizd, majd másold másik eszközre vagy saját tárhelyre. Emiatt a figyelmeztetés továbbra is megjelenhet; hét napra elhalasztható. Igazolt mentés után 30 nap múlva emlékeztet.

## Visszaállítás és migráció

1. Előbb mentsd ki a jelenlegi állapotot a visszaállítási ablak exportgombjával.
2. Válassz legfeljebb 30 MB-os JSON-fájlt. Az 1.0-s (`version: 1`) és az 1.1-es (`version: 2`) mentés támogatott.
3. A program ellenőrzi a formátumot, verziót, mezőket, kapcsolatokat, dátumokat, egyediséget, tagsági átfedést és visszafizetési fedezetet.
4. Az ellenőrzés után jóvá kell hagyni a **teljes adatcserét**, a tagok és befizetések számának megjelenítése mellett.
5. Még a csere előtt külön helyi adatbázisba teljes védőmentés készül. Ha ez sikertelen, nincs csere. Az üzleti táblák cseréje és a restore-audit atomi.

Hibás vagy inkompatibilis fájl esetén a jelenlegi üzleti adatok változatlanok maradnak. Az import teljes állapotcsere, **nem összefésülés**. Az importált napló megmarad és visszaállítási bejegyzéssel bővül; az előző helyi napló a védőmentésben és a saját korábbi exportban marad meg.

Az IndexedDB fizikai sémája és neve megmarad (`probaterem-db`, verzió 1); nem volt szükség adattárváltásra. Az 1.1 tartalmi sémaverziója 2, a `backupMetadata.appSchema` jelöli. Migráció előtt teljes helyi védőmentés készül, utána validáció történik. A régi `last` nem igazolt mentési idő, ezért `legacyLast` lesz; üzleti tételek és korábbi auditbejegyzések nem íródnak át. A migráció naplózott.

A nem nulla, rejtett 1.0-s `opening` érték nem része az előírt pénzügyi modellnek. Ilyen importot nem számolunk be csendben és nem törlünk: elutasítjuk, kézi vizsgálat szükséges. Más hibás régi adat esetén is megmarad az eredeti adatbázis és a védőmentés; az adatbázishiba-képernyőről nyers adatmentés tölthető le. Pénzügyi adatot ne javíts ellenőrzés nélkül egy szövegszerkesztőben.

**Helyi védőmentések kimentése:** a Beállításokban külön letöltőfelület van. A védőmentések nem törlődnek automatikusan, ezért sok visszaállítás tárhelyet foglalhat. Azokat is őrizd meg kívül; az összes böngészőadat törlése ezeket is elveszíti.

## Excel- és PDF-riportok

Mindhárom típus a Riportok képernyőről választható: havi állapot, időszaki elszámolás, részletes befizetési napló.

- **Excel:** valódi `.xlsx`, két munkalappal (Kimutatás, Kiegészítő adatok). Az összegek numerikus cellák, a megjegyzések szövegek; egy `=` jellel kezdődő megjegyzés sem lesz képlet. Nem igényel külső könyvtárat vagy internetet.
- **PDF:** offline nyomtatható előnézet nyílik, majd a „Nyomtatás / Mentés PDF-ként” gombbal indítható a böngésző nyomtatása. Ott válaszd a PDF-mentést. Magyar szöveg, ismétlődő táblafejléc és oldaltördelés szerepel benne. A „Vissza az alkalmazáshoz” bezárja az előnézetet.

A PDF ebben a kiadásban **nem közvetlen JavaScript-fájlletöltés**: a böngésző PDF-nyomtatását használjuk. Így az ékezetekhez és a betűkészletekhez nincs külön hálózati függőség. Androidon a nyomtatási szolgáltatás rendelkezésre állása szükséges; a natív rendszerablak működését fizikai telefonon ellenőrizni kell. Sokoszlopos riportot szükség esetén fekvő lappal és kisebb méretezéssel nyomtass. A felületi és exportértékeket ugyanaz a pénzügyi modul állítja elő.

## Demó kipróbálása

A `demo/demo-adatok.json` négy tagot, 2026. január–áprilisi történetet, előrefizetést, hátralékot, visszafizetést, kilépést/visszalépést, kerekítést és érvénytelenített tételt tartalmaz. A demó **soha nem töltődik be automatikusan**. Csak kézi visszaállítással próbáld ki, lehetőleg külön böngészőprofilon vagy külön eredeten. Valódi adatoknál előbb készíts saját mentést; a demó importja is teljes adatcsere.

## Adatbiztonság és korlátok

A böngészőadattörlés, tárhelyfelszabadítás, privát mód vagy eszközhiba adatvesztést okozhat. Az alkalmazás tartós tárhelyet kérhet, de ennek engedélyezése böngészőfüggő, és nem biztonsági mentés. Nincs titkosítás, felhasználói jogosultságkezelés vagy banki integráció; az adatok a készülék és böngésző védelmétől függenek. Más eszközre JSON-mentéssel vihetők át, automatikus szinkron nincs. Az audit a felületen nem szerkeszthető, de helyi adatbázisként nem kriptográfiailag hamisításbiztos.

## Projekt és ellenőrzés

- `core.js`: naptári dátumok, validáció, pénzügyek, FIFO, közös riportadatok és mentésformátum.
- `db.js`: IndexedDB-pillanatkép, atomi változtatások/audit, védőmentés, migráció.
- `app.js`: meglévő képernyők javított változata, eseménykezelés, mentési és PWA-folyamatok.
- `exports.js`: helyi, függőség nélküli XLSX/ZIP-generálás.
- `sw.js`, manifest és ikonok: offline statikus alkalmazás.
- `tests/`: Node- és Chromium/IndexedDB-tesztek, futási eredmények.
- `AUDIT.md`, `CHANGELOG.md`, `TEST_REPORT.md`: vizsgálat, javítások és bizonyítékok.
- `docs/TECHNICAL.md`: adatmodell és fejlesztői részletek.

Pénzügyi tesztek (Node 18 vagy újabb):

```sh
node --test tests/finance.test.js
```

Böngészőtesztekhez külön fejlesztői környezet szükséges; az alkalmazás telepítéséhez nem. Linuxon: Python 3.10+, `python -m pip install -r tests/requirements.txt`, Chromium és `pdftotext` (Poppler). Ezután `python tests/browser_test.py`. A teszt saját, csak loopbacken elérhető szervert és elkülönített böngészőprofilt indít; nem használja a valódi felhasználó adatait. Ha nincs rendszer-Chromium, Playwright Chromium telepíthető (`python -m playwright install chromium`), vagy `CHROMIUM_EXECUTABLE` változóval kijelölhető a futtatható fájl.
