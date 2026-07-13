export function upsertDailyLog(dailyLogs, dateStr, mood, work, note) {
  const idx = dailyLogs.findIndex((e) => e.date === dateStr);
  const entry = { date: dateStr, mood, work, note };
  if (idx === -1) return [...dailyLogs, entry];
  const list = [...dailyLogs];
  list[idx] = entry;
  return list;
}

export function getDailyLog(dailyLogs, dateStr) {
  return dailyLogs.find((e) => e.date === dateStr);
}
