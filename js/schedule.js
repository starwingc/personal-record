import { todayStr, addDays, diffDays } from './date-utils.js';

export const STRENGTH_EXERCISES = [
  { name: '俯卧撑', sets: '3组 x 力竭前', desc: '双手与肩同宽撑地,身体呈直线屈臂下压;手腕不适可换跪姿俯卧撑' },
  { name: '哑铃划船(左右各)', sets: '3组 x 12-15次', desc: '一手一膝撑于椅面,另一手持哑铃向腰侧拉起;没有合适支撑可换弹力带划船' },
  { name: '哑铃弯举', sets: '3组 x 12-15次', desc: '双手持哑铃,手肘固定于体侧,屈臂向上弯举;可换弹力带弯举' },
  { name: '哑铃俯身臂屈伸', sets: '3组 x 12-15次', desc: '上身前倾,手肘固定于体侧,向后伸直手臂;也可换成椅子/沙发臂屈伸(dips)' },
  { name: '侧平举(5lb)', sets: '3组 x 12-15次', desc: '双手持哑铃,手臂伸直向两侧抬至肩高;肩部疲劳或哑铃硌手时,四个平举动作都可以先减重或改徒手画圈' },
  { name: '前平举(5lb)', sets: '3组 x 12-15次', desc: '双手持哑铃,手臂伸直向前抬至肩高' },
  { name: '竖直上举(5lb)', sets: '3组 x 12-15次', desc: '双手持哑铃,手臂从体侧向上举过头顶' },
  { name: '前平举内收(5lb)', sets: '3组 x 12-15次', desc: '手臂抬至胸前高度,向内收拢再打开' },
  { name: '平板支撑', sets: '3组 x 30-45秒', desc: '手肘撑地,身体呈一条直线,收紧核心;手腕不适可换跪姿平板支撑' },
  { name: '死虫式', sets: '2组 x 12次', desc: '仰卧屈膝屈肘,对侧手脚缓慢伸展再收回;动作生疏可先只动手臂或只动腿的简化版' },
  { name: '卷腹', sets: '2组 x 15次', desc: '仰卧屈膝,肩胛骨离地卷起上身,再缓慢放下' }
];

export const CARDIO_ITEMS = [
  { name: '踏步机 90-120分钟', sets: '', desc: '保持匀速,可结合下面的哑铃动作每15-20分钟穿插一次' },
  { name: '侧平举', sets: '2-3组 x 30-45秒', desc: '双手持哑铃,手臂伸直向两侧抬至肩高' },
  { name: '前平举', sets: '2-3组 x 30-45秒', desc: '双手持哑铃,手臂伸直向前抬至肩高' },
  { name: '竖直上举', sets: '2-3组 x 30-45秒', desc: '双手持哑铃,手臂从体侧向上举过头顶' },
  { name: '前平举内收', sets: '2-3组 x 30-45秒', desc: '手臂抬至胸前高度,向内收拢再打开' }
];

// Shared across both day types: added once here rather than duplicated in
// both lists above, so cardio and strength checklists always stay in sync.
export const DAILY_ITEMS = [
  { name: '手指肌腱滑动操', sets: '3-5组', desc: '手指依次摆出"直、钩、拳、直拳、桌面"五个手型,每个停3-5秒,预防打字腱鞘炎' }
];

export function getItemsForType(type) {
  return [...(type === 'strength' ? STRENGTH_EXERCISES : CARDIO_ITEMS), ...DAILY_ITEMS];
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
