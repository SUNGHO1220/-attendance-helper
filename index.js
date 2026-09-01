const $ = (id) => document.getElementById(id);

/* ---- 사용방법 모달 ---- */

$("help-btn").addEventListener("click", () => {
  $("help-modal").style.display = "flex";
});

function closeHelpModal() {
  $("help-modal").style.display = "none";
}

$("help-close-btn").addEventListener("click", closeHelpModal);

$("help-modal").addEventListener("click", (e) => {
  if (e.target === $("help-modal")) closeHelpModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("help-modal").style.display !== "none") closeHelpModal();
});

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ---- 기본 정보 설정 (학년/반/담임 성함) ---- */

const classSelect = $("setting-class");
for (let i = 1; i <= 10; i++) {
  const option = document.createElement("option");
  option.value = i;
  option.textContent = `${i}반`;
  classSelect.appendChild(option);
}

let GRADE = "";
let CLASS_NO = "";
let TEACHER_NAME = "원성호"; // 기본 정보 설정에서 담임 성함을 지정하면 그 값을 쓴다.

function refreshSettingsVars() {
  const settings = getSettings();
  GRADE = settings.grade;
  CLASS_NO = settings.classNo;
  TEACHER_NAME = settings.teacherName || "원성호";
}

function loadSettingsIntoForm() {
  const settings = getSettings();
  if (settings.grade) $("setting-grade").value = settings.grade;
  if (settings.classNo) $("setting-class").value = settings.classNo;
  if (settings.teacherName) $("setting-teacher-name").value = settings.teacherName;
  refreshSettingsVars();
}

// 설정을 바꾸면 즉시 반영하고, 이미 미리보기 중인 문서가 있으면 새 값으로 다시 그린다
// (한 페이지에서 설정과 문서 생성을 모두 하므로, 페이지를 새로고침하지 않아도 최신 값을 쓴다).
function onSettingsChanged() {
  refreshSettingsVars();
  if (currentDoc) renderCurrentDocPreview();
}

$("setting-grade").addEventListener("change", () => {
  saveSettings({ grade: $("setting-grade").value });
  onSettingsChanged();
});

$("setting-class").addEventListener("change", () => {
  saveSettings({ classNo: $("setting-class").value });
  onSettingsChanged();
});

$("setting-teacher-name").addEventListener("change", () => {
  saveSettings({ teacherName: $("setting-teacher-name").value.trim() });
  onSettingsChanged();
});

loadSettingsIntoForm();

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function splitDate(iso) {
  if (!iso) return { y: "", m: "", d: "" };
  const [y, m, d] = iso.split("-");
  return { y, m: String(Number(m)), d: String(Number(d)) };
}

const KOREAN_DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
function koreanDayOfWeek(iso) {
  if (!iso) return "";
  return KOREAN_DAY_NAMES[new Date(`${iso}T00:00:00`).getDay()];
}

function formatDateSlash(iso) {
  const { m, d } = splitDate(iso);
  return m && d ? `${m}/${d}` : "";
}

// 결석 연속 여부를 판단할 때 사이에 낀 주말·공휴일은 등교일이 아니므로 무시한다(사용자 지정 규칙,
// 예: 금요일 결석 다음 월요일도 결석이면 하나의 결석신고서로 묶고, 일수는 실제 결석한 날만 센다).
// NON_SCHOOL_DAYS는 calendar-data.js의 학사일정 중 실제로 등교하지 않는 법정공휴일·대체휴일만 추린
// 목록이다(수학여행·중간고사처럼 등교는 하는 특별일정은 제외, 2008년부터 공휴일이 아닌 제헌절도 제외) —
// 학사일정이 바뀌면 이 목록도 같이 고쳐야 하고, 개교기념일처럼 학교마다 다를 수 있는 항목은 실제 재량휴업
// 여부를 확인해서 필요하면 빼거나 더해야 한다.
const NON_SCHOOL_DAYS = new Set([
  "2026-03-01", "2026-03-02", // 3·1절, 대체휴일
  "2026-05-04", // 개교기념일(신언중)
  "2026-05-05", // 어린이날
  "2026-05-24", "2026-05-25", // 부처님오신날, 대체휴일
  "2026-06-03", // 전국동시지방선거
  "2026-06-06", // 현충일
  "2026-08-15", // 광복절
  "2026-09-24", "2026-09-25", "2026-09-26", // 추석연휴
  "2026-10-03", "2026-10-05", // 개천절, 대체휴일
  "2026-10-09", // 한글날
  "2026-12-25", // 성탄절
]);

function toIsoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isSchoolDay(dateStr) {
  const dow = new Date(`${dateStr}T00:00:00`).getDay(); // 0=일, 6=토
  if (dow === 0 || dow === 6) return false;
  return !NON_SCHOOL_DAYS.has(dateStr);
}

// prevEndDate와 nextDate 사이(양 끝 제외)에 낀 날이 전부 비등교일이면(또는 사이에 낀 날이 없으면) 연속으로 본다.
function isConsecutiveAbsence(prevEndDate, nextDate) {
  const cursor = new Date(`${prevEndDate}T00:00:00`);
  const end = new Date(`${nextDate}T00:00:00`);
  cursor.setDate(cursor.getDate() + 1);
  if (cursor >= end) return cursor.getTime() === end.getTime();
  while (cursor < end) {
    if (isSchoolDay(toIsoDate(cursor))) return false;
    cursor.setDate(cursor.getDate() + 1);
  }
  return true;
}

// 결석/지각·조퇴·결과가 일어난 날의 "다음날"을 확인(제출)일로 쓴다. 그 다음날이 주말·공휴일이면
// 등교일이 아니므로 그 다음 평일까지 계속 넘긴다(사용자 지정 규칙). 같은 학생이 다른 사유로 또
// 결석한 날(예: 병결석 다음이 바로 미인정결석 기간)도 확인서를 제출·서명할 수 없는 날이므로
// absenceDates에 있으면 마찬가지로 건너뛴다(사용자 지정 규칙).
function nextSchoolDay(dateStr, absenceDates) {
  const cursor = new Date(`${dateStr}T00:00:00`);
  cursor.setDate(cursor.getDate() + 1);
  while (!isSchoolDay(toIsoDate(cursor)) || (absenceDates && absenceDates.has(toIsoDate(cursor)))) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return toIsoDate(cursor);
}

// "지각을"/"조퇴를"처럼 마지막 글자 받침 유무에 따라 을/를 조사를 고른다.
function eulReulParticle(word) {
  if (!word) return "";
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "를";
  return code % 28 === 0 ? "를" : "을";
}

/* ---- 월별 출결 현황 PDF 파싱 ----
 * 나이스에서 내려받은 "월별 출결 현황" PDF는 표 형태(일자/번호/성명/출결구분/결시교시/사유)이고,
 * 같은 학생이 여러 날 연속으로 나오면 번호·성명 칸이 병합되어 빈칸으로 나온다.
 * pdf.js는 이 병합 셀 구조를 모르기 때문에, 출결구분(질병/미인정/출석인정/기타 + 결석/지각/조퇴/결과)
 * 이라는 정해진 어휘를 기준으로 각 행의 시작을 찾고, 번호·성명이 비어 있으면 직전 값을 이어서 쓴다.
 */

const CATEGORY_ALT = "질병|미인정|출석인정|기타";
const KIND_ALT = "결석|지각|조퇴|결과";

function buildRowRegex() {
  const rowStart = `(\\d{4})\\.(\\d{2})\\.(\\d{2})\\.?\\s*(?:(\\d{1,2})\\s+([가-힣]{2,6})\\s+)?(${CATEGORY_ALT})(${KIND_ALT})\\s*`;
  const nextStart = `\\d{4}\\.\\d{2}\\.\\d{2}\\.?\\s*(?:\\d{1,2}\\s+[가-힣]{2,6}\\s+)?(?:${CATEGORY_ALT})(?:${KIND_ALT})`;
  return new RegExp(`${rowStart}([\\s\\S]*?)(?=${nextStart}|$)`, "g");
}

// 결시교시 목록(조회/1~7교시/종례, 쉼표 구분)을 사유에서 떼어낸다.
// "종례"도 "6교시"처럼 줄바꿈 때문에 "종 례"로 중간에 공백이 끼어 나오는 경우가 있어(실제 파일로
// 확인) "교시"와 마찬가지로 글자 사이에 \s*를 넣어 관대하게 매칭한다.
const PERIOD_TOKEN_ALT = "조\\s*회|종\\s*례|[1-7]\\s*교\\s*시";
// 사유에 남은 결시교시 토큰을 최종적으로 한 번 더 걸러낼 때 쓴다 — 앞뒤에 쉼표·공백이 있는지 따지지
// 않고 어디에 붙어 있든 무조건 지운다(사용자 지정 규칙: 1교시 조퇴처럼 결시교시 목록 자체가 길어지면
// 여러 줄로 나뉘면서 "종례"뿐 아니라 다른 "N교시"까지 사유 여기저기 끼어드는 걸 실제 파일로 확인).
const STRAY_PERIOD_TOKEN_RE = new RegExp(PERIOD_TOKEN_ALT, "g");

// 결시교시 칸이 셀 안에서 줄바꿈되면, pdf.js가 읽는 순서상 남은 교시(특히 "종례")가 사유 앞이
// 아니라 사유 중간이나 끝에 끼어 나오는 경우가 있다(실제 파일로 확인) — 앞부분만 떼어내는 방식으로는
// 못 잡아서, tail 전체에서 교시 토큰을 찾아 모두 골라내고 나머지 글자만 이어 붙여 사유로 삼는다.
// "6교시"가 줄바꿈으로 "6교 시"처럼 중간에 공백이 끼어 나오는 경우도 있어 관대하게 매칭한다(실제 파일로 확인).
function splitPeriodsAndReason(tail) {
  const tokenRe = new RegExp(`(^|,|\\s)(${PERIOD_TOKEN_ALT})(?=,|\\s|$)`, "g");
  const periods = [];
  const rest = tail.replace(tokenRe, (whole, lead, token) => {
    periods.push(token.replace(/\s+/g, ""));
    return lead === "," ? "," : " "; // 구분자는 남겨서 앞뒤 사유 글자가 서로 붙어버리지 않게 한다
  });
  const reason = rest.replace(/^[\s,]+/, "").replace(/\s{2,}/g, " ").trim();
  const cleaned = cleanReason(reason)
    .replace(STRAY_PERIOD_TOKEN_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
  return { periods: periods.join(","), reason: cleaned };
}

// 표 마지막 행의 사유 뒤에 페이지 머리말/꼬리말(학교명, 쪽번호, 기간 표시 등)이 붙어 나오는 경우를 잘라낸다.
function cleanReason(s) {
  return s
    .replace(/신언중학교[\s\S]*$/, "")
    .replace(/\d+\s*\/\s*\d+\s*$/, "")
    .replace(/\d{4}\.\d{2}\.\d{2}\.?\s*$/, "")
    .replace(/\S*학년\s*\d*\s*반[\s\S]*$/, "")
    .replace(/기간\s*[:：][\s\S]*$/, "")
    .trim();
}

async function extractTextPerPage(pdf) {
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(" "));
  }
  return pages;
}

function parsePageEvents(pageText, carry) {
  const re = buildRowRegex();
  const events = [];
  let m;
  while ((m = re.exec(pageText))) {
    const [, y, mo, da, numRaw, nameRaw, category, kind, tailRaw] = m;
    if (numRaw) carry.number = numRaw;
    if (nameRaw) carry.name = nameRaw;
    const { periods, reason } = splitPeriodsAndReason(tailRaw);
    events.push({
      number: carry.number,
      name: carry.name,
      date: `${y}-${mo}-${da}`,
      category,
      kind,
      periods,
      reason,
    });
  }
  return events;
}

async function parseStatsPdf(pdf) {
  const pages = await extractTextPerPage(pdf);
  const carry = { number: "", name: "" };
  let events = [];
  pages.forEach((pageText) => {
    events = events.concat(parsePageEvents(pageText, carry));
  });
  return events;
}

/* ---- 학생별 분류: 결석 → 결석신고서(연속 구간 병합) / 지각·조퇴·결과 → 단건·여러건 ---- */

const ABSENCE_CATEGORY_MAP = { 질병: "병결", 기타: "기타결", 출석인정: "출석인정결", 미인정: "미인정결" };

function classifyEvents(events) {
  const byStudent = new Map();
  events.forEach((ev) => {
    const key = ev.number || ev.name;
    if (!key) return;
    if (!byStudent.has(key)) byStudent.set(key, { number: ev.number, name: ev.name, events: [] });
    byStudent.get(key).events.push(ev);
  });

  const result = [];
  byStudent.forEach((student) => {
    const absences = student.events.filter((e) => e.kind === "결석").sort((a, b) => a.date.localeCompare(b.date));
    const others = student.events.filter((e) => e.kind !== "결석").sort((a, b) => a.date.localeCompare(b.date));

    // 같은 사유·같은 구분이 날짜상 연속되면 한 건의 결석신고서로 합치고, 끊기면 새 건으로 분리한다.
    const absenceBlocks = [];
    absences.forEach((ev) => {
      const last = absenceBlocks[absenceBlocks.length - 1];
      if (last && last.category === ev.category && last.reason === ev.reason && isConsecutiveAbsence(last.endDate, ev.date)) {
        last.endDate = ev.date;
        last.dayCount += 1; // 기간(달력상 일수)이 아니라 실제 결석한 날만 센다(주말·공휴일 제외).
      } else {
        absenceBlocks.push({ category: ev.category, reason: ev.reason, startDate: ev.date, endDate: ev.date, dayCount: 1 });
      }
    });

    result.push({
      number: student.number,
      name: student.name,
      absenceDocs: absenceBlocks,
      lateEvents: others,
      absenceDates: new Set(absences.map((e) => e.date)), // 확인일자 계산 시 이 학생이 결석한 날을 건너뛰는 데 씀
    });
  });

  return result.sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
}

// 지각·조퇴·결과 확인서의 "교시" 칸: 조퇴는 결시교시 중 제일 앞(이탈 시점), 지각은 제일 뒤(도착 직전),
// 결과는 전체를 그대로 적는다(사용자 지정 규칙).
function pickPeriodsForDoc(periodsStr, kind) {
  if (!periodsStr) return "";
  const tokens = periodsStr.split(",").filter(Boolean);
  if (!tokens.length) return "";
  if (kind === "조퇴") return tokens[0];
  if (kind === "지각") return tokens[tokens.length - 1];
  return periodsStr;
}

/* ---- 결석신고서 확인 방법 / 첨부서류 추정 (사용자 지정 규칙) ----
 * 아래 드롭다운 목록에 없는 값(교외체험학습 보고서, 학부모 전화 상담)으로 추정되면
 * "기타(직접입력)"을 고르고 그 값을 커스텀 입력칸에 채워 넣는다.
 */

const CONFIRM_METHOD_OPTIONS = ["학부모 전화상담", "대면상담", "진료확인서", "병원 진단서", "학생면담", "관련공문 확인"];
const ATTACHMENT_OPTIONS = ["진료확인서", "병원 진단서", "담임의견서", "학부모 의견서", "관련 공문"];

// 지각·조퇴·결과 확인서에서 담임의견서를 자동으로 만들어야 하는 경우(사용자 지정 규칙): 학교 재량으로
// 출석을 인정해준 지각·조퇴·결과(예: 현장체험학습 중 조퇴)나 질병으로 인한 지각·조퇴·결과(예: 병원
// 진료로 조퇴)는 결석의 "출석인정결"·"병결"과 같은 성격이라 학부모 확인이 필요하다고 보고, 결석신고서의
// 담임의견서와 같은 방식으로 자동 생성한다.
const OPINION_ELIGIBLE_CATEGORIES = new Set(["출석인정", "질병"]);
const OPINION_ELIGIBLE_KINDS = new Set(["지각", "조퇴", "결과"]);
function isOpinionEligible(category, kind) {
  return OPINION_ELIGIBLE_CATEGORIES.has(category) && OPINION_ELIGIBLE_KINDS.has(kind);
}

function suggestConfirmAndAttachment(category, reason) {
  if (category === "출석인정" && reason && reason.includes("교외체험학습")) {
    return { confirmMethod: "교외체험학습 보고서", attachment: "교외체험학습 보고서" };
  }
  if (category === "미인정") {
    return { confirmMethod: "학부모 전화 상담", attachment: "" };
  }
  return { confirmMethod: "", attachment: "" };
}

// select + "기타" 커스텀 입력 한 쌍에 값을 채운다. 목록에 없는 값이면 "기타"를 고르고 커스텀칸에 넣는다.
function applySelectValue(selectEl, customInputEl, options, value) {
  if (!value) {
    selectEl.value = "";
    customInputEl.style.display = "none";
    customInputEl.value = "";
    return;
  }
  if (options.includes(value)) {
    selectEl.value = value;
    customInputEl.style.display = "none";
    customInputEl.value = "";
  } else {
    selectEl.value = "__custom__";
    customInputEl.style.display = "";
    customInputEl.value = value;
  }
}

function readSelectValue(selectEl, customInputEl) {
  return selectEl.value === "__custom__" ? customInputEl.value.trim() : selectEl.value;
}

/* ---- 문서 HTML 생성 (absence.html / late-single.html / late-multi.html의 #doc 구조를 그대로 재현) ---- */

function buildAbsenceHtml(d) {
  const start = splitDate(d.startDate);
  const end = splitDate(d.endDate);
  const confirm = splitDate(d.confirmDate);
  const absCat = ABSENCE_CATEGORY_MAP[d.category] || "";
  const markCell = (cat) => (absCat === cat ? "○" : "");

  return `
    <div class="doc-block">
      <div class="doc-title">결 석 신 고 서</div>
      <div class="align-right">제 <span class="blank">${escapeHtml(GRADE)}</span> 학년 <span class="blank">${escapeHtml(CLASS_NO)}</span> 반 <span class="blank">${escapeHtml(d.number)}</span> 번</div>
      <div class="align-right">성 명 : <span class="blank wide">${escapeHtml(d.name)}</span></div>

      <p>본인은 다음과 같은 사유로 결석하였기에 결석계를 제출합니다.</p>

      <p>1. 결석 사유 : <span class="blank wide">${escapeHtml(d.reason)}</span></p>
      <p>2. 결석 기간 : <span class="blank">${start.y}</span>년 <span class="blank">${start.m}</span>월 <span class="blank">${start.d}</span>일 ~
        <span class="blank">${end.y}</span>년 <span class="blank">${end.m}</span>월 <span class="blank">${end.d}</span>일
        ( <span class="blank">${d.dayCount}</span> 일간)</p>

      <div class="align-center-right"><span class="blank">${confirm.y}</span>년 <span class="blank">${confirm.m}</span>월 <span class="blank">${confirm.d}</span>일</div>
      <div class="align-center-right">학 생 : <span class="blank wide">${escapeHtml(d.name)}</span> (인)</div>
      <div class="align-center-right">보호자 : <span class="blank wide"></span> (인)</div>
    </div>

    <div class="dotted-rule"></div>

    <div class="doc-block">
      <div class="confirm-header">
        <div class="doc-title small">담 임 확 인 서</div>
        <table class="approval-table">
          <tr><th>계</th><th>부장</th></tr>
          <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
        </table>
      </div>

      <p>1. 구분 : 병결( <span class="mark">${markCell("병결")}</span> ), 기타결( <span class="mark">${markCell("기타결")}</span> ),
        출석인정결( <span class="mark">${markCell("출석인정결")}</span> ), 미인정결( <span class="mark">${markCell("미인정결")}</span> )</p>
      <p>2. 확인 방법: ( <span class="blank wide">${escapeHtml(d.confirmMethod || "")}</span> )방법으로 확인함.</p>
      <p>3. 첨부서류: <span class="blank wide">${escapeHtml(d.attachment || "")}</span></p>
      <p class="note">※ 담임교사 확인은 학부모와 전화 통화, 학생 면담 등 구체적으로 기재</p>

      <p class="align-center">위의 사실을 확인함</p>
      <div class="align-center-right"><span class="blank">${confirm.y}</span>년 <span class="blank">${confirm.m}</span>월 <span class="blank">${confirm.d}</span>일</div>
      <div class="align-center-right">담 임 : <span class="blank wide">${escapeHtml(TEACHER_NAME)}</span> (인)</div>

      <div class="school-title">신 언 중 학 교 장</div>
    </div>
  `;
}

// 담임의견서는 결석신고서든 지각·조퇴·결과 확인서든 원본 문서에 이어 붙이지 않고 완전히 별도의
// 문서(#opinion-list 안, 별도 PDF)로 만든다(사용자 지정 — 담임 의견서는 원래 학교 서식상 그 자체로
// 독립된 한 장짜리 문서이기 때문). 4. 2026학년도 신언중 담임 의견서.pdf 서식을 그대로 재현하되,
// 원본에서 손으로 채우는 빈칸("(  )")은 전부 자동으로 채우므로 빈칸 표시(괄호)는 없애고 값만 넣는다.
// getOpinionItems()가 문서 종류(결석신고서/지각·조퇴·결과 확인서)에 상관없이 이 함수가 쓸 수 있는
// 공통 모양({name, number, date, reason, verb, confirmDate})으로 맞춰서 넘긴다 — verb는 담임의견
// 문장 끝에 들어갈 동사(결석/지각/조퇴/결과)이고, 결석신고서는 결석 첫날(연속 결석이어도 학부모
// 확인 통화는 결석 당일에 이뤄지므로), 지각·조퇴·결과는 해당 건 당일을 date로 쓴다.
function buildTeacherOpinionHtml(o) {
  const evDate = splitDate(o.date);
  const dow = koreanDayOfWeek(o.date);
  const confirm = splitDate(o.confirmDate);

  return `
    <div class="doc-title opinion">담임 의견서</div>
    <div class="align-right">${escapeHtml(GRADE)}학년 ${escapeHtml(CLASS_NO)}반 ${escapeHtml(o.number)}번</div>
    <div class="align-right">이름: <span class="blank wide">${escapeHtml(o.name)}</span></div>

    <table class="opinion-table">
      <tr>
        <th>담임<br>의견</th>
        <td>${evDate.m}월 ${evDate.d}일 ${dow}요일 ${escapeHtml(o.reason)}(으)로 인해 ${escapeHtml(o.verb)}함을 학부모와 유선연락으로 확인합니다.</td>
      </tr>
    </table>

    <p class="align-center">${confirm.y}년 ${confirm.m}월 ${confirm.d}일</p>
    <p class="align-center-right">학생 : <span class="blank wide">${escapeHtml(o.name)}</span> (인)</p>
    <p class="align-center-right">담임교사 : <span class="blank wide">${escapeHtml(TEACHER_NAME)}</span> (인)</p>

    <div class="school-title">신 언 중 학 교</div>
  `;
}

// currentDoc(결석신고서/지각·조퇴·결과 확인서 단건·여러건)에서 담임의견서로 만들어야 할 건을
// 모두 뽑아 buildTeacherOpinionHtml()이 바로 쓸 수 있는 모양으로 정규화한다. 결석신고서는 첨부서류로
// "담임의견서"를 골랐을 때만(사용자가 직접 고르는 기존 방식), 지각·조퇴·결과 확인서는 출석인정
// 또는 질병 지각·조퇴·결과 건이면 항상(사용자 지정 — 고를 수 있는 첨부서류 개념이 없는 문서라
// 자동 생성). 여러건 확인서에 해당 건이 여럿이면 결석신고서와 같은 방식으로 건(날짜)마다 별도
// 담임의견서를 만든다(사용자 지정: 날짜별로 각각 생성).
function getOpinionItems(doc) {
  if (!doc) return [];

  if (doc.type === "absence") {
    if (doc.data.attachment !== "담임의견서") return [];
    return [{
      label: "담임의견서",
      name: doc.data.name, number: doc.data.number,
      date: doc.data.startDate, reason: doc.data.reason, verb: "결석",
      confirmDate: doc.data.confirmDate,
    }];
  }

  if (doc.type === "late-single") {
    if (!isOpinionEligible(doc.data.category, doc.data.kind)) return [];
    return [{
      label: `담임의견서 (${formatDateSlash(doc.data.date)}, ${doc.data.category}${doc.data.kind})`,
      name: doc.data.name, number: doc.data.number,
      date: doc.data.date, reason: doc.data.reason, verb: doc.data.kind,
      confirmDate: doc.data.confirmDate,
    }];
  }

  if (doc.type === "late-multi") {
    return doc.data.events
      .filter((ev) => isOpinionEligible(ev.category, ev.kind))
      .map((ev) => ({
        label: `담임의견서 (${formatDateSlash(ev.date)}, ${ev.category}${ev.kind})`,
        name: doc.data.name, number: doc.data.number,
        date: ev.date, reason: ev.reason, verb: ev.kind,
        confirmDate: ev.confirmDate,
      }));
  }

  return [];
}

function buildLateSingleHtml(d) {
  const particle = eulReulParticle(d.kind);
  const confirm = splitDate(d.confirmDate);
  return `
    <div class="doc-title compact">( <span class="blank">${escapeHtml(d.month)}</span> )월 지각·조퇴·결과 확인서</div>
    <div class="align-right">제 <span class="blank">${escapeHtml(GRADE)}</span> 학년 <span class="blank">${escapeHtml(CLASS_NO)}</span> 반 <span class="blank">${escapeHtml(d.number)}</span> 번</div>
    <div class="align-right">성 명 : <span class="blank wide">${escapeHtml(d.name)}</span></div>

    <table class="record-table">
      <tr><th>일 자</th><th>교 시</th><th>종 류</th><th>사 유</th></tr>
      <tr>
        <td>${escapeHtml(formatDateSlash(d.date))}</td>
        <td>${escapeHtml(pickPeriodsForDoc(d.periods, d.kind))}</td>
        <td>${escapeHtml(d.category)}${escapeHtml(d.kind)}</td>
        <td class="reason-cell">${escapeHtml(d.reason)}</td>
      </tr>
    </table>

    <p>위와 같이 ${escapeHtml(d.category)}${escapeHtml(d.kind)}${particle} 하였기에 확인서를 제출합니다.</p>

    <div class="align-center-right">학 생 : <span class="blank wide">${escapeHtml(d.name)}</span> (인)</div>
    <div class="align-center-right">보호자 : <span class="blank wide"></span> (인)</div>

    <p class="align-center"><span class="blank">${confirm.y}</span>년 <span class="blank">${confirm.m}</span>월 <span class="blank">${confirm.d}</span>일</p>
    <div class="school-title">신 언 중 학 교 장</div>

    <div class="solid-rule"></div>

    <table class="approval-table2">
      <tr><th rowspan="2" class="label">결<br>재</th><th>계</th><th>부장</th></tr>
      <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
    </table>

    <p class="note">*종류란에는 출석인정, 질병, 미인정, 기타 중 하나를 표기하여 주십시오.</p>
  `;
}

function buildLateMultiHtml(d) {
  const rows = d.events
    .map(
      (ev) => `
      <tr>
        <td>${escapeHtml(formatDateSlash(ev.date))}</td>
        <td>${escapeHtml(pickPeriodsForDoc(ev.periods, ev.kind))}</td>
        <td>${escapeHtml(ev.category)}${escapeHtml(ev.kind)}</td>
        <td class="reason-cell">${escapeHtml(ev.reason)}</td>
      </tr>`
    )
    .join("");
  const confirm = splitDate(d.confirmDate);

  return `
    <div class="doc-title compact">( <span class="blank">${escapeHtml(d.month)}</span> )월 지각·조퇴·결과 확인서</div>
    <div class="align-right">제 <span class="blank">${escapeHtml(GRADE)}</span> 학년 <span class="blank">${escapeHtml(CLASS_NO)}</span> 반 <span class="blank">${escapeHtml(d.number)}</span> 번</div>
    <div class="align-right">성 명 : <span class="blank wide">${escapeHtml(d.name)}</span></div>

    <table class="record-table">
      <tr><th>일 자</th><th>교 시</th><th>종 류</th><th>사 유</th></tr>
      ${rows}
    </table>

    <p>위와 같이 지각·조퇴·결과를 하였기에 확인서를 제출합니다.</p>

    <div class="align-center-right">학 생 : <span class="blank wide">${escapeHtml(d.name)}</span> (인)</div>
    <div class="align-center-right">보호자 : <span class="blank wide"></span> (인)</div>

    <p class="align-center"><span class="blank">${confirm.y}</span>년 <span class="blank">${confirm.m}</span>월 <span class="blank">${confirm.d}</span>일</p>
    <div class="school-title">신 언 중 학 교 장</div>

    <div class="solid-rule"></div>

    <table class="approval-table2">
      <tr><th rowspan="2" class="label">결<br>재</th><th>계</th><th>부장</th></tr>
      <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
    </table>
  `;
}

function buildDocHtml(doc) {
  if (doc.type === "absence") return buildAbsenceHtml(doc.data);
  if (doc.type === "late-single") return buildLateSingleHtml(doc.data);
  return buildLateMultiHtml(doc.data);
}

/* ---- 학생별 문서 목록 생성 (분류 결과 → 실제 저장·렌더링에 쓰는 데이터) ---- */

// classifyEvents() 결과를 화면에 그릴 수 있는 형태(학생별 문서 목록)로 만든다.
function buildStudentDocs(students) {
  return students
    .filter((s) => s.absenceDocs.length || s.lateEvents.length)
    .map((s) => {
      const docs = [];

      s.absenceDocs.forEach((block) => {
        const catLabel = ABSENCE_CATEGORY_MAP[block.category] || block.category;
        const label = block.startDate === block.endDate
          ? `결석신고서 (${formatDateSlash(block.startDate)}, ${catLabel})`
          : `결석신고서 (${formatDateSlash(block.startDate)}~${formatDateSlash(block.endDate)}, ${catLabel})`;
        const suggested = suggestConfirmAndAttachment(block.category, block.reason);
        docs.push({
          type: "absence",
          label,
          data: {
            number: s.number, name: s.name, category: block.category, reason: block.reason,
            startDate: block.startDate, endDate: block.endDate, dayCount: block.dayCount,
            confirmMethod: suggested.confirmMethod, attachment: suggested.attachment,
            confirmDate: nextSchoolDay(block.endDate, s.absenceDates),
          },
        });
      });

      if (s.lateEvents.length === 1) {
        const ev = s.lateEvents[0];
        docs.push({
          type: "late-single",
          label: `지각·조퇴·결과 확인서 (${formatDateSlash(ev.date)}, ${ev.kind})`,
          data: {
            number: s.number, name: s.name, month: splitDate(ev.date).m, date: ev.date, periods: ev.periods,
            category: ev.category, kind: ev.kind, reason: ev.reason, confirmDate: nextSchoolDay(ev.date, s.absenceDates),
          },
        });
      } else if (s.lateEvents.length > 1) {
        const lastEvent = s.lateEvents[s.lateEvents.length - 1]; // 날짜순 정렬됨(classifyEvents) — 마지막이 최종일
        // 출석인정지각·조퇴·결과 건의 담임의견서(getOpinionItems)는 건마다 별도 문서라 건별 확인일자가
        // 필요하다 — 문서 전체의 confirmDate(마지막 건 기준)와는 별개로 건마다 계산해 붙여둔다.
        s.lateEvents.forEach((ev) => {
          ev.confirmDate = nextSchoolDay(ev.date, s.absenceDates);
        });
        docs.push({
          type: "late-multi",
          label: `지각·조퇴·결과 확인서 (여러건, ${s.lateEvents.length}건)`,
          data: {
            number: s.number, name: s.name, month: splitDate(s.lateEvents[0].date).m, events: s.lateEvents,
            confirmDate: nextSchoolDay(lastEvent.date, s.absenceDates),
          },
        });
      }

      return { number: s.number, name: s.name, docs };
    });
}

/* ---- 학생 명단 렌더링 ---- */

function renderStudentList(studentDocs) {
  const wrap = $("student-list-wrap");
  const list = $("student-list");
  list.innerHTML = "";

  if (!studentDocs || !studentDocs.length) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";

  studentDocs.forEach((s) => {
    const li = document.createElement("li");
    li.className = "student-item";

    const nameEl = document.createElement("div");
    nameEl.className = "student-name";
    nameEl.textContent = `${s.number ? s.number + "번 " : ""}${s.name}`;
    li.appendChild(nameEl);

    s.docs.forEach((doc) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "doc-pick-btn";
      btn.textContent = doc.label;
      btn.addEventListener("click", () => selectDoc(doc));
      li.appendChild(btn);
    });

    list.appendChild(li);
  });
}

/* ---- 미리보기 선택 / PDF 열기·저장 ---- */

let currentDoc = null;

// 문서 내용만 다시 그린다(선택 방법·첨부서류를 고칠 때마다 PDF 탭을 새로 열지 않기 위해 선택과 분리).
function renderCurrentDocPreview() {
  const docEl = $("doc");
  docEl.className = "document" + (currentDoc.type === "absence" ? " absence-doc" : " tall");
  docEl.innerHTML = buildDocHtml(currentDoc);
  docEl.style.display = "";
  renderOpinionPreview();
}

// 결석신고서에서 첨부서류로 "담임의견서"를 골랐거나, 지각·조퇴·결과 확인서에 출석인정지각·조퇴·결과
// 건이 있는 동안, 완전히 별도의 문서(#opinion-list 안)로 담임의견서를 만들어 보여준다 — 여러건
// 확인서는 해당 건이 여럿이면 건마다 하나씩(사용자 지정: 결석신고서·확인서 본문과 합쳐진 한 장이
// 아니라 건별로 따로 만든 한 장이어야 함). 첨부서류·확인일자를 고칠 때마다 renderCurrentDocPreview()
// 를 통해 같이 다시 그려진다.
function renderOpinionPreview() {
  const items = getOpinionItems(currentDoc);
  const listEl = $("opinion-list");
  listEl.innerHTML = "";
  $("opinion-section").style.display = items.length ? "" : "none";

  items.forEach((item) => {
    const block = document.createElement("div");
    block.className = "opinion-item";

    if (items.length > 1) {
      const heading = document.createElement("p");
      heading.className = "note";
      heading.textContent = item.label;
      block.appendChild(heading);
    }

    const row = document.createElement("div");
    row.className = "row";
    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = "저장하기";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.textContent = "PDF 열기";
    row.appendChild(downloadBtn);
    row.appendChild(openBtn);
    block.appendChild(row);

    // 나머지 3개 실제 서식(결석신고서/지각·조퇴·결과 확인서)과 같은 용지 느낌을 내려면 그 서식들과
    // 같은 "tall" 처리(굴림체, 줄간격 2.4, 위/아래 여백)가 필요하다 — 이 클래스가 없으면 기본값
    // (Pretendard, 줄간격 2.3, 여백 110px)으로 렌더링되어 실제 담임 의견서 서식과 확연히 달라 보였다.
    const docEl = document.createElement("div");
    docEl.className = "document tall opinion-doc";
    docEl.innerHTML = buildTeacherOpinionHtml(item);
    block.appendChild(docEl);

    downloadBtn.addEventListener("click", async () => {
      const pdf = await buildPortraitPdf(docEl);
      const filename = buildOpinionFilename(item);
      await savePdfBlob(pdf.output("blob"), filename);
      logSavedFile("attendance-batch", filename);
    });
    openBtn.addEventListener("click", async () => {
      const pdf = await buildPortraitPdf(docEl);
      window.open(pdf.output("bloburl"), "_blank");
    });

    listEl.appendChild(block);
  });
}

// 학생 명단에서 문서를 고르면 미리보기만 갱신한다 — PDF는 "PDF 열기" 버튼을 눌러야만 연다(사용자 지정).
function selectDoc(doc) {
  currentDoc = doc;
  renderCurrentDocPreview();
  $("preview-empty").style.display = "none";
  $("preview-actions").style.display = "";
  $("preview-save-note").style.display = "";

  // 확인(제출)일자 — 문서 종류와 무관하게 항상 편집 가능(사용자 지정).
  $("confirm-date-panel").style.display = "";
  $("confirm-date-note").style.display = "";
  $("edit-confirm-date").value = doc.data.confirmDate || "";

  const isAbsence = doc.type === "absence";
  $("absence-edit-panel").style.display = isAbsence ? "" : "none";
  if (isAbsence) {
    applySelectValue($("edit-confirm-method"), $("edit-confirm-method-custom"), CONFIRM_METHOD_OPTIONS, doc.data.confirmMethod);
    applySelectValue($("edit-attachment"), $("edit-attachment-custom"), ATTACHMENT_OPTIONS, doc.data.attachment);
  }
}

function onAbsenceFieldChange() {
  if (!currentDoc || currentDoc.type !== "absence") return;
  currentDoc.data.confirmMethod = readSelectValue($("edit-confirm-method"), $("edit-confirm-method-custom"));
  currentDoc.data.attachment = readSelectValue($("edit-attachment"), $("edit-attachment-custom"));
  renderCurrentDocPreview();
}

$("edit-confirm-method").addEventListener("change", () => {
  $("edit-confirm-method-custom").style.display = $("edit-confirm-method").value === "__custom__" ? "" : "none";
  onAbsenceFieldChange();
});
$("edit-confirm-method-custom").addEventListener("input", onAbsenceFieldChange);
$("edit-attachment").addEventListener("change", () => {
  $("edit-attachment-custom").style.display = $("edit-attachment").value === "__custom__" ? "" : "none";
  onAbsenceFieldChange();
});
$("edit-attachment-custom").addEventListener("input", onAbsenceFieldChange);

$("edit-confirm-date").addEventListener("change", () => {
  if (!currentDoc) return;
  currentDoc.data.confirmDate = $("edit-confirm-date").value;
  renderCurrentDocPreview();
});

function buildFilename(doc) {
  // 파일명 맨 앞 날짜는 다른 작성도우미 페이지들과 같은 관례대로 확인(제출)일자를 우선 쓰고,
  // 없을 때만 오늘 날짜로 대신한다.
  const today = new Date();
  const confirm = splitDate(doc.data.confirmDate);
  const dateStr = confirm.y && confirm.m && confirm.d
    ? formatSaveDate(confirm.y, confirm.m, confirm.d)
    : formatSaveDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  // 한 학생이 결석신고서를 여러 건 받을 수 있어(분절된 결석), 파일명이 겹치지 않도록 문서별 날짜를 붙인다.
  let typeLabel;
  if (doc.type === "absence") {
    const range = doc.data.startDate === doc.data.endDate
      ? formatDateSlash(doc.data.startDate).replace("/", "-")
      : `${formatDateSlash(doc.data.startDate).replace("/", "-")}~${formatDateSlash(doc.data.endDate).replace("/", "-")}`;
    typeLabel = `결석신고서(${range})`;
  } else if (doc.type === "late-single") {
    typeLabel = `지각조퇴결과확인서(${formatDateSlash(doc.data.date).replace("/", "-")})`;
  } else {
    typeLabel = "지각조퇴결과확인서(여러건)";
  }
  return `${dateStr}(${doc.data.name})_${typeLabel}.pdf`;
}

// 담임의견서는 원본 문서(결석신고서/지각·조퇴·결과 확인서)와 별개의 파일이므로 파일명도 따로
// 만든다(사용자 지정). getOpinionItems()가 만든 정규화된 항목을 받는다 — 여러건 확인서에서 같은
// 학생이 담임의견서를 여러 개 받을 수 있어(건마다 별도), 파일명이 겹치지 않도록 해당 건 날짜를 붙인다.
function buildOpinionFilename(item) {
  const today = new Date();
  const confirm = splitDate(item.confirmDate);
  const dateStr = confirm.y && confirm.m && confirm.d
    ? formatSaveDate(confirm.y, confirm.m, confirm.d)
    : formatSaveDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const eventDate = formatDateSlash(item.date).replace("/", "-");
  return `${dateStr}(${item.name})_담임의견서(${eventDate}).pdf`;
}

// 이 기능(로컬 폴더에 바로 저장)을 지원하지 않는 브라우저(Firefox/Safari 등)에서는
// "저장 폴더 변경" 버튼 자체를 숨긴다 — 눌러도 할 수 있는 일이 없으므로.
if (!window.showDirectoryPicker) $("change-save-dir-btn").style.display = "none";

$("open-btn").addEventListener("click", async () => {
  if (!currentDoc) return;
  const pdf = await buildPortraitPdf($("doc"));
  window.open(pdf.output("bloburl"), "_blank");
});

$("download-btn").addEventListener("click", async () => {
  if (!currentDoc) return;
  const pdf = await buildPortraitPdf($("doc"));
  const filename = buildFilename(currentDoc);
  await savePdfBlob(pdf.output("blob"), filename);
  logSavedFile("attendance-batch", filename);
});

$("change-save-dir-btn").addEventListener("click", changeSaveDirectory);

renderSaveLog("attendance-batch");

/* ---- PDF 업로드 처리 ---- */

$("stats-pdf").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("stats-status").textContent = "PDF를 분석하는 중...";
  $("student-list-wrap").style.display = "none";
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const rawEvents = await parseStatsPdf(pdf);
    const events = rawEvents.filter((ev) => ev.name);

    if (!events.length) {
      $("stats-status").textContent = `업로드됨: ${file.name} — 출결 기록을 찾지 못했습니다. "월별 출결 현황" 형식의 PDF인지 확인해주세요.`;
      return;
    }

    const students = classifyEvents(events);
    const studentDocs = buildStudentDocs(students);
    renderStudentList(studentDocs);

    const absCount = students.reduce((sum, s) => sum + s.absenceDocs.length, 0);
    const lateCount = students.reduce((sum, s) => sum + (s.lateEvents.length ? 1 : 0), 0);
    $("stats-status").textContent = `업로드됨: ${file.name} — 출결 기록 ${events.length}건 인식, 결석신고서 ${absCount}건 · 지각·조퇴·결과 확인서 ${lateCount}건을 생성했습니다.`;
  } catch (err) {
    $("stats-status").textContent = `PDF 분석에 실패했습니다: ${err.message}`;
  }
});
