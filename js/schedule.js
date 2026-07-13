import { todayStr, addDays, diffDays } from './date-utils.js';

export const STRENGTH_EXERCISES = [
  { name: '深蹲', sets: '3组 x 15次' },
  { name: '臀桥 / 顶髋', sets: '3组 x 15次' },
  { name: '后撤箭步蹲(左右各)', sets: '3组 x 10次' },
  { name: '侧卧抬腿(左右各)', sets: '2组 x 15次' },
  { name: '驴踢腿(左右各)', sets: '2组 x 15次' },
  { name: '提踵', sets: '3组 x 20次' },
  { name: '平板支撑', sets: '3组 x 30-45秒' },
  { name: '死虫式', sets: '2组 x 12次' },
  { name: '侧平举(5lb)', sets: '3组 x 12-15次' },
  { name: '前平举(5lb)', sets: '3组 x 12-15次' },
  { name: '竖直上举(5lb)', sets: '3组 x 12-15次' },
  { name: '前平举内收(5lb)', sets: '3组 x 12-15次' },
  { name: '俯卧撑', sets: '3组 x 力竭前' }
];

export const CARDIO_ARM_MOVES = ['侧平举', '前平举', '竖直上举', '前平举内收'];

function alternate(type) {
  return type === 'cardio' ? 'strength' : 'cardio';
}

export function generateInitial(startDate = todayStr(), windowDays = 45) {
  const schedule = [];
  let type = 'cardio';
  let date = startDate;
  for (let i = 0; i < windowDays; i += 1) {
    schedule.push({ date, type, completed: false });
    date = addDays(date, 1);
    type = alternate(type);
  }
  return schedule;
}

// Extends the tail of the rolling schedule so there's always at least
// `minBuffer` days of upcoming plan beyond today.
export function ensureWindow(schedule, windowDays = 45, minBuffer = 20) {
  if (!schedule || schedule.length === 0) return generateInitial(todayStr(), windowDays);
  const today = todayStr();
  const list = schedule.map((e) => ({ ...e }));
  while (diffDays(today, list[list.length - 1].date) < minBuffer) {
    const tail = list[list.length - 1];
    list.push({ date: addDays(tail.date, 1), type: alternate(tail.type), completed: false });
  }
  return list;
}

export function findIndexByDate(schedule, dateStr) {
  return schedule.findIndex((e) => e.date === dateStr);
}

export function getEntry(schedule, dateStr) {
  return schedule.find((e) => e.date === dateStr);
}

export function markComplete(schedule, dateStr, completed = true) {
  return schedule.map((e) => (e.date === dateStr ? { ...e, completed } : e));
}

// Shifts the target day and every later entry forward by one calendar day,
// then appends one new entry at the tail (continuing the alternation) so
// the window length is unchanged. Period logs are untouched by design.
export function postpone(schedule, dateStr) {
  const idx = findIndexByDate(schedule, dateStr);
  if (idx === -1) return schedule;
  const list = schedule.map((e) => ({ ...e }));
  for (let i = idx; i < list.length; i += 1) {
    list[i].date = addDays(list[i].date, 1);
  }
  const tail = list[list.length - 1];
  list.push({ date: addDays(tail.date, 1), type: alternate(tail.type), completed: false });
  return list;
}
