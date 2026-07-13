import { formatDate, diffDays } from './date-utils.js';

const MENSTRUAL_LEN = 5;
const LUTEAL_LEN = 14; // relatively fixed across cycle lengths

export function addPeriodStart(periodLogs, dateStr) {
  if (periodLogs.includes(dateStr)) return periodLogs;
  return [...periodLogs, dateStr].sort();
}

export function removePeriodStart(periodLogs, dateStr) {
  return periodLogs.filter((d) => d !== dateStr);
}

export function computeAvgCycle(periodLogs, lastN = 6) {
  const sorted = [...periodLogs].sort();
  if (sorted.length < 2) return null;
  const recent = sorted.slice(-(lastN + 1));
  const diffs = [];
  for (let i = 1; i < recent.length; i += 1) {
    diffs.push(diffDays(recent[i - 1], recent[i]));
  }
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
}

// Estimate only — not a medical diagnosis. Phase is derived from cycle day
// vs. the user's own historical average length.
export function getCycleInfo(periodLogs, today = formatDate(new Date())) {
  const sorted = [...periodLogs].sort();
  if (sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  const cycleDay = diffDays(last, today) + 1;
  const avgLength = computeAvgCycle(periodLogs) || 28;
  const ovulationDay = avgLength - LUTEAL_LEN;

  let phase;
  if (cycleDay <= MENSTRUAL_LEN) phase = '月经期';
  else if (cycleDay < ovulationDay - 1) phase = '卵泡期';
  else if (cycleDay <= ovulationDay + 1) phase = '排卵期';
  else phase = '黄体期';

  return { lastStart: last, cycleDay, avgLength, phase };
}
