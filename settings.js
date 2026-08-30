// 학년/반/담임 성함을 여러 페이지에서 공유하기 위한 저장소 (localStorage).

const SETTINGS_KEY = "attendance-settings";

function getSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { grade: "", classNo: "", teacherName: "" };
  const parsed = JSON.parse(raw);
  return {
    grade: parsed.grade || "",
    classNo: parsed.classNo || "",
    teacherName: parsed.teacherName || "",
  };
}

function saveSettings(partial) {
  const current = getSettings();
  const updated = { ...current, ...partial };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}
