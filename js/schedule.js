import { todayStr, addDays, diffDays } from './date-utils.js';

export const STRENGTH_EXERCISES = [
  { name: '深蹲', sets: '3组 x 15次', desc: '双脚与肩同宽,臀部向后向下坐,膝盖不超过脚尖' },
  { name: '臀桥 / 顶髋', sets: '3组 x 15次', desc: '仰卧屈膝,臀部发力向上顶起,顶端停顿一下' },
  { name: '后撤箭步蹲(左右各)', sets: '3组 x 10次', desc: '一脚向后撤一大步,后膝轻触地面再站起' },
  { name: '侧卧抬腿(左右各)', sets: '2组 x 15次', desc: '侧躺,上方腿伸直向上抬起,再缓慢放下' },
  { name: '驴踢腿(左右各)', sets: '2组 x 15次', desc: '跪姿撑地,一侧膝盖屈曲向后上方蹬起' },
  { name: '提踵', sets: '3组 x 20次', desc: '双脚站立,脚跟提起至最高点,再缓慢放下' },
  { name: '平板支撑', sets: '3组 x 30-45秒', desc: '手肘撑地,身体呈一条直线,收紧核心' },
  { name: '死虫式', sets: '2组 x 12次', desc: '仰卧屈膝屈肘,对侧手脚缓慢伸展再收回' },
  { name: '侧平举(5lb)', sets: '3组 x 12-15次', desc: '双手持哑铃,手臂伸直向两侧抬至肩高' },
  { name: '前平举(5lb)', sets: '3组 x 12-15次', desc: '双手持哑铃,手臂伸直向前抬至肩高' },
  { name: '竖直上举(5lb)', sets: '3组 x 12-15次', desc: '双手持哑铃,手臂从体侧向上举过头顶' },
  { name: '前平举内收(5lb)', sets: '3组 x 12-15次', desc: '手臂抬至胸前高度,向内收拢再打开' },
  { name: '俯卧撑', sets: '3组 x 力竭前', desc: '双手与肩同宽撑地,身体呈直线屈臂下压' }
];

export const CARDIO_ITEMS = [
  { name: '踏步机 90-120分钟', sets: '', desc: '保持匀速,可结合下面的哑铃动作每15-20分钟穿插一次' },
  { name: '侧平举', sets: '2-3组 x 30-45秒', desc: '双手持哑铃,手臂伸直向两侧抬至肩高' },
  { name: '前平举', sets: '2-3组 x 30-45秒', desc: '双手持哑铃,手臂伸直向前抬至肩高' },
  { name: '竖直上举', sets: '2-3组 x 30-45秒', desc: '双手持哑铃,手臂从体侧向上举过头顶' },
  { name: '前平举内收', sets: '2-3组 x 30-45秒', desc: '手臂抬至胸前高度,向内收拢再打开' }
];

export function getItemsForType(type) {
  return type === 'strength' ? STRENGTH_EXERCISES : CARDIO_ITEMS;
}

function alternate(type) {
  return type === 'cardio' ? 'strength' : 'cardio';
}

function blankEntry(date, type) {
  return { date, type, completed: false, checkedItems: [] };
}

export function generateInitial(startDate = todayStr(), windowDays = 45) {
  const schedule = [];
  let type = 'cardio';
  let date = startDate;
  for (let i = 0; i < windowDays; i += 1) {
    schedule.push(blankEntry(date, type));
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
  const list = schedule.map((e) => ({ ...e, checkedItems: e.checkedItems || [] }));
  while (diffDays(today, list[list.length - 1].date) < minBuffer) {
    const tail = list[list.length - 1];
    list.push(blankEntry(addDays(tail.date, 1), alternate(tail.type)));
  }
  return list;
}

export function findIndexByDate(schedule, dateStr) {
  return schedule.findIndex((e) => e.date === dateStr);
}

export function getEntry(schedule, dateStr) {
  return schedule.find((e) => e.date === dateStr);
}

// Replaces the full checklist selection for the given day in one go (used
// by the "save" action, which commits a batch of local checkbox edits
// rather than writing on every single tap). `completed` is derived
// automatically: the day is "done" once every item on its checklist is
// checked.
export function setCheckedItems(schedule, dateStr, checkedItems) {
  return schedule.map((e) => {
    if (e.date !== dateStr) return e;
    const total = getItemsForType(e.type).length;
    return { ...e, checkedItems, completed: checkedItems.length >= total };
  });
}

// Shifts the target day and every later entry forward by one calendar day,
// then appends one new entry at the tail (continuing the alternation) so
// the window length is unchanged. Period logs are untouched by design.
// The vacated date simply has no schedule entry — rendered as a rest day.
export function postpone(schedule, dateStr) {
  const idx = findIndexByDate(schedule, dateStr);
  if (idx === -1) return schedule;
  const list = schedule.map((e) => ({ ...e }));
  for (let i = idx; i < list.length; i += 1) {
    list[i].date = addDays(list[i].date, 1);
  }
  const tail = list[list.length - 1];
  list.push(blankEntry(addDays(tail.date, 1), alternate(tail.type)));
  return list;
}
