(function () {
function clean(value) {
  return String(value || "")
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLegislationPage() {
  const host = location.hostname;
  const onHost = host === "qarark.com" || host.endsWith(".qarark.com");
  return onHost && location.pathname.toLowerCase().includes("legislation");
}

function pageTitle(doc) {
  const node = doc.querySelector(".page-title");
  const fromNode = clean(node ? node.textContent : "");
  if (fromNode) return fromNode;
  return clean(doc.title).replace(/^المادة\s*\([^)]*\)\s*من\s*/, "");
}

function formatNumber(raw) {
  const text = clean(raw);
  const match = text.match(/المادة\s*\(\s*([^)]+?)\s*\)/);
  if (!match) return text.replace(/\s*:\s*$/, "").trim();
  return `المادة (${match[1]})`;
}

function articleBlock(body) {
  const view = body.closest(".text-view");
  let node = body;
  while (node.parentElement && node.parentElement !== view) node = node.parentElement;
  return node;
}

function partsToText(parts) {
  const lines = [];
  const visit = (list) => {
    for (const part of list) {
      if (part.type === "p") lines.push(part.runs.map((run) => run.text).join(""));
      else if (part.type === "table") part.rows.forEach((row) => row.forEach(visit));
    }
  };
  visit(parts);
  return lines.join("\n").trim();
}

function htmlToBlocks(root) {
  const blocks = [];
  let runs = [];
  let listDepth = 0;
  let marker = null;

  function mergeRuns(input) {
    const merged = [];
    for (const run of input) {
      if (!run || !run.text) continue;
      const previous = merged[merged.length - 1];
      if (previous && previous.bold === !!run.bold) previous.text += run.text;
      else merged.push({ text: run.text, bold: !!run.bold });
    }
    if (!merged.length) return [];
    merged[0].text = merged[0].text.replace(/^\s+/, "");
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
    return merged.filter((run) => run.text);
  }

  function pushText(value, bold) {
    const normalized = String(value || "")
      .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[\t\r\n]+/g, " ");
    if (!normalized) return;
    if (!normalized.trim()) {
      if (runs.length && !/\s$/.test(runs[runs.length - 1].text)) runs.push({ text: " ", bold: false });
      return;
    }
    let text = normalized.replace(/[ ]{2,}/g, " ");
    if (runs.length && /\s$/.test(runs[runs.length - 1].text)) text = text.replace(/^ /, "");
    if (text) runs.push({ text, bold: !!bold });
  }

  function flush() {
    const merged = mergeRuns(runs);
    runs = [];
    if (!merged.length) return;
    const block = { type: "p", runs: merged };
    if (listDepth) {
      block.list = true;
      if (marker) {
        const start = merged[0].text.trim();
        const numbered = /^(\d+|[٠-٩]+)[.\-)]/.test(start) || start.startsWith("•");
        if (!numbered) merged.unshift({ text: `${marker} `, bold: false });
        marker = null;
      }
    }
    blocks.push(block);
  }

  function walkChildren(node, bold) {
    for (const child of node.childNodes) walk(child, bold);
  }

  function walk(node, bold) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.nodeValue, bold);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "SVG") return;
    if (tag === "BR" || tag === "HR") {
      flush();
      return;
    }
    if (tag === "TABLE") {
      flush();
      const rows = [...node.rows].map((row) => [...row.cells].map((cell) => htmlToBlocks(cell)));
      if (rows.length) blocks.push({ type: "table", rows });
      return;
    }
    if (tag === "OL" || tag === "UL") {
      flush();
      listDepth += 1;
      let index = 1;
      for (const child of node.children) {
        if (child.tagName !== "LI") continue;
        marker = tag === "OL" ? `${index}.` : "•";
        index += 1;
        walkChildren(child, bold);
        flush();
      }
      listDepth -= 1;
      return;
    }
    const nextBold = bold || tag === "STRONG" || tag === "B";
    if (tag === "P" || /^H[1-6]$/.test(tag)) {
      flush();
      walkChildren(node, nextBold);
      flush();
      return;
    }
    walkChildren(node, nextBold);
  }

  walkChildren(root, false);
  flush();
  return blocks;
}

function extractArticles(doc) {
  return [...doc.querySelectorAll(".text-view .qarark-article1")].map((body) => {
    const block = articleBlock(body);
    const headings = [...block.querySelectorAll("h4")]
      .filter((heading) => !body.contains(heading))
      .map((heading) => clean(heading.textContent))
      .filter(Boolean);
    const numberRaw = headings.find((item) => /المادة\s*\(/.test(item))
      || headings.find((item) => /^المادة\b/.test(item))
      || "";
    const subject = headings.find((item) => item !== numberRaw) || "";
    const parts = htmlToBlocks(body);
    return {
      subject,
      number: formatNumber(numberRaw) || "مادة",
      repealed: /^ملغاة(?:\s|$|[.،:])/.test(partsToText(parts)),
      parts,
    };
  });
}

function stackAlreadyOpen() {
  const params = new URL(location.href).searchParams;
  const view = params.get("view") || "";
  const filtered = Boolean((params.get("content") || "").trim());
  const count = document.querySelectorAll(".text-view .qarark-article1").length;
  return !filtered && (view === "stack" || view === "printstack") && count > 1;
}

async function fetchStackDocument() {
  const next = new URL(location.href);
  if (!next.searchParams.get("id")) return { error: "هذه الصفحة لا تحتوي معرّف تشريع." };
  next.searchParams.delete("content");
  next.searchParams.delete("key");
  next.searchParams.set("view", "stack");
  let response;
  try {
    response = await fetch(next.href, { credentials: "include", cache: "no-store" });
  } catch {
    return { error: "تعذر الاتصال بقرارك. تحقق من الاتصال ثم أعد المحاولة." };
  }
  if (!response.ok) return { error: "تعذر جلب نص القانون من قرارك." };
  const html = await response.text();
  return { doc: new DOMParser().parseFromString(html, "text/html") };
}

globalThis.__qararkProbe = function () {
  try {
    if (!isLegislationPage()) return { ok: false, error: "افتح صفحة تشريع في موقع قرارك أولاً." };
    return {
      ok: true,
      title: pageTitle(document),
      count: document.querySelectorAll(".text-view .qarark-article1").length,
      view: new URL(location.href).searchParams.get("view") || "default",
    };
  } catch {
    return { ok: false, error: "تعذر قراءة الصفحة." };
  }
};

globalThis.__qararkExport = async function (mode) {
  try {
    if (!isLegislationPage()) return { ok: false, error: "افتح صفحة تشريع في موقع قرارك أولاً." };
    let doc = document;
    let fetched = false;
    if (mode !== "current" && !stackAlreadyOpen()) {
      const loaded = await fetchStackDocument();
      if (loaded.error) return { ok: false, error: loaded.error };
      doc = loaded.doc;
      fetched = true;
    }
    const articles = extractArticles(doc);
    if (!articles.length) {
      if (doc.querySelector('input[type="password"]')) {
        return { ok: false, error: "سجّل الدخول في قرارك ثم أعد المحاولة." };
      }
      return { ok: false, error: "لم يُعثر على نص مواد في هذه الصفحة." };
    }
    return { ok: true, title: pageTitle(doc), count: articles.length, fetched, articles };
  } catch {
    return { ok: false, error: "تعذر قراءة التشريع. أعد تحميل الصفحة ثم حاول مرة أخرى." };
  }
};

if (globalThis.chrome?.runtime?.onMessage && !globalThis.__qararkListening) {
  globalThis.__qararkListening = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "qarark-export") return;
    (async () => {
      try {
        if (message.action === "probe") sendResponse(globalThis.__qararkProbe());
        else sendResponse(await globalThis.__qararkExport(message.mode));
      } catch {
        sendResponse({ ok: false, error: "تعذر قراءة التشريع." });
      }
    })();
    return true;
  });
}
})();
