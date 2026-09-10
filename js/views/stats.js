/* ============================================
   数据视图 — 连续天数 / 完成率 / 体测曲线
   ============================================ */

import { loadCheckins, todayStr } from '../store.js';
import { dayCompletion, streakDays } from '../day-status.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderStats(container, ctx) {
  const { plan, monthKey } = ctx;
  container.replaceChildren();

  const checkins = loadCheckins(monthKey);
  const today = todayStr();
  const dates = plan.days.map((d) => d.date).sort();
  const anchor = dates.filter((d) => d <= today).at(-1) || dates[0];

  container.appendChild(renderHero(plan, checkins, dates, today, anchor));

  for (const metric of plan.metrics) {
    const points = dates
      .map((date) => ({ date, value: checkins[date]?.[metric.key] }))
      .filter((p) => typeof p.value === 'number' && p.value > 0);
    container.appendChild(renderChartCard(metric, points));
  }
}

/* ---------- 顶部大数字 ---------- */

function renderHero(plan, checkins, dates, today, anchor) {
  const hero = el('div', 'stats-hero');

  const streak = streakDays(plan, checkins, anchor);
  hero.appendChild(statBlock('连续全勤', String(streak), '天'));

  // 完成率:截至今天(或计划范围内最后一天)的所有已过日期
  let doneSum = 0;
  let totalSum = 0;
  for (const date of dates) {
    if (date > today) break;
    const { done, total } = dayCompletion(plan, checkins[date], date);
    doneSum += done;
    totalSum += total;
  }
  const rate = totalSum ? Math.round((doneSum / totalSum) * 100) : 0;
  hero.appendChild(statBlock('本月完成率', String(rate), '%'));

  // 体重变化:最新一条 - 第一条
  const weightMetric = plan.metrics.find((m) => m.key === 'weight');
  const weights = dates
    .map((date) => checkins[date]?.weight)
    .filter((v) => typeof v === 'number' && v > 0);
  if (weightMetric && weights.length) {
    const latest = weights.at(-1);
    const delta = weights.length > 1 ? latest - weights[0] : null;
    const deltaText =
      delta === null
        ? weightMetric.unit
        : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${weightMetric.unit}`;
    hero.appendChild(statBlock('最新体重', latest.toFixed(1), deltaText));
  } else {
    hero.appendChild(statBlock('已记录天数', String(Object.keys(checkins).length), '天'));
  }

  return hero;
}

function statBlock(label, value, unit) {
  const block = el('div', 'stat-block');
  block.appendChild(el('p', 'stat-block-label', label));
  const valueEl = el('p', 'stat-block-value tnum', value);
  if (unit) valueEl.appendChild(el('small', null, unit));
  block.appendChild(valueEl);
  return block;
}

/* ---------- SVG 折线图 ---------- */

function renderChartCard(metric, points) {
  const card = el('article', 'chart-card');
  card.appendChild(el('h3', null, `${metric.label}曲线(${metric.unit})`));

  if (points.length < 2) {
    card.appendChild(
      el('p', 'chart-empty', '记录至少两天数据后,这里会出现曲线。'),
    );
    return card;
  }
  card.appendChild(buildLineChart(points));
  return card;
}

function buildLineChart(points) {
  const W = 640;
  const H = 220;
  const PAD = { left: 44, right: 56, top: 20, bottom: 30 };

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.15;
  max += span * 0.15;

  const x = (i) =>
    PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '体测数据折线图');

  const style = getComputedStyle(document.documentElement);

  // 网格线(min/max)与轴标签
  for (const v of [min, max]) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', PAD.left);
    line.setAttribute('x2', W - PAD.right);
    line.setAttribute('y1', y(v));
    line.setAttribute('y2', y(v));
    line.setAttribute('stroke', style.getPropertyValue('--color-line'));
    line.setAttribute('stroke-dasharray', '3 4');
    svg.appendChild(line);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'chart-axis-label');
    label.setAttribute('x', PAD.left - 6);
    label.setAttribute('y', y(v) + 3);
    label.setAttribute('text-anchor', 'end');
    label.textContent = v.toFixed(1);
    svg.appendChild(label);
  }

  // 折线
  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute(
    'points',
    points.map((p, i) => `${x(i)},${y(p.value)}`).join(' '),
  );
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', style.getPropertyValue('--color-ink'));
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline);

  // 数据点 + 日期/数值标签
  const sealColor = style.getPropertyValue('--color-seal');
  points.forEach((p, i) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', x(i));
    circle.setAttribute('cy', y(p.value));
    circle.setAttribute('r', i === points.length - 1 ? 5 : 3.5);
    circle.setAttribute('fill', sealColor);
    svg.appendChild(circle);

    const dayLabel = document.createElementNS(SVG_NS, 'text');
    dayLabel.setAttribute('class', 'chart-axis-label');
    dayLabel.setAttribute('x', x(i));
    dayLabel.setAttribute('y', H - 8);
    dayLabel.setAttribute('text-anchor', 'middle');
    dayLabel.textContent = `${Number(p.date.slice(8))}日`;
    svg.appendChild(dayLabel);
  });

  // 末点数值
  const last = points.at(-1);
  const lastLabel = document.createElementNS(SVG_NS, 'text');
  lastLabel.setAttribute('class', 'chart-axis-label');
  lastLabel.setAttribute('x', x(points.length - 1) + 8);
  lastLabel.setAttribute('y', y(last.value) + 4);
  lastLabel.textContent = last.value.toFixed(1);
  svg.appendChild(lastLabel);

  return svg;
}
