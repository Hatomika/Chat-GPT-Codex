"use strict";
function xml(s) {
  return String(s ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&quot;",
        })[c],
    );
}
function excelCol(n) {
  let s = "";
  for (++n; n; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function sheetXML(data) {
  let rows = data
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row
          .map((v, j) => {
            let cell = `${excelCol(j)}${i + 1}`;
            return typeof v === "number" && Number.isFinite(v)
              ? `<c r="${cell}"><v>${v}</v></c>`
              : `<c r="${cell}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="16"/><sheetData>${rows}</sheetData></worksheet>`;
}
const enc = new TextEncoder();
function crc32(bytes) {
  let c = ~0;
  for (let b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function zip(entries) {
  let parts = [],
    central = [],
    offset = 0;
  function u16(n) {
    return [n & 255, (n >>> 8) & 255];
  }
  function u32(n) {
    return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  }
  for (let [name, content] of entries) {
    let n = enc.encode(name),
      b = enc.encode(content),
      crc = crc32(b);
    let local = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(b.length),
      ...u32(b.length),
      ...u16(n.length),
      ...u16(0),
      ...n,
    ]);
    parts.push(local, b);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(crc),
        ...u32(b.length),
        ...u32(b.length),
        ...u16(n.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
        ...n,
      ]),
    );
    offset += local.length + b.length;
  }
  let centralSize = central.reduce((a, b) => a + b.length, 0),
    end = new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(central.length),
      ...u16(central.length),
      ...u32(centralSize),
      ...u32(offset),
      ...u16(0),
    ]);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
function makeXLSX(r) {
  let overview = [
      ["Zenekar", r.band],
      ["Riport", r.title],
      ["Időszak", r.from + " – " + r.to],
      ["Készítés dátuma", r.created],
      [],
      ...(r.headers.length ? [r.headers, ...r.rows] : []),
    ],
    notes = [["Kiegészítő adatok"], ...r.extra];
  let files = [
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kimutatás" sheetId="1" r:id="rId1"/><sheet name="Kiegészítő adatok" sheetId="2" r:id="rId2"/></sheets></workbook>',
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    ],
    ["xl/worksheets/sheet1.xml", sheetXML(overview)],
    ["xl/worksheets/sheet2.xml", sheetXML(notes)],
  ];
  return zip(files);
}
function download(blob, name, type) {
  let a = document.createElement("a"),
    url = URL.createObjectURL(
      blob instanceof Blob ? blob : new Blob([blob], { type }),
    );
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 10000);
}
