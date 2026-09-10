/* ============================================
   今日视图 — 打卡主界面
   ============================================ */

import { getCheckin, updateCheckin, todayStr } from '../store.js';
import { effectiveCheckItems, dayCompletion, weekdayOf } from '../day-status.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/** 渲染今日(或指定日期)视图 */
export function renderToday(container, ctx) {
  const { plan, monthKey, activeDate } = ctx;
  container.replaceChildren();

  const dayIdx = plan.days.findIndex((d) => d.date === activeDate);
  const day = dayIdx >= 0 ? plan.days[dayIdx] : null;
  const checkin = getCheckin(monthKey, activeDate);
  const isToday = activeDate === todayStr();
  const isFuture = activeDate > todayStr();

  container.appendChild(renderTopRow(ctx, day, dayIdx, isToday));

  if (!day) {
    container.appendChild(renderOutOfRange(ctx, activeDate));
    return;
  }

  container.appendChild(renderExerciseCard(day, isToday));
  container.appendChild(renderMealGrid(day));
  container.appendChild(
    renderCheckSection(ctx, day, checkin, isToday, isFuture),
  );
}

/* ---------- 今天不在计划范围内 ---------- */

const MS_PER_DAY = 86400000;

function fmtMonthDay(dateStr) {
  const [, monthNum, dayNum] = dateStr.split('-').map(Number);
  return `${monthNum}月${dayNum}日`;
}

function diffDays(fromStr, toStr) {
  return Math.round((new Date(toStr) - new Date(fromStr)) / MS_PER_DAY);
}

function renderOutOfRange(ctx, activeDate) {
  const { plan } = ctx;
  const first = plan.days[0].date;
  const last = plan.days[plan.days.length - 1].date;

  const placeholder = el('div', 'view-placeholder');

  if (activeDate < first) {
    placeholder.appendChild(
      el('p', null, `计划还没开始,从 ${fmtMonthDay(first)} 起,还有 ${diffDays(activeDate, first)} 天。`),
    );
    placeholder.appendChild(renderJumpBtn(ctx, first, '预览第一天'));
  } else if (activeDate > last) {
    placeholder.appendChild(
      el('p', null, `本月计划已于 ${fmtMonthDay(last)} 结束。`),
    );
    placeholder.appendChild(renderJumpBtn(ctx, last, '查看最后一天'));
  } else {
    placeholder.appendChild(el('p', null, '这一天不在本计划的日期范围内。'));
  }
  return placeholder;
}

function renderJumpBtn(ctx, dateStr, label) {
  const btn = el('button', 'btn btn-primary', label);
  btn.type = 'button';
  btn.addEventListener('click', () => ctx.setActiveDate(dateStr));
  return btn;
}

/* ---------- 顶部:日期 + 导航 ---------- */

function renderTopRow(ctx, day, dayIdx, isToday) {
  const { plan, activeDate } = ctx;
  const top = el('div', 'today-top');
  const row = el('div', 'today-date-row');

  const dateBlock = el('div', 'today-date');
  const [, monthNum, dayNum] = activeDate.split('-').map(Number);
  dateBlock.appendChild(el('span', 'today-date-day tnum', String(dayNum)));
  const meta = el('div', 'today-date-meta');
  meta.appendChild(
    el('span', 'today-date-weekday', `星期${day?.weekday || weekdayOf(activeDate)}`),
  );
  meta.appendChild(
    el('span', 'today-date-full tnum', `${monthNum}月${dayNum}日 · ${plan.monthKey}`),
  );
  dateBlock.appendChild(meta);
  row.appendChild(dateBlock);

  const nav = el('div', 'today-nav');
  const prevBtn = el('button', null, '←');
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', '前一天');
  prevBtn.disabled = dayIdx <= 0;
  prevBtn.addEventListener('click', () => ctx.setActiveDate(plan.days[dayIdx - 1].date));

  const nextBtn = el('button', null, '→');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', '后一天');
  nextBtn.disabled = dayIdx === -1 || dayIdx >= plan.days.length - 1;
  nextBtn.addEventListener('click', () => ctx.setActiveDate(plan.days[dayIdx + 1].date));

  nav.append(prevBtn, nextBtn);

  if (!isToday) {
    const backBtn = el('button', 'back-to-today', '回到今天');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => ctx.setActiveDate(todayStr()));
    nav.appendChild(backBtn);
  }

  row.appendChild(nav);
  top.appendChild(row);
  return top;
}

/* ---------- 运动卡 ---------- */

function renderExerciseCard(day, isToday) {
  const card = el('article', `exercise-card${day.exercise.isRest ? ' is-rest' : ''}`);
  const tag = day.exercise.isRest ? 'REST DAY' : isToday ? "TODAY'S TRAINING" : 'TRAINING';
  card.appendChild(el('p', 'exercise-card-tag', tag));
  card.appendChild(el('h2', 'exercise-card-name', day.exercise.name || '休息'));
  if (day.exercise.time) {
    card.appendChild(el('p', 'exercise-card-time tnum', day.exercise.time));
  }
  return card;
}

/* ---------- 餐食卡 ---------- */

function renderMealGrid(day) {
  const grid = el('div', 'meal-grid');
  for (const meal of day.meals) {
    const card = el('article', 'meal-card');
    const head = el('div', 'meal-card-head');
    head.appendChild(el('h3', 'meal-card-title', meal.label));
    if (meal.hint) head.appendChild(el('span', 'meal-card-time', meal.hint));
    card.appendChild(head);
    card.appendChild(el('p', 'meal-card-body', meal.text || '—'));
    grid.appendChild(card);
  }
  return grid;
}

/* ---------- 打卡清单 ---------- */

function renderCheckSection(ctx, day, checkin, isToday, isFuture) {
  const { plan, monthKey } = ctx;
  const section = el('section', 'check-section');
  section.setAttribute('aria-label', '每日打卡');

  const items = plan.checkItems;
  const effective = effectiveCheckItems(plan, day.date);
  const checks = checkin?.checks || {};
  const { done, total } = dayCompletion(plan, checkin, day.date);

  const heading = el('div', 'section-heading');
  heading.appendChild(el('h2', null, isToday ? '今日打卡' : '当日打卡'));
  heading.appendChild(
    el('span', 'heading-note tnum', isFuture ? '还没到这一天' : `${done} / ${total} 项`),
  );
  section.appendChild(heading);

  const list = el('div', 'check-list');
  for (const item of items) {
    list.appendChild(renderCheckItem(ctx, day, item, checks, effective, isFuture));
  }
  section.appendChild(list);

  section.appendChild(renderMetricRow(ctx, day, checkin));
  return section;
}

function renderCheckItem(ctx, day, item, checks, effective, isFuture) {
  const { monthKey } = ctx;
  const exempted = item.linkedExercise && day.exercise.isRest;
  const done = Boolean(checks[item.key]);
  const disabled = isFuture || exempted;

  const btn = el('button', `check-item${done ? ' is-done' : ''}`);
  btn.type = 'button';
  btn.setAttribute('role', 'checkbox');
  btn.setAttribute('aria-checked', String(done));
  btn.disabled = disabled;

  btn.appendChild(el('span', 'check-item-ring'));
  btn.appendChild(el('span', 'check-item-label', item.label));

  if (exempted) {
    btn.appendChild(el('span', 'check-item-hint', '休息日,自动豁免'));
  } else if (item.key === 'exercise' && day.exercise.name) {
    btn.appendChild(el('span', 'check-item-hint', day.exercise.name));
  } else if (isFuture) {
    btn.appendChild(el('span', 'check-item-hint', '还未到'));
  }

  if (done) {
    const seal = el('span', 'seal is-stamping', '完');
    btn.appendChild(seal);
  }

  if (!disabled) {
    btn.addEventListener('click', () => {
      updateCheckin(monthKey, day.date, { checks: { [item.key]: !done } });
      ctx.refresh();
    });
  }
  return btn;
}

/* ---------- 体测与备注 ---------- */

function renderMetricRow(ctx, day, checkin) {
  const { plan, monthKey } = ctx;
  const row = el('div', 'metric-row');
  const isWeighDay = plan.weighDays.includes(day.date);

  for (const metric of plan.metrics) {
    const field = el('div', `metric-field${isWeighDay ? ' is-weigh-day' : ''}`);
    const label = el('label');
    label.appendChild(document.createTextNode(metric.label));
    if (isWeighDay) {
      label.appendChild(el('span', 'weigh-day-badge', '今日测量'));
    }
    label.appendChild(el('span', 'metric-unit', metric.unit));

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', `${metric.label}(${metric.unit})`);
    input.value = checkin?.[metric.key] ?? '';

    input.addEventListener('change', () => {
      const num = input.value === '' ? null : Number(input.value);
      if (num !== null && (!Number.isFinite(num) || num <= 0 || num > 500)) {
        ctx.toast('数值看起来不对,请检查', true);
        input.value = checkin?.[metric.key] ?? '';
        return;
      }
      updateCheckin(monthKey, day.date, { [metric.key]: num });
      ctx.toast(`${metric.label}已记录`);
    });

    field.append(label, input);
    row.appendChild(field);
  }

  if (plan.noteEnabled) {
    const field = el('div', 'metric-field metric-field-note');
    const label = el('label', null, '备注');
    const textarea = document.createElement('textarea');
    textarea.rows = 2;
    textarea.placeholder = '特殊情况 / 感受…';
    textarea.setAttribute('aria-label', '备注');
    textarea.value = checkin?.note || '';
    textarea.addEventListener('change', () => {
      updateCheckin(monthKey, day.date, { note: textarea.value.trim() });
      ctx.toast('备注已保存');
    });
    field.append(label, textarea);
    row.appendChild(field);
  }

  return row;
}
