/* ============================================
   模版 xlsx 生成
   - buildTemplateWorkbook 为纯函数(XLSX 由调用方注入),可在 node 中测试
   - 浏览器入口 downloadTemplateXlsx 复用 SheetJS 并触发下载
   - 模版结构与 xlsx-import.js 的解析约定一一对应
   ============================================ */

import { loadSheetJS } from './xlsx-import.js';
import { weekdayOf } from './day-status.js';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/* ---------- 各 sheet 内容(二维数组) ---------- */

/** 计划表:标题行 + 表头行 + 整月日期骨架,前三天填好示例内容 */
function planSheetAoA(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  const title = `${year}年${month}月训练计划表(${month}/1~${month}/${lastDay}) 姓名 年龄 身高cm 体重kg 目标kcal/天`;
  const header = ['日期', '星期', '运动(时间)', '早餐', '午餐', '晚餐 18:00', '练后 21:00'];
  const examples = [
    ['游泳40min (19:30~20:20)', '燕麦40g+鸡蛋2个+无糖豆浆', '鸡胸肉150g+糙米100g+西兰花', '鱼虾150g+蔬菜沙拉+红薯100g', '蛋白粉30g+香蕉1根'],
    ['力量训练-胸肩 (18:30~19:30)', '全麦面包2片+鸡蛋2个+牛奶250ml', '瘦牛肉150g+米饭150g+菠菜', '鸡胸肉150g+南瓜100g+生菜沙拉', '蛋白粉30g'],
    ['完全休息', '燕麦40g+鸡蛋1个+无糖豆浆', '鱼虾150g+糙米100g+番茄鸡蛋汤', '豆腐200g+蔬菜沙拉', ''],
  ];

  const rows = [[title], header];
  for (let d = 1; d <= lastDay; d += 1) {
    const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
    rows.push([`${month}/${d}`, weekdayOf(dateStr), ...(examples[d - 1] || [])]);
  }
  return rows;
}

/** 执行规则:一行一条;「称重:日期」会被提取为称重提醒日 */
function rulesSheetAoA(month) {
  return [
    ['执行规则'],
    ['1. 每天按计划表执行,练后 30 分钟内补充蛋白质'],
    ['2. 饮水≥2L,无零食甜饮,23:00 前睡觉'],
    [`3. 称重:${month}/1、${month}/15(早晨空腹;写成「称重:日期」会自动生成提醒)`],
  ];
}

/** 食材替换:单列行为分组标题,两列行为「类别 | 说明」 */
const REF_ROWS = [
  ['优质蛋白'],
  ['鸡胸肉', '鱼虾、瘦牛肉、蛋清'],
  ['鸡蛋', '蛋白 3 个、豆腐 150g'],
  ['主食碳水'],
  ['糙米', '燕麦、红薯、玉米'],
  ['燕麦', '全麦面包、藜麦'],
  ['蔬菜'],
  ['西兰花', '生菜、菠菜、番茄'],
];

/** 每周采购:同食材替换的分组结构 */
const SHOPPING_ROWS = [
  ['第1周'],
  ['蛋白质', '鸡胸肉500g、鱼虾300g、鸡蛋30个'],
  ['蔬果', '西兰花2颗、生菜1把、番茄4个'],
  ['主食', '燕麦500g、糙米1kg、红薯1kg'],
  ['第2周'],
  ['蛋白质', '鸡胸肉500g、瘦牛肉300g'],
  ['蔬果', '菠菜、彩椒、黄瓜'],
  ['主食', '全麦面包、藜麦、玉米'],
];

/** 每日执行记录:表头即打卡项定义(带 ✓ 的列成为勾选项) */
const RECORD_HEADER = [
  ['日期', '星期', '计划运动', '运动完成✓', '三餐按计划✓', '无零食甜饮✓', '饮水≥2L✓', '23:00前睡✓', '体重(kg)', '腰围(cm)', '备注'],
];

/* ---------- 工作簿构建 ---------- */

/**
 * @param XLSX SheetJS 全局对象(注入,便于 node 测试)
 * @param now 基准日期,模版生成该日期所在月份
 * @returns {{ wb: object, fileName: string }}
 */
export function buildTemplateWorkbook(XLSX, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const sheets = [
    [`${month}月计划表`, planSheetAoA(year, month), [{ wch: 8 }, { wch: 6 }, { wch: 26 }, { wch: 30 }, { wch: 34 }, { wch: 30 }, { wch: 22 }]],
    ['执行规则', rulesSheetAoA(month), [{ wch: 72 }]],
    ['食材替换参考', REF_ROWS, [{ wch: 12 }, { wch: 40 }]],
    ['每周采购表', SHOPPING_ROWS, [{ wch: 10 }, { wch: 48 }]],
    ['每日执行记录', RECORD_HEADER, RECORD_HEADER[0].map(() => ({ wch: 12 }))],
  ];

  const wb = XLSX.utils.book_new();
  for (const [name, aoa, cols] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return { wb, fileName: `训练计划表模版-${year}-${pad2(month)}.xlsx` };
}

/* ---------- 浏览器入口 ---------- */

/** 生成模版 xlsx 并触发浏览器下载 */
export async function downloadTemplateXlsx() {
  const XLSX = await loadSheetJS();
  const { wb, fileName } = buildTemplateWorkbook(XLSX);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link); // 个别浏览器要求元素在 DOM 中才触发下载
  link.click();
  link.remove();
  // 延迟回收:立即 revoke 可能在下载开始前就吊销 blob URL
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
