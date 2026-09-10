/* ============================================
   计划表视图 — 完整月度计划
   ============================================ */

import { todayStr } from '../store.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function renderPlan(container, ctx) {
  const { plan } = ctx;
  container.replaceChildren();

  const today = todayStr();
  const mealKeys = plan.days[0]?.meals.map((m) => m.key) || [];

  const wrap = el('div', 'plan-table-wrap');
  const table = el('table', 'plan-table');

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(el('th', null, '日期'));
  headRow.appendChild(el('th', null, '星期'));
  headRow.appendChild(el('th', null, '运动'));
  for (const key of mealKeys) {
    const label = plan.days[0].meals.find((m) => m.key === key)?.label || key;
    const hint = plan.days[0].meals.find((m) => m.key === key)?.hint;
    headRow.appendChild(el('th', null, hint ? `${label} ${hint}` : label));
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const day of plan.days) {
    const tr = document.createElement('tr');
    if (day.date === today) tr.className = 'is-today';
    else if (day.exercise.isRest) tr.className = 'is-rest-day';

    const [, , dayNum] = day.date.split('-').map(Number);
    tr.appendChild(el('td', 'tnum', `${dayNum}日`));
    tr.appendChild(el('td', null, day.weekday));

    const exerciseText = day.exercise.time
      ? `${day.exercise.raw || `${day.exercise.name}(${day.exercise.time})`}`
      : day.exercise.raw || day.exercise.name;
    tr.appendChild(el('td', null, exerciseText));

    for (const key of mealKeys) {
      const meal = day.meals.find((m) => m.key === key);
      tr.appendChild(el('td', null, meal?.text || '—'));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
  container.appendChild(wrap);
}
