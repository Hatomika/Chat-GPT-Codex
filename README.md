# Próbaterem-nyilvántartó 1.1

Magyar nyelvű, offline használható statikus PWA zenekari próbatermek pénzügyi nyilvántartásához. Az eredeti 1.0-s alkalmazás átvizsgált és javított változata.

**[Az 1.1-es teljes alkalmazáscsomag letöltése](https://github.com/Hatomika/Chat-GPT-Codex/raw/refs/heads/main/downloads/probaterem-nyilvantarto-1.1.zip)** · [SHA-256 ellenőrzőösszeg](downloads/probaterem-nyilvantarto-1.1.zip.sha256)

A ZIP tartalmazza a programot, a magyar dokumentációt, a teszteket és az opcionálisan importálható négytagú demóadatokat. A ZIP letöltése nem telepíti automatikusan az alkalmazást.

## Dokumentáció

- [Magyar telepítési és használati útmutató](probaterem-app/README.md)
- [Az 1.0-s verzió auditja](probaterem-app/AUDIT.md)
- [Változásnapló](probaterem-app/CHANGELOG.md)
- [Tesztjelentés és ismert korlátok](probaterem-app/TEST_REPORT.md)
- [Fejlesztői és adatmodell-leírás](probaterem-app/docs/TECHNICAL.md)
- [Opcionális demóadatok](probaterem-app/demo/demo-adatok.json)

## Kipróbálás számítógépen

A tároló letöltése vagy klónozása után:

```sh
cd probaterem-app
python -m http.server 8000 --bind 127.0.0.1
```

Böngészőben nyisd meg a `http://localhost:8000/` címet. Androidos telepítéshez a `probaterem-app` tartalmát HTTPS-es statikus tárhelyről kell kiszolgálni; a fájlkezelőből megnyitott HTML nem megfelelő PWA-környezet. A tárolóba feltöltés önmagában nem jelent működő webhelyet vagy GitHub Pages-telepítést.

## Ellenőrzött működés

28 pénzügyi és 22 böngészős teszteset sikeres, beleértve a valódi IndexedDB-műveleteket, az offline működést és az eredeti 1.0-ról történő frissítést. A pénzügyi tesztek négy időzónában futottak. A tesztjelentés és a futási naplók a csomag részei.

A PDF a böngésző „Mentés PDF-ként” nyomtatási funkcióját használja. Fizikai Android-eszközön a telepítés, a rendszer-nyomtatási ablak és a fájlmentő rendszerablak nem ellenőrzött. A böngészőadatok törlése adatvesztést okozhat: a JSON-mentést külön eszközön is őrizd meg. A demóadatok importja teljes adatcserét végez, ezért valódi adatok előtt készíts mentést.
