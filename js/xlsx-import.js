/* ============================================
   xlsx 导入解析
   - parseWorkbook 为纯函数(XLSX 由调用方注入),可在 node 中测试
   - 浏览器入口 importXlsxFile 负责动态加载 SheetJS
   ============================================ */

const SHEETJS_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

const DEFAULT_CHECK_ITEMS = [
  { key: 'exercise', label: '运动完成', linkedExercise: true },
  { key: 'meals', label: '三餐按计划', linkedExercise: false },
  { key: 'noSnack', label: '无零食甜饮', linkedExercise: false },
  { key: 'water', label: '饮水≥2L', linkedExercise: false },
  { key: 'sleep', label: '23:00前睡', linkedExercise: false },
];

const DEFAULT_METRICS = [
  { key: 'weight', label: '体重', unit: 'kg' },
  { key: 'waist', label: '腰围', unit: 'cm' },
];

const CHECK_KEY_MAP = [
  [/运动/, 'exercise'],
  [/三餐|饮食|按.*计划/, 'meals'],
  [/零食|甜饮/, 'noSnack'],
  [/饮水|喝水|≥2L/, 'water'],
  [/睡/, 'sleep'],
];

/* ---------- 通用工具 ---------- */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** sheet → 字符串二维数组(显示值,空格归一) */
function sheetRows(XLSX, ws) {
  return XLSX.utils
    .sheet_to_json(ws, { header: 1, raw: false, defval: '' })
    .map((row) => row.map((cell) => String(cell ?? '').trim()));
}

function findSheetName(wb, patterns) {
  return (
    wb.SheetNames.find((name) => patterns.some((p) => name.includes(p))) || null
  );
}

/* ---------- 日期解析 ---------- */

/**
 * 解析日期单元格:支持 9/14、9-14、9月14日、2026/9/14、Excel 序列号
 * 返回 { dateStr, month, day } 或 null
 */
function parseDateCell(value, fallbackYear) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  let m = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m.map(Number);
    return { dateStr: toDateStr(y, mo, d), month: mo, day: d };
  }

  m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.]\d{2,4})?$/);
  if (!m) m = text.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (m) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return { dateStr: toDateStr(fallbackYear, mo, d), month: mo, day: d };
    }
    return null;
  }

  // Excel 日期序列号(1900 系统)
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 30000 && serial < 60000) {
    const utc = Math.round((serial - 25569) * 86400 * 1000);
    const dt = new Date(utc);
    return {
      dateStr: toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()),
      month: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
    };
  }
  return null;
}

/** 从标题文本推断年份:"2026年9月…" → 2026 */
function inferYear(titleText) {
  const m = String(titleText).match(/(20\d{2})\s*年/);
  return m ? Number(m[1]) : new Date().getFullYear();
}

/* ---------- 计划表 ---------- */

const PLAN_COL_KEYWORDS = [
  { slot: 'date', patterns: ['日期'] },
  { slot: 'weekday', patterns: ['星期', '周'] },
  { slot: 'exercise', patterns: ['运动'] },
  { slot: 'breakfast', patterns: ['早餐', '早饭'] },
  { slot: 'lunch', patterns: ['午餐', '午饭'] },
  { slot: 'dinner', patterns: ['晚餐', '晚饭'] },
  { slot: 'postWorkout', patterns: ['练后', '加餐', '补给'] },
];

function matchPlanColumn(headerCell) {
  for (const { slot, patterns } of PLAN_COL_KEYWORDS) {
    if (patterns.some((p) => headerCell.includes(p))) return slot;
  }
  return null;
}

/** 表头 "晚餐 18:00" → { label: '晚餐', hint: '18:00' } */
function splitHeaderHint(headerCell) {
  const m = headerCell.match(/^(.*?)[\s(（]*(\d{1,2}[:：]\d{2}(?:\s*[~～-].*)?)[)）]?\s*$/);
  if (m) return { label: m[1].trim(), hint: m[2].trim() };
  return { label: headerCell.trim(), hint: '' };
}

const MEAL_SLOTS = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'postWorkout', label: '练后补给' },
];

function parseExercise(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { name: '', time: '', raw: '', isRest: true };
  const isRest = /休息/.test(text);
  const m = text.match(/[(\(（](\d{1,2}[:：]\d{2}\s*[~～-]\s*\d{1,2}[:：]\d{2})[)）]?/);
  const time = m ? m[1].replace(/\s+/g, '') : '';
  const name = text
    .replace(/[(\(（][^)）]*[)）]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { name, time, raw: text, isRest };
}

function parsePlanSheet(rows) {
  // 标题行 = 第一行非空行
  const titleRow = rows.find((r) => r.some(Boolean)) || [];
  const title = titleRow.join(' ').replace(/\s+/g, ' ').trim();
  // 个人信息:去掉开头的「xxxx年x月…计划表(范围)」部分
  const person = title
    .replace(/^\d{4}\s*年.*?计划表[（(][^)）]*[)）]\s*/, '')
    .trim();
  const year = inferYear(title);

  // 表头行:含「日期」且能映射出 ≥2 个已知列
  let headerIdx = -1;
  let colMap = {};
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const map = {};
    rows[i].forEach((cell, c) => {
      const slot = cell ? matchPlanColumn(cell) : null;
      if (slot && !(slot in map)) map[slot] = c;
    });
    if ('date' in map && Object.keys(map).length >= 2) {
      headerIdx = i;
      colMap = map;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('未能在计划表 sheet 中找到表头行(需要包含「日期」列)');
  }

  const header = rows[headerIdx];
  const mealHints = {};
  for (const { key } of MEAL_SLOTS) {
    if (colMap[key] !== undefined) {
      mealHints[key] = splitHeaderHint(header[colMap[key]] || '');
    }
  }

  const days = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const parsed = parseDateCell(row[colMap.date], year);
    if (!parsed) continue;
    const exercise = parseExercise(row[colMap.exercise] ?? '');
    const meals = MEAL_SLOTS
      .filter(({ key }) => colMap[key] !== undefined)
      .map(({ key, label }) => {
        const headerLabel = mealHints[key]?.label || '';
        // 表头 label 是默认 label 的截短前缀时(如「练后」),用完整默认名
        const resolved =
          headerLabel && !label.startsWith(headerLabel) ? headerLabel : label;
        return {
          key,
          label: resolved,
          hint: mealHints[key]?.hint || '',
          text: String(row[colMap[key]] ?? '').trim(),
        };
      });
    days.push({
      date: parsed.dateStr,
      day: parsed.day,
      weekday: String(row[colMap.weekday] ?? '').trim(),
      exercise,
      meals,
    });
  }

  if (days.length === 0) {
    throw new Error('计划表中没有解析到任何一天的日期行,请检查「日期」列格式(如 9/14)');
  }
  return { title, person, days };
}

/* ---------- 执行规则 ---------- */

function parseRulesSheet(rows) {
  const lines = [];
  for (const row of rows) {
    const text = row.filter(Boolean).join(' ').trim();
    if (text) lines.push(text);
  }
  const title = lines[0] || '执行规则';
  const items = lines.slice(1).map((line) => line.replace(/^\d+\s*[.、．]\s*/, ''));
  return { title, items };
}

/* ---------- 食材替换 / 采购表(同构分组结构) ---------- */

function parseGroupsSheet(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    const cells = row.map((c) => c.trim());
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length === 0) continue;
    if (nonEmpty.length === 1) {
      current = { title: nonEmpty[0], rows: [] };
      groups.push(current);
      continue;
    }
    // 表头行(「类别 | 清单」等)跳过:两列且第一列是泛化名词
    if (current && /^(类别|项目)$/.test(cells[0])) continue;
    if (!current) {
      current = { title: '', rows: [] };
      groups.push(current);
    }
    current.rows.push({ label: cells[0], value: cells.slice(1).filter(Boolean).join(' ') });
  }
  return groups.filter((g) => g.title || g.rows.length);
}

/* ---------- 每日执行记录(打卡项定义) ---------- */

function cleanCheckLabel(raw) {
  return raw
    .replace(/[✓√\s]/g, '')
    .replace(/[/／]/g, '')
    .trim();
}

function parseRecordSheet(rows) {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    if (rows[i].some((c) => c.includes('日期'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const checkItems = [];
  const metrics = [];
  let noteEnabled = false;
  const customLabels = new Set();

  rows[headerIdx].forEach((cell, c) => {
    const text = String(cell).trim();
    if (!text || c <= 1) return; // 跳过 日期/星期 列
    if (/[✓√]/.test(text)) {
      const label = cleanCheckLabel(text);
      if (!label || customLabels.has(label)) return;
      customLabels.add(label);
      const mapped = CHECK_KEY_MAP.find(([re]) => re.test(label));
      checkItems.push({
        key: mapped ? mapped[1] : `custom_${checkItems.length}`,
        label,
        linkedExercise: mapped ? mapped[1] === 'exercise' : /运动/.test(label),
      });
    } else if (/体重/.test(text)) {
      metrics.push({ key: 'weight', label: '体重', unit: 'kg' });
    } else if (/腰围/.test(text)) {
      metrics.push({ key: 'waist', label: '腰围', unit: 'cm' });
    } else if (/备注/.test(text)) {
      noteEnabled = true;
    }
  });

  // 备注列非空的日期 → 称重/量腰围提示日
  const noteCol = rows[headerIdx].findIndex((c) => /备注/.test(c));
  const dateCol = 0;
  const year = new Date().getFullYear();
  const markedDays = [];
  if (noteCol > 0) {
    for (let i = headerIdx + 1; i < rows.length; i += 1) {
      const parsed = parseDateCell(rows[i][dateCol], year);
      if (parsed && String(rows[i][noteCol]).trim()) {
        markedDays.push(parsed.dateStr);
      }
    }
  }

  return { checkItems, metrics, noteEnabled, markedDays };
}

/** 从规则文本提取称重日:"称重:9/14、9/21、9/28…" */
function extractWeighDays(ruleItems, year) {
  const days = [];
  for (const line of ruleItems) {
    if (!/称重|称体重/.test(line)) continue;
    const re = /(\d{1,2})[\/\-.](\d{1,2})/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      days.push(toDateStr(year, Number(m[1]), Number(m[2])));
    }
  }
  return days;
}

/* ---------- 主入口(纯函数) ---------- */

/**
 * @param XLSX SheetJS 全局对象(注入,便于 node 测试)
 * @param workbook XLSX.read 的结果
 * @returns 月度计划对象
 */
export function parseWorkbook(XLSX, workbook) {
  const planSheetName =
    findSheetName(workbook, ['计划表']) || workbook.SheetNames[0];
  const planRows = sheetRows(XLSX, workbook.Sheets[planSheetName]);
  const { title, person, days } = parsePlanSheet(planRows);

  const first = days[0];
  const monthKey = first.date.slice(0, 7);
  const year = Number(monthKey.slice(0, 4));

  let rules = { title: '', items: [] };
  const rulesName = findSheetName(workbook, ['规则']);
  if (rulesName) rules = parseRulesSheet(sheetRows(XLSX, workbook.Sheets[rulesName]));

  let refGroups = [];
  const refName = findSheetName(workbook, ['替换', '食材']);
  if (refName) refGroups = parseGroupsSheet(sheetRows(XLSX, workbook.Sheets[refName]));

  let shoppingGroups = [];
  const shopName = findSheetName(workbook, ['采购']);
  if (shopName) {
    shoppingGroups = parseGroupsSheet(sheetRows(XLSX, workbook.Sheets[shopName]));
  }

  let checkItems = DEFAULT_CHECK_ITEMS;
  let metrics = DEFAULT_METRICS;
  let noteEnabled = true;
  let markedDays = [];
  const recordName = findSheetName(workbook, ['记录', '打卡']);
  if (recordName) {
    const record = parseRecordSheet(sheetRows(XLSX, workbook.Sheets[recordName]));
    if (record) {
      if (record.checkItems.length) checkItems = record.checkItems;
      if (record.metrics.length) metrics = record.metrics;
      noteEnabled = record.noteEnabled;
      markedDays = record.markedDays;
    }
  }

  const weighDays = [
    ...new Set([...extractWeighDays(rules.items, year), ...markedDays]),
  ].filter((d) => days.some((day) => day.date === d));

  return {
    monthKey,
    title,
    person,
    days,
    rules,
    refGroups,
    shoppingGroups,
    checkItems,
    metrics,
    noteEnabled,
    weighDays,
    importedAt: new Date().toISOString(),
  };
}

/* ---------- 浏览器入口 ---------- */

let xlsxLoading = null;

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxLoading) {
    xlsxLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SHEETJS_URL;
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => {
        xlsxLoading = null;
        reject(new Error('表格解析库加载失败,请检查网络后重试'));
      };
      document.head.appendChild(script);
    });
  }
  return xlsxLoading;
}

/**
 * 读取用户选择的 xlsx 文件并解析为月度计划
 * @param file File 对象
 */
export async function importXlsxFile(file) {
  const XLSX = await loadSheetJS();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return parseWorkbook(XLSX, workbook);
}
