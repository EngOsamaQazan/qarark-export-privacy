(() => {
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(data) {
    let value = 0xffffffff;
    for (let index = 0; index < data.length; index += 1) {
      value = CRC_TABLE[(value ^ data[index]) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    return bytes;
  }

  function u32(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
    return bytes;
  }

  function concat(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const year = Math.max(date.getFullYear(), 1980);
    return {
      time,
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
  }

  function buildZip(files) {
    const encoder = new TextEncoder();
    const stamp = dosDateTime(new Date());
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      const crc = crc32(data);
      const local = concat([
        u32(0x04034b50),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(stamp.time),
        u16(stamp.date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        name,
        data,
      ]);
      locals.push(local);
      centrals.push(concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(stamp.time),
        u16(stamp.date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]));
      offset += local.length;
    }
    const centralDir = concat(centrals);
    const end = concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(centralDir.length),
      u32(offset),
      u16(0),
    ]);
    return concat([...locals, centralDir, end]);
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatDate(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("ar-JO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function articleWord(count) {
    const shown = Number(count).toLocaleString("ar-JO");
    if (count === 1) return "مادة واحدة";
    if (count === 2) return "مادتان";
    if (count >= 3 && count <= 10) return `${shown} مواد`;
    return `${shown} مادة`;
  }

  // وورد يخزن الفقرة العربية بـ bidi=0 ويضع rtl على النص. القيمة 1 تقلب الاتجاه.
  const RUN = '<w:rtl/><w:lang w:val="ar-JO" w:bidi="ar-JO"/>';

  function runsXml(runs) {
    return (runs || [])
      .filter((run) => run && run.text)
      .map((run) => {
        const bold = run.bold ? "<w:b/><w:bCs/>" : "";
        return `<w:r><w:rPr>${bold}${RUN}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
      })
      .join("");
  }

  function isNumbered(runs) {
    const text = (runs || []).map((run) => run.text || "").join("").trim();
    return /^(\d+|[٠-٩]+)\s*[.\-)]/.test(text);
  }

  function paragraph(style, runs, options = {}) {
    const props = [`<w:pStyle w:val="${style}"/>`];
    if (options.borderTop) {
      props.push('<w:pBdr><w:top w:val="single" w:sz="6" w:space="10" w:color="E4D9C8"/></w:pBdr>');
    }
    props.push('<w:bidi w:val="0"/>');
    if (options.indent) {
      const hanging = options.hanging ? ' w:hanging="360"' : "";
      props.push(`<w:ind w:right="420"${hanging}/>`);
    }
    if (options.align) props.push(`<w:jc w:val="${options.align}"/>`);
    props.push("<w:rPr><w:rtl/></w:rPr>");
    return `<w:p><w:pPr>${props.join("")}</w:pPr>${runsXml(runs)}</w:p>`;
  }

  function bodyOptions(runs) {
    const numbered = isNumbered(runs);
    return { align: "right", indent: numbered, hanging: numbered };
  }

  function tableXml(table) {
    const rows = (table.rows || []).filter((row) => row.length);
    if (!rows.length) return "";
    const columns = Math.max(...rows.map((row) => row.length));
    const width = Math.floor(5000 / columns);
    const grid = Math.floor(9360 / columns);
    let xml = "<w:tbl><w:tblPr>";
    xml += '<w:bidiVisual w:val="1"/>';
    xml += '<w:tblW w:w="5000" w:type="pct"/>';
    xml += '<w:jc w:val="center"/>';
    xml += '<w:tblBorders>';
    for (const edge of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
      xml += `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="C4B8A5"/>`;
    }
    xml += "</w:tblBorders>";
    xml += '<w:tblLayout w:type="autofit"/>';
    xml += '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>';
    xml += `</w:tblPr><w:tblGrid>${"<w:gridCol w:w=\"" + grid + "\"/>".repeat(columns)}</w:tblGrid>`;
    rows.forEach((row, rowIndex) => {
      xml += "<w:tr>";
      for (let cellIndex = 0; cellIndex < columns; cellIndex += 1) {
        const shade = rowIndex % 2 === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="FBF7F1"/>' : "";
        xml += `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="pct"/>${shade}<w:vAlign w:val="center"/></w:tcPr>`;
        xml += cellInner(row[cellIndex] || []);
        xml += "</w:tc>";
      }
      xml += "</w:tr>";
    });
    xml += "</w:tbl>";
    return xml;
  }

  function cellInner(parts) {
    if (!parts.length) return paragraph("LawCell", []);
    let xml = "";
    let written = false;
    for (const part of parts) {
      if (part.type === "table") xml += tableXml(part);
      else xml += paragraph(part.list ? "LawList" : "LawCell", part.runs, bodyOptions(part.runs));
      written = true;
    }
    return written ? xml : paragraph("LawCell", []);
  }

  function articleXml(article, index) {
    let xml = "";
    if (article.subject) {
      xml += paragraph("LawSubject", [{ text: article.subject, bold: true }], { borderTop: index > 0 });
    }
    xml += paragraph("LawArticle", [{ text: article.number || "مادة", bold: true }], {
      borderTop: index > 0 && !article.subject,
    });
    let written = false;
    for (const part of article.parts || []) {
      if (part.type === "table") {
        xml += tableXml(part);
      } else if (article.repealed) {
        xml += paragraph("LawRepealed", part.runs, { ...bodyOptions(part.runs), indent: !!part.list || isNumbered(part.runs) });
      } else {
        xml += paragraph(part.list ? "LawList" : "LawBody", part.runs, bodyOptions(part.runs));
      }
      written = true;
    }
    if (!written) xml += paragraph(article.repealed ? "LawRepealed" : "LawBody", [{ text: "—" }]);
    return xml;
  }

  function stylesXml() {
    const fonts = '<w:rFonts w:ascii="Traditional Arabic" w:hAnsi="Traditional Arabic" w:cs="Traditional Arabic"/>';
    const rtl = '<w:rtl/><w:lang w:val="ar-JO" w:bidi="ar-JO"/>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>${fonts}<w:sz w:val="32"/><w:szCs w:val="32"/>${rtl}</w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:bidi w:val="0"/><w:jc w:val="right"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:bidi w:val="0"/><w:jc w:val="right"/></w:pPr>
    <w:rPr>${fonts}<w:sz w:val="32"/><w:szCs w:val="32"/>${rtl}</w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LawTitle">
    <w:name w:val="Law Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:bidi w:val="0"/><w:spacing w:before="0" w:after="160"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr>${fonts}<w:b/><w:bCs/><w:color w:val="1C1917"/><w:sz w:val="44"/><w:szCs w:val="44"/>${rtl}</w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LawMeta">
    <w:name w:val="Law Meta"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:bidi w:val="0"/><w:spacing w:before="0" w:after="60"/><w:jc w:val="center"/></w:pPr>
    <w:rPr>${fonts}<w:color w:val="57534E"/><w:sz w:val="24"/><w:szCs w:val="24"/>${rtl}</w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LawSubject">
    <w:name w:val="Law Subject"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:keepNext/><w:bidi w:val="0"/><w:spacing w:before="280" w:after="40"/><w:jc w:val="right"/></w:pPr>
    <w:rPr>${fonts}<w:b/><w:bCs/><w:color w:val="7C2D12"/><w:sz w:val="28"/><w:szCs w:val="28"/>${rtl}</w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LawArticle">
    <w:name w:val="Law Article"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:keepNext/><w:bidi w:val="0"/><w:spacing w:before="40" w:after="80"/><w:jc w:val="right"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr>${fonts}<w:b/><w:bCs/><w:color w:val="7F1D1D"/><w:sz w:val="36"/><w:szCs w:val="36"/>${rtl}</w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LawBody">
    <w:name w:val="Law Body"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:bidi w:val="0"/><w:spacing w:before="40" w:after="80" w:line="276" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>
    <w:rPr>${fonts}<w:sz w:val="32"/><w:szCs w:val="32"/>${rtl}</w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LawList">
    <w:name w:val="Law List"/><w:basedOn w:val="LawBody"/>
    <w:pPr><w:bidi w:val="0"/><w:ind w:right="420" w:hanging="360"/><w:jc w:val="right"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LawRepealed">
    <w:name w:val="Law Repealed"/><w:basedOn w:val="LawBody"/>
    <w:rPr><w:i/><w:iCs/><w:color w:val="6B7280"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="LawCell">
    <w:name w:val="Law Cell"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:bidi w:val="0"/><w:spacing w:before="20" w:after="20" w:line="260" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>
    <w:rPr>${fonts}<w:sz w:val="28"/><w:szCs w:val="28"/>${rtl}</w:rPr>
  </w:style>
</w:styles>`;
  }

  function headerXml(title) {
    const short = title.length > 70 ? `${title.slice(0, 69)}…` : title;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="7F1D1D"/></w:pBdr><w:bidi w:val="0"/><w:jc w:val="center"/><w:rPr><w:rtl/></w:rPr></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Traditional Arabic" w:hAnsi="Traditional Arabic" w:cs="Traditional Arabic"/><w:color w:val="7F1D1D"/><w:sz w:val="20"/><w:szCs w:val="20"/>${RUN}</w:rPr><w:t>${escapeXml(short)}</w:t></w:r>
  </w:p>
</w:hdr>`;
  }

  function emptyHeaderXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:bidi w:val="0"/><w:rPr><w:rtl/></w:rPr></w:pPr></w:p></w:hdr>`;
  }

  function footerXml() {
    const run = `<w:rPr><w:rFonts w:ascii="Traditional Arabic" w:hAnsi="Traditional Arabic" w:cs="Traditional Arabic"/><w:color w:val="57534E"/><w:sz w:val="20"/><w:szCs w:val="20"/>${RUN}</w:rPr>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="E4D9C8"/></w:pBdr><w:bidi w:val="0"/><w:jc w:val="center"/><w:rPr><w:rtl/></w:rPr></w:pPr>
    <w:r>${run}<w:t xml:space="preserve">صفحة </w:t></w:r>
    <w:r>${run}<w:fldChar w:fldCharType="begin"/></w:r>
    <w:r>${run}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r>${run}<w:fldChar w:fldCharType="separate"/></w:r>
    <w:r>${run}<w:t>1</w:t></w:r>
    <w:r>${run}<w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`;
  }

  function documentXml(law) {
    const title = cleanTitle(law.title);
    const count = law.articles.length;
    const parts = [
      paragraph("LawTitle", [{ text: title, bold: true }]),
      paragraph("LawMeta", [{ text: "نص المواد كما هو معروض في قرارك" }]),
      paragraph("LawMeta", [{ text: `عدد المواد: ${articleWord(count)}` }]),
      paragraph("LawMeta", [{ text: `تاريخ التصدير: ${formatDate(law.exportedAt)}` }]),
      `<w:p><w:pPr><w:pStyle w:val="LawMeta"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="7F1D1D"/></w:pBdr><w:bidi w:val="0"/><w:spacing w:before="40" w:after="200"/><w:rPr><w:rtl/></w:rPr></w:pPr></w:p>`,
    ];
    law.articles.forEach((article, index) => parts.push(articleXml(article, index)));
    parts.push(paragraph("LawMeta", [{ text: "— انتهى نص المواد —" }]));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${parts.join("")}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:headerReference w:type="first" r:id="rId5"/>
      <w:footerReference w:type="default" r:id="rId3"/>
      <w:footerReference w:type="first" r:id="rId6"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1304" w:bottom="1134" w:left="1134" w:header="567" w:footer="567"/>
      <w:titlePg/>
      <w:bidi/>
      <w:rtlGutter/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  function cleanTitle(title) {
    const text = String(title || "").replace(/\s+/g, " ").trim();
    return text || "تشريع";
  }

  function contentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  }

  function coreXml(title, iso) {
    const stamp = iso || new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>تصدير تشريعات قرارك</dc:creator>
  <cp:lastModifiedBy>تصدير تشريعات قرارك</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(stamp)}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(stamp)}</dcterms:modified>
</cp:coreProperties>`;
  }

  function build(law) {
    const title = cleanTitle(law.title);
    const articles = Array.isArray(law.articles) ? law.articles : [];
    const payload = { title, exportedAt: law.exportedAt, articles };
    const files = [
      { name: "[Content_Types].xml", data: contentTypesXml() },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>` },
      { name: "docProps/core.xml", data: coreXml(title, law.exportedAt) },
      { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>تصدير تشريعات قرارك</Application></Properties>` },
      { name: "word/document.xml", data: documentXml(payload) },
      { name: "word/styles.xml", data: stylesXml() },
      { name: "word/settings.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:view w:val="print"/>
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
  <w:themeFontLang w:val="en-US" w:bidi="ar-JO"/>
  <w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
</w:settings>` },
      { name: "word/header1.xml", data: headerXml(title) },
      { name: "word/header2.xml", data: emptyHeaderXml() },
      { name: "word/footer1.xml", data: footerXml() },
      { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>` },
    ];
    return buildZip(files);
  }

  globalThis.QararkDocx = { build, crc32 };
})();
