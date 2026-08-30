// 여러 서식 페이지에서 공용으로 쓰는 "저장하기" 로직.
// 1) 처음 저장할 때 폴더를 한 번 선택받아 IndexedDB에 기억해두고,
//    이후에는 같은 폴더에 바로 PDF를 저장한다 (Chrome/Edge 전용 기능).
// 2) 이 기능을 지원하지 않는 브라우저에서는 기존처럼 다운로드로 대체한다.
// 3) 저장한 파일명은 localStorage에 기록해 화면에 목록으로 보여준다.

const DB_NAME = "attendance-app";
const STORE_NAME = "handles";
const DIR_KEY = "save-dir";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getSaveDirectory({ forcePick = false } = {}) {
  if (!window.showDirectoryPicker) return null;

  if (!forcePick) {
    const stored = await idbGet(DIR_KEY).catch(() => null);
    if (stored) {
      const perm = await stored.queryPermission({ mode: "readwrite" });
      if (perm === "granted") return stored;
      const reqPerm = await stored.requestPermission({ mode: "readwrite" });
      if (reqPerm === "granted") return stored;
    }
  }

  // startIn: "desktop"은 브라우저의 폴더 선택 대화상자가 바탕화면에서 열리도록 안내만 해준다.
  // 브라우저 보안 정책상 웹페이지가 사용자 확인 없이 폴더를 자동으로 고를 수는 없어서(File System
  // Access API는 항상 사용자가 직접 선택·확인해야 함), 대화상자 자체는 여전히 뜨지만 바탕화면이
  // 기본으로 열려 있으니 그대로 "폴더 선택"만 눌러주면 된다.
  const handle = await window.showDirectoryPicker({ startIn: "desktop" });
  await idbSet(DIR_KEY, handle);
  return handle;
}

async function savePdfBlob(blob, filename) {
  const dir = await getSaveDirectory().catch(() => null);

  if (dir) {
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { location: "folder", folderName: dir.name };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { location: "download" };
}

function logSavedFile(pageKey, filename) {
  const key = `save-log-${pageKey}`;
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  list.unshift({ filename, time: new Date().toLocaleString("ko-KR") });
  localStorage.setItem(key, JSON.stringify(list.slice(0, 5)));
  renderSaveLog(pageKey);
}

// 이미 저장 폴더를 한 번 골라뒀어도(예: 예전에 다른 폴더를 선택한 경우) 언제든 바탕화면 등
// 다른 폴더로 바꿀 수 있도록 "저장 폴더 변경" 버튼(#change-save-dir-btn)에서 이 함수를 호출한다.
async function changeSaveDirectory() {
  try {
    const dir = await getSaveDirectory({ forcePick: true });
    if (dir) alert(`저장 폴더를 "${dir.name}"(으)로 바꿨습니다. 다음 저장부터 이 폴더에 저장됩니다.`);
  } catch (err) {
    // 사용자가 폴더 선택을 취소한 경우 등 — 조용히 무시.
  }
}

function renderSaveLog(pageKey) {
  const el = document.getElementById("save-log");
  if (!el) return;
  const key = `save-log-${pageKey}`;
  const list = JSON.parse(localStorage.getItem(key) || "[]");
  el.innerHTML = list
    .map((item) => `<li>${item.filename} <span class="log-time">${item.time}</span></li>`)
    .join("") || `<li class="log-empty">아직 저장한 파일이 없습니다.</li>`;
}

// 모든 문서는 세로(portrait)를 기본으로 한다. 내용이 A4 한 페이지 분량보다 길면
// A4 세로 비율(1:√2) 페이지 여러 장으로 나눠서 담는다(가로로 잘리지 않도록).
//
// PDF 페이지 자체는 항상 A4 비율(a4PageHeight)로 고정한다 — 페이지 크기가
// 실제 A4와 다르면 인쇄 시 프린터/뷰어가 축소·중앙정렬을 하면서 용지에 딱
// 맞지 않고 위아래로 여백/경계선이 생긴다(실사용 중 발견). 문서가 한 페이지
// 분량보다 짧을 때는 A4 크기 페이지 위쪽에 실제 콘텐츠 높이만큼만 이미지를
// 그리고 나머지는 빈 여백으로 남겨서, 페이지 크기는 A4를 유지하면서도
// 불필요한 내용은 그리지 않는다.
//
// 여러 페이지로 나눌 때 마지막 페이지가 반올림 오차 수준(몇 px)으로만 넘치면
// 다음 페이지가 거의 빈 상태로 하나 더 생기고 그 위쪽에 이미지의 얇은 조각만
// 걸쳐 인쇄 시 선처럼 보이는 문제가 있었다(실사용 중 발견) — EPSILON만큼은
// 이전 페이지에 포함된 것으로 보고 무시해서 이 문제를 막는다.
//
// html2canvas의 `scale` 옵션(기본 2, 선명하게 렌더링하려고 씀)은 캔버스의
// 실제 픽셀 수를 그만큼 늘릴 뿐, 문서의 CSS 상 크기는 그대로다. 그런데
// jsPDF의 unit:"px"는 CSS px(96dpi) 기준이라서, `canvas.width`를 그대로
// 페이지 크기로 쓰면 스케일 배수만큼(기본 2배) 실제 A4보다 큰 PDF가 만들어진다
// (실사용 중 발견: PDF 페이지가 A4보다 훨씬 큼). 페이지 크기는 스케일을 나눈
// 원래 CSS px 크기로 잡고, 이미지 자체는 고해상도 그대로 그 크기에 맞춰
// 그려 넣어 선명도는 유지한다.
//
// `.document`는 `width: 794px; max-width: 100%;`로 A4 폭을 지정하는데,
// 화면의 미리보기 칸(예: attendance-batch의 col-preview처럼 좁은 열)이 794px보다
// 좁으면 max-width:100%에 눌려 문서가 그보다 작게 렌더링된다 — 그러면 html2canvas가
// 그 축소된 화면 크기 그대로 캡처해서 PDF 페이지 자체가 실제 A4보다 작아진다(실사용
// 중 발견). 캡처 직전에 max-width 제한을 잠깐 풀어서 항상 원래 의도한 794px 폭으로
// 찍히게 하고, 캡처가 끝나면 원래 스타일로 되돌린다.
async function buildPortraitPdf(docEl, { scale = 2 } = {}) {
  const prevMaxWidth = docEl.style.maxWidth;
  docEl.style.maxWidth = "none";
  let canvas;
  try {
    canvas = await html2canvas(docEl, { scale });
  } finally {
    docEl.style.maxWidth = prevMaxWidth;
  }
  const imgData = canvas.toDataURL("image/png");
  const { jsPDF } = window.jspdf;

  const pageWidth = canvas.width / scale;
  const contentHeight = canvas.height / scale;
  const a4PageHeight = Math.round(pageWidth * Math.SQRT2);
  const EPSILON = 20;

  const pdf = new jsPDF({ unit: "px", format: [pageWidth, a4PageHeight] });

  if (contentHeight <= a4PageHeight + EPSILON) {
    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, contentHeight);
    return pdf;
  }

  const totalPages = Math.ceil((contentHeight - EPSILON) / a4PageHeight);
  for (let i = 0; i < totalPages; i++) {
    if (i > 0) pdf.addPage([pageWidth, a4PageHeight]);
    pdf.addImage(imgData, "PNG", 0, -i * a4PageHeight, pageWidth, contentHeight);
  }
  return pdf;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatSaveDate(year, month, day) {
  if (!year || !month || !day) return "";
  return `${year}-${pad2(month)}-${pad2(day)}`;
}
