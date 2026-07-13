// `fields` holds whatever the day-card tracks: mood, work, note, and the
// lunch/dinner extra-snack flags. Passed as an object rather than a fixed
// positional list since this keeps growing with new per-day fields.
export function upsertDailyLog(dailyLogs, dateStr, fields) {
  const idx = dailyLogs.findIndex((e) => e.date === dateStr);
  const entry = { date: dateStr, ...fields };
  if (idx === -1) return [...dailyLogs, entry];
  const list = [...dailyLogs];
  list[idx] = entry;
  return list;
}

export function getDailyLog(dailyLogs, dateStr) {
  return dailyLogs.find((e) => e.date === dateStr);
}
