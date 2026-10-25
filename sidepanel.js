let busy = false;
let seenUrl = "";

function articleWord(count) {
  const shown = Number(count).toLocaleString("ar-JO");
  if (count === 1) return "مادة واحدة";
  if (count === 2) return "مادتان";
  if (count >= 3 && count <= 10) return `${shown} مواد`;
  return `${shown} مادة`;
}

function fileName(title) {
  const clean = String(title || "تشريع")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${clean || "تشريع"}.docx`;
}

function setStatus(message, kind) {
  const status = document.querySelector("#status");
  status.textContent = message;
  status.dataset.kind = kind || "info";
}

function isLawUrl(url) {
  try {
    const parsed = new URL(url);
    const hostOk = parsed.hostname === "qarark.com" || parsed.hostname.endsWith(".qarark.com");
    return hostOk && parsed.pathname.toLowerCase().includes("legislation");
  } catch {
    return false;
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function askPage(tabId, action, mode) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content/extract.js"] });
  return chrome.tabs.sendMessage(tabId, { type: "qarark-export", action, mode });
}

function selectedMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : "full";
}

function setFormEnabled(enabled) {
  document.querySelector("#export").disabled = !enabled;
  for (const input of document.querySelectorAll('input[name="mode"]')) input.disabled = !enabled;
}

async function refresh() {
  if (busy) return;
  const title = document.querySelector("#law-title");
  const summary = document.querySelector("#summary");
  let tab;
  try {
    tab = await activeTab();
  } catch {
    title.textContent = "تعذر قراءة الصفحة";
    summary.textContent = "أعد فتح اللوحة.";
    setFormEnabled(false);
    setStatus("تعذر الوصول إلى الصفحة الحالية.", "error");
    return;
  }
  const url = tab && tab.url ? tab.url : "";
  const changed = url !== seenUrl;
  seenUrl = url;
  if (!tab || !isLawUrl(url)) {
    title.textContent = "ليست صفحة تشريع";
    summary.textContent = "افتح قانوناً في موقع قرارك، ثم ارجع إلى هذه اللوحة.";
    setFormEnabled(false);
    setStatus("بانتظار صفحة تشريع.", "info");
    return;
  }
  try {
    const info = await askPage(tab.id, "probe");
    if (!info || !info.ok) {
      title.textContent = "تعذر قراءة الصفحة";
      summary.textContent = info && info.error ? info.error : "أعد تحميل الصفحة.";
      setFormEnabled(false);
      setStatus(info && info.error ? info.error : "تعذر قراءة الصفحة.", "error");
      return;
    }
    title.textContent = info.title || "تشريع";
    if (info.count > 1) summary.textContent = `ظاهر الآن ${articleWord(info.count)}.`;
    else if (info.count === 1) summary.textContent = "ظاهر الآن مادة واحدة. «القانون كاملاً» يجلب كل المواد.";
    else summary.textContent = "النص لم يظهر بعد. يمكنك جلب القانون كاملاً.";
    setFormEnabled(true);
    if (changed || document.querySelector("#status").dataset.kind !== "ok") {
      setStatus("جاهز للتصدير.", "info");
    }
  } catch {
    title.textContent = "تعذر الاتصال بالصفحة";
    summary.textContent = "أعد تحميل صفحة التشريع ثم افتح اللوحة من جديد.";
    setFormEnabled(false);
    setStatus("تعذر الاتصال بالصفحة.", "error");
  }
}

async function downloadFile(bytes, filename) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  let downloadId;
  try {
    downloadId = await chrome.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return new Promise((resolve) => {
    const onChanged = (delta) => {
      if (delta.id !== downloadId || !delta.state) return;
      const state = delta.state.current;
      if (state !== "complete" && state !== "interrupted") return;
      chrome.downloads.onChanged.removeListener(onChanged);
      URL.revokeObjectURL(url);
      resolve(state);
    };
    chrome.downloads.onChanged.addListener(onChanged);
  });
}

async function exportLaw() {
  if (busy) return;
  const button = document.querySelector("#export");
  busy = true;
  button.disabled = true;
  try {
    const tab = await activeTab();
    if (!tab || !isLawUrl(tab.url || "")) {
      setStatus("افتح صفحة تشريع في قرارك أولاً.", "error");
      return;
    }
    const mode = selectedMode();
    setStatus(mode === "current" ? "جارٍ قراءة النص الظاهر…" : "جارٍ جلب نص القانون كاملاً…", "busy");
    const data = await askPage(tab.id, "export", mode);
    if (!data || !data.ok) {
      setStatus(data && data.error ? data.error : "تعذر التصدير.", "error");
      return;
    }
    setStatus(`جارٍ تنسيق ${articleWord(data.count)}…`, "busy");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const bytes = globalThis.QararkDocx.build({
      title: data.title,
      exportedAt: new Date().toISOString(),
      articles: data.articles,
    });
    const name = fileName(data.title);
    setStatus("جارٍ حفظ الملف…", "busy");
    const state = await downloadFile(bytes, name);
    if (state === "interrupted") {
      setStatus("تم إلغاء الحفظ أو تعذر إكماله.", "error");
      return;
    }
    setStatus(`تم الحفظ في التنزيلات: ${name}`, "ok");
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (/cancel/i.test(message)) setStatus("تم إلغاء الحفظ.", "info");
    else setStatus("تعذر إنشاء الملف. أعد المحاولة.", "error");
  } finally {
    busy = false;
    try {
      const tab = await activeTab();
      if (tab && isLawUrl(tab.url || "")) button.disabled = false;
    } catch {
      button.disabled = false;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#export").addEventListener("click", () => {
    exportLaw();
  });
  refresh();
});

chrome.tabs.onActivated.addListener(() => {
  refresh();
});

chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.status === "complete") refresh();
});
