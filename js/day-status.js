/* ============================================
   单日状态计算 — 今日/月历/统计共用
   ============================================ */

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayOf(dateStr) {
  return WEEKDAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()];
}

/**
 * 计算某一天的有效打卡项(休息日豁免运动项)
 * @returns 有效打卡项数组
 */
export function effectiveCheckItems(plan, dateStr) {
  const day = plan.days.find((d) => d.date === dateStr);
  const restDay = !day || day.exercise.isRest;
  return plan.checkItems.filter(
    (item) => !(restDay && item.linkedExercise)
  );
}

/**
 * 某一天打卡完成度
 * @returns {{ done: number, total: number, isFull: boolean }}
 */
export function dayCompletion(plan, checkin, dateStr) {
  const items = effectiveCheckItems(plan, dateStr);
  const checks = checkin?.checks || {};
  const done = items.filter((item) => checks[item.key]).length;
  return { done, total: items.length, isFull: items.length > 0 && done === items.length };
}

/** 连续完成天数:从 anchorDate 往前数,全天完成则连续(未来日跳过) */
export function streakDays(plan, checkins, anchorDate) {
  let streak = 0;
  const sorted = plan.days.map((d) => d.date).sort();
  const anchorIdx = sorted.indexOf(anchorDate);
  if (anchorIdx === -1) return 0;
  for (let i = anchorIdx; i >= 0; i -= 1) {
    const date = sorted[i];
    if (date > anchorDate) continue;
    const { isFull } = dayCompletion(plan, checkins[date], date);
    if (isFull) streak += 1;
    else break;
  }
  return streak;
}
