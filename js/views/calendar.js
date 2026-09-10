/* ============================================
   月历视图 — 整月完成度一览 + 当日详情面板(补卡)
   点击格子不再跳转 tab,详情直接展示在本页
   ============================================ */

import { loadCheckins, todayStr } from '../store.js';
import { effectiveCheckItems, dayCompletion, weekdayOf } from '../day-status.js';
import { renderDayDetail } from './today.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/** 详情面板选中的日期;模块级保存,打卡触发的重渲染后不丢失 */
let selectedDate = null;

export function renderCalendar(container, ctx) {
  const { plan, monthKey } = ctx;
  container.replaceChildren();

  const checkins = loadCheckins(monthKey);
  const today = todayStr();

  // 默认选中今天(在本月计划内时);切换到其他月份后重置
  if (!selectedDate || !selectedDate.startsWith(monthKey)) {
    selectedDate = plan.days.some((d) => d.date === today) ? today : null;
  }

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

  const legend = el('div', 'calendar-legend');
  legend.append(
    el('span', null, '圆点 = 打卡进度'),
    el('span', null, '印章 = 全天完成'),
    el('span', null, '休 = 休息日'),
    el('span', null, '点击日期 = 查看 / 补卡'),
  );

  const gridCol = el('div');
  gridCol.append(grid, legend);

  const layout = el('div', 'calendar-layout');
  layout.append(gridCol, renderDayPanel(ctx));
  container.appendChild(layout);
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
      dateStr === selectedDate && 'is-selected',
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
      selectedDate = dateStr;
      ctx.refresh();
    });
  }

  return cell;
}

/** 详情面板:选中天的运动 / 三餐 / 打卡 / 体测,可直接补记 */
function renderDayPanel(ctx) {
  const { plan } = ctx;
  const panel = el('section', 'calendar-detail');
  panel.setAttribute('aria-label', '选中日期详情');

  const day = selectedDate ? plan.days.find((d) => d.date === selectedDate) : null;
  if (!day) {
    panel.appendChild(
      el('p', 'view-placeholder', '点击左侧任意一天,查看计划、打卡或补记。'),
    );
    return panel;
  }

  const head = el('div', 'section-heading calendar-detail-head');
  const [, monthNum, dayNum] = selectedDate.split('-').map(Number);
  head.appendChild(
    el('h2', null, `${monthNum}月${dayNum}日 · 星期${day.weekday || weekdayOf(selectedDate)}`),
  );
  if (selectedDate === todayStr()) {
    head.appendChild(el('span', 'heading-note', '今天'));
  }
  panel.appendChild(head);
  panel.appendChild(renderDayDetail(ctx, selectedDate));
  return panel;
}
