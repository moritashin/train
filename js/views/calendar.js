/* ============================================
   月历视图 — 整月打卡完成度一览
   ============================================ */

import { loadCheckins, todayStr } from '../store.js';
import { effectiveCheckItems, dayCompletion } from '../day-status.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function renderCalendar(container, ctx) {
  const { plan, monthKey } = ctx;
  container.replaceChildren();

  const checkins = loadCheckins(monthKey);
  const today = todayStr();

  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  // 周一开头:JS getDay() 周日=0 → 转成 6
  const firstOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const grid = el('div', 'calendar-grid');
  for (const name of WEEKDAYS) {
    grid.appendChild(el('div', 'calendar-weekday', name));
  }

  const planDates = new Map(plan.days.map((d) => [d.date, d]));

  // 月初空白
  for (let i = 0; i < firstOffset; i += 1) {
    const blank = el('div', 'calendar-cell is-outside');
    blank.setAttribute('aria-hidden', 'true');
    grid.appendChild(blank);
  }

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum += 1) {
    const dateStr = `${monthKey}-${String(dayNum).padStart(2, '0')}`;
    grid.appendChild(
      renderCell(ctx, dateStr, dayNum, planDates.get(dateStr), checkins[dateStr], today),
    );
  }

  container.appendChild(grid);

  const legend = el('div', 'calendar-legend');
  legend.append(
    el('span', null, '圆点 = 打卡项完成进度'),
    el('span', null, '印章 = 全天完成'),
    el('span', null, '休 = 休息日'),
  );
  container.appendChild(legend);
}

function renderCell(ctx, dateStr, dayNum, day, checkin, today) {
  const { plan } = ctx;
  const inPlan = Boolean(day);
  const isFuture = dateStr > today;

  const cell = el(
    'button',
    [
      'calendar-cell',
      !inPlan && 'is-outside',
      inPlan && isFuture && 'is-future',
      dateStr === today && 'is-today',
    ]
      .filter(Boolean)
      .join(' '),
  );
  cell.type = 'button';
  cell.disabled = !inPlan;
  cell.setAttribute('aria-label', `${dateStr}${inPlan ? '' : '(无计划)'}`);

  cell.appendChild(el('span', 'calendar-date tnum', String(dayNum)));

  if (inPlan) {
    if (day.exercise.isRest) {
      cell.appendChild(el('span', 'calendar-rest-tag', '休'));
    }

    if (!isFuture) {
      const items = effectiveCheckItems(plan, dateStr);
      const checks = checkin?.checks || {};
      const { isFull } = dayCompletion(plan, checkin, dateStr);

      const dots = el('span', 'check-dots');
      for (const item of items) {
        dots.appendChild(
          el('span', `check-dot${checks[item.key] ? ' is-done' : ''}`),
        );
      }
      cell.appendChild(dots);

      if (isFull) {
        cell.appendChild(el('span', 'seal', '完'));
      }
    }

    cell.addEventListener('click', () => {
      ctx.setActiveDate(dateStr);
      ctx.switchTab('today');
    });
  }

  return cell;
}
