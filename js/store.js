/* ============================================
   数据层 — localStorage
   计划字典按月存储;打卡记录按月分 key 存储。
   所有更新返回新对象(不可变模式)。
   ============================================ */

const KEY_PLANS = 'train.plans';
const KEY_CHECKINS_PREFIX = 'train.checkins.';
const KEY_ACTIVE_MONTH = 'train.activeMonth';
const BACKUP_VERSION = 1;

/* ---------- 基础读写 ---------- */

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- 计划 ---------- */

/** @returns {Record<string, object>} monthKey → 计划 */
export function loadPlans() {
  return readJSON(KEY_PLANS, {});
}

export function listMonthKeys() {
  return Object.keys(loadPlans()).sort();
}

export function getPlan(monthKey) {
  return loadPlans()[monthKey] || null;
}

/** 保存计划(同月份覆盖),并把它设为当前月 */
export function savePlan(plan) {
  const plans = loadPlans();
  writeJSON(KEY_PLANS, { ...plans, [plan.monthKey]: plan });
  setActiveMonth(plan.monthKey);
}

export function deletePlan(monthKey) {
  const plans = loadPlans();
  const next = { ...plans };
  delete next[monthKey];
  writeJSON(KEY_PLANS, next);
  localStorage.removeItem(KEY_CHECKINS_PREFIX + monthKey);
}

/* ---------- 当前月份 ---------- */

export function getActiveMonth() {
  const stored = localStorage.getItem(KEY_ACTIVE_MONTH);
  const keys = listMonthKeys();
  if (stored && keys.includes(stored)) return stored;
  // 默认选包含今天的月份,否则最近的一个月
  const todayKey = todayStr().slice(0, 7);
  if (keys.includes(todayKey)) return todayKey;
  return keys.at(-1) || null;
}

export function setActiveMonth(monthKey) {
  localStorage.setItem(KEY_ACTIVE_MONTH, monthKey);
}

/* ---------- 打卡 ---------- */

/** @returns {Record<string, object>} dateStr → 打卡记录 */
export function loadCheckins(monthKey) {
  return readJSON(KEY_CHECKINS_PREFIX + monthKey, {});
}

export function getCheckin(monthKey, dateStr) {
  return loadCheckins(monthKey)[dateStr] || null;
}

/** 合并式更新某一天的打卡记录 */
export function updateCheckin(monthKey, dateStr, patch) {
  const all = loadCheckins(monthKey);
  const prev = all[dateStr] || {};
  const next = {
    ...all,
    [dateStr]: {
      ...prev,
      ...patch,
      checks: { ...(prev.checks || {}), ...(patch.checks || {}) },
      updatedAt: new Date().toISOString(),
    },
  };
  writeJSON(KEY_CHECKINS_PREFIX + monthKey, next);
  return next[dateStr];
}

/* ---------- 备份 ---------- */

export function exportAll() {
  const plans = loadPlans();
  const checkins = {};
  for (const key of Object.keys(plans)) {
    checkins[key] = loadCheckins(key);
  }
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), plans, checkins };
}

/** 导入备份,返回恢复的月份数;格式非法时抛错 */
export function importAll(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.plans !== 'object') {
    throw new Error('备份文件格式不正确(缺少 plans 字段)');
  }
  const { plans, checkins = {} } = payload;
  const monthKeys = Object.keys(plans);
  if (monthKeys.length === 0) throw new Error('备份文件里没有计划数据');

  for (const key of monthKeys) {
    const plan = plans[key];
    if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
      throw new Error(`备份中 ${key} 的计划数据不完整`);
    }
  }

  const existing = loadPlans();
  writeJSON(KEY_PLANS, { ...existing, ...plans });
  for (const key of monthKeys) {
    if (checkins[key] && typeof checkins[key] === 'object') {
      const merged = { ...loadCheckins(key), ...checkins[key] };
      writeJSON(KEY_CHECKINS_PREFIX + key, merged);
    }
  }
  setActiveMonth(monthKeys.sort().at(-1));
  return monthKeys.length;
}

/* ---------- 日期工具 ---------- */

export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
