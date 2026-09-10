/* ============================================
   应用入口 — tab 路由 / 导入 / 备份 / 状态协调
   ============================================ */

import {
  getPlan,
  getActiveMonth,
  setActiveMonth,
  listMonthKeys,
  savePlan,
  exportAll,
  importAll,
  todayStr,
} from './store.js';
import { importXlsxFile } from './xlsx-import.js';
import { downloadTemplateXlsx } from './xlsx-template.js';
import { renderToday } from './views/today.js';
import { renderCalendar } from './views/calendar.js';
import { renderPlan } from './views/plan.js';
import { renderReference } from './views/reference.js';
import { renderStats } from './views/stats.js';

const VIEWS = {
  today: renderToday,
  calendar: renderCalendar,
  plan: renderPlan,
  reference: renderReference,
  stats: renderStats,
};

const state = {
  tab: 'today',
  monthKey: null,
  activeDate: null,
};

const dom = {
  monthPicker: document.querySelector('.month-picker'),
  monthSelect: document.getElementById('month-select'),
  subtitle: document.getElementById('plan-subtitle'),
  tabNav: document.querySelector('.tab-nav'),
  emptyState: document.getElementById('empty-state'),
  fileInput: document.getElementById('file-input'),
  jsonInput: document.getElementById('json-input'),
  toast: document.getElementById('toast'),
  backupDropdown: document.getElementById('backup-dropdown'),
  btnBackup: document.getElementById('btn-backup'),
};

/* ---------- Toast ---------- */

let toastTimer = null;

function toast(message, isError = false) {
  dom.toast.textContent = message;
  dom.toast.classList.toggle('is-error', isError);
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.hidden = true;
  }, 2600);
}

/* ---------- 渲染协调 ---------- */

function ctx() {
  return {
    plan: getPlan(state.monthKey),
    monthKey: state.monthKey,
    activeDate: state.activeDate,
    setActiveDate(dateStr) {
      state.activeDate = dateStr;
      refresh();
    },
    refresh,
    toast,
  };
}

function refresh() {
  const view = VIEWS[state.tab];
  const section = document.getElementById(`view-${state.tab}`);
  view(section, ctx());
}

function switchTab(name) {
  if (!VIEWS[name]) return;
  state.tab = name;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach((sectionEl) => {
    sectionEl.hidden = sectionEl.id !== `view-${name}`;
  });
  history.replaceState(null, '', `#${name}`);
  refresh();
}

function renderShell() {
  const monthKeys = listMonthKeys();
  const hasPlan = monthKeys.length > 0;

  dom.emptyState.hidden = hasPlan;
  dom.tabNav.hidden = !hasPlan;
  document.querySelector('.site-main').hidden = !hasPlan;
  dom.monthPicker.hidden = !hasPlan;

  if (!hasPlan) {
    dom.subtitle.hidden = true;
    return;
  }

  state.monthKey = getActiveMonth();
  const plan = getPlan(state.monthKey);
  // 今日视图始终落在真实今天;今天不在计划内时由视图层提示
  state.activeDate = todayStr();

  dom.monthSelect.replaceChildren();
  for (const key of monthKeys) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    option.selected = key === state.monthKey;
    dom.monthSelect.appendChild(option);
  }

  const subtitleParts = [plan.title];
  if (plan.person && !plan.title.includes(plan.person)) {
    subtitleParts.push(plan.person);
  }
  dom.subtitle.textContent = subtitleParts.filter(Boolean).join(' · ');
  dom.subtitle.hidden = false;

  const hash = location.hash.slice(1);
  switchTab(VIEWS[hash] ? hash : state.tab);
}

/* ---------- 导入 xlsx ---------- */

async function handleXlsxFile(file) {
  if (!file) return;
  toast('正在解析计划表…');
  try {
    const plan = await importXlsxFile(file);
    savePlan(plan);
    renderShell();
    toast(`已导入 ${plan.monthKey} 计划,共 ${plan.days.length} 天`);
  } catch (error) {
    console.error(error);
    toast(error.message || '解析失败,请检查文件格式', true);
  }
}

/* ---------- 模版下载 ---------- */

async function handleTemplateDownload() {
  toast('正在生成模版表格…');
  try {
    await downloadTemplateXlsx();
    toast('模版已下载,填写后点「导入计划表」即可');
  } catch (error) {
    console.error(error);
    toast(error.message || '模版生成失败,请检查网络后重试', true);
  }
}

/* ---------- 备份 ---------- */

function handleExport() {
  const data = exportAll();
  if (!Object.keys(data.plans).length) {
    toast('还没有数据可以导出', true);
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `训练打卡备份-${todayStr()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast('备份文件已下载');
}

async function handleJsonFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const count = importAll(JSON.parse(text));
    renderShell();
    toast(`已恢复 ${count} 个月的计划与打卡记录`);
  } catch (error) {
    console.error(error);
    toast(error.message || '备份文件无法读取', true);
  }
}

/* ---------- 事件绑定 ---------- */

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  dom.monthSelect.addEventListener('change', () => {
    setActiveMonth(dom.monthSelect.value);
    renderShell();
  });

  for (const id of ['btn-import', 'btn-import-empty']) {
    document.getElementById(id).addEventListener('click', () => dom.fileInput.click());
  }
  dom.fileInput.addEventListener('change', () => {
    handleXlsxFile(dom.fileInput.files[0]);
    dom.fileInput.value = '';
  });

  for (const id of ['btn-template', 'btn-template-empty']) {
    document.getElementById(id).addEventListener('click', handleTemplateDownload);
  }

  dom.btnBackup.addEventListener('click', () => {
    const open = dom.backupDropdown.hidden;
    dom.backupDropdown.hidden = !open;
    dom.btnBackup.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.backup-menu')) {
      dom.backupDropdown.hidden = true;
      dom.btnBackup.setAttribute('aria-expanded', 'false');
    }
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    dom.backupDropdown.hidden = true;
    handleExport();
  });
  document.getElementById('btn-import-json').addEventListener('click', () => {
    dom.backupDropdown.hidden = true;
    dom.jsonInput.click();
  });
  dom.jsonInput.addEventListener('change', () => {
    handleJsonFile(dom.jsonInput.files[0]);
    dom.jsonInput.value = '';
  });
}

/* ---------- 启动 ---------- */

bindEvents();
renderShell();
