/**
 * 计算内核单元测试
 * 运行：node test/calc.test.mjs
 * 说明：直接从 index.html 中抽取「CALC MODULE」纯函数区块执行，保证测的就是线上代码。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const START = '/* ===== CALC MODULE START ===== */';
const END = '/* ===== CALC MODULE END ===== */';
const i = html.indexOf(START), j = html.indexOf(END);
if (i < 0 || j < 0) { console.error('未找到 CALC MODULE 标记'); process.exit(1); }
const code = html.slice(i + START.length, j);

const eSTART = '/* ===== EXPR MODULE START ===== */';
const eEND = '/* ===== EXPR MODULE END ===== */';
const ei = html.indexOf(eSTART), ej = html.indexOf(eEND);
if (ei < 0 || ej < 0) { console.error('未找到 EXPR MODULE 标记'); process.exit(1); }
const exprCode = html.slice(ei + eSTART.length, ej);

const mod = new Function(code + '\nreturn { computePlan, num, round2, roundTo, trimNum };')();
const { computePlan, num, round2, trimNum } = mod;
const ex = new Function(exprCode + '\nreturn { evalExpr, normalizeExpr };')();
const { evalExpr, normalizeExpr } = ex;

let pass = 0, fail = 0;
function eq(label, got, want, tol = 0) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : Object.is(got, want);
  if (ok) { pass++; console.log('  ✓ ' + label + '  →  ' + got); }
  else { fail++; console.log('  ✗ ' + label + '  →  得到 ' + got + '，期望 ' + want); }
}
function ok(label, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + label + (extra ? '  →  ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  →  ' + extra : '')); }
}
const P = (name, spec, price, qty) => ({ name, spec, price, qty });
const G = (name, spec, price, qty) => ({ name, spec, price, qty });

console.log('\n[1] 单产品 · 只拿货不赠送');
{
  const r = computePlan([P('五年', 6, 100, 10)], [], '', { precision: 2 });
  eq('拿货合计 = 10箱×6瓶×100', r.purchaseTotal, 6000);
  eq('赠送货值 = 0', r.giftValue, 0);
  eq('客户付款 = 拿货合计', r.payment, 6000);
  eq('综合折扣 = 100%', r.rate, 1);
  eq('底价 = 开票价', r.items[0].bottom, 100);
  eq('到手瓶数 = 60', r.totalBottles, 60);
  eq('差额 = 0', r.diff, 0);
  ok('验算完全一致', r.exact === true);
}

console.log('\n[2] 单产品 · 买10箱送6瓶（保留2位）');
{
  const r = computePlan([P('五年', 6, 100, 10)], [G('五年', 6, 100, 6)], '', { precision: 2 });
  eq('拿货合计', r.purchaseTotal, 6000);
  eq('赠送货值 = 6瓶×100', r.giftValue, 600);
  eq('开票总值', r.invoiceTotal, 6600);
  eq('客户付款', r.payment, 6000);
  eq('综合折扣', r.rate, 6000 / 6600, 1e-12);
  eq('到手瓶数 = 60+6', r.totalBottles, 66);
  eq('底价 = 100×6000/6600 保留2位', r.items[0].bottom, 90.91);
  eq('按底价合计', r.sumByBottom, 6000.06);
  eq('差额', r.diff, -0.06);
  eq('允许尾差 = 0.5分×66瓶', r.tolerance, 0.33);
  ok('在尾差内 → 判定通过', r.pass === true);
  ok('非完全一致（含尾差）', r.exact === false);
  eq('合并为同一产品行', r.items.length, 1);
}

console.log('\n[3] 同上一单 · 保留4位 → 应完全一致');
{
  const r = computePlan([P('五年', 6, 100, 10)], [G('五年', 6, 100, 6)], '', { precision: 4 });
  eq('底价 4位', r.items[0].bottom, 90.9091);
  eq('按底价合计', r.sumByBottom, 6000);
  eq('差额 = 0', r.diff, 0);
  ok('验算完全一致', r.exact === true);
}

console.log('\n[4] 多产品分摊（拿货+赠送混合）');
{
  const r = computePlan(
    [P('五年', 6, 100, 10), P('十年', 4, 285, 5)],
    [G('十年', 4, 285, 8)],
    '', { precision: 2 });
  eq('拿货合计 = 6000 + 5700', r.purchaseTotal, 11700);
  eq('赠送货值 = 8×285', r.giftValue, 2280);
  eq('开票总值', r.invoiceTotal, 13980);
  eq('客户付款', r.payment, 11700);
  const five = r.items.find(x => x.name === '五年');
  const ten = r.items.find(x => x.name === '十年');
  eq('五年底价', five.bottom, 83.69);
  eq('十年底价', ten.bottom, 238.52);
  eq('五年到手瓶数', five.qty, 60);
  eq('十年到手瓶数 = 20+8', ten.qty, 28);
  eq('十年拿货箱数', ten.pBoxes, 5);
  eq('十年赠送瓶数', ten.gBottles, 8);
  eq('按底价合计', r.sumByBottom, 11699.96);
  eq('差额', r.diff, 0.04);
  ok('在尾差内 → 通过', r.pass === true, '尾差上限 ' + r.tolerance);
  const sumAlloc = round2(r.items.reduce((a, x) => a + x.allocated, 0));
  eq('各产品底价金额之和 = 客户付款', sumAlloc, 11700, 0.5);
}

console.log('\n[5] 自定义客户付款金额（抹零/政策扣减）');
{
  const r = computePlan(
    [P('五年', 6, 100, 10), P('十年', 4, 285, 5)],
    [G('十年', 4, 285, 8)],
    10000, { precision: 2 });
  eq('客户付款 = 手动值', r.payment, 10000);
  ok('标记为自定义', r.overridden === true);
  eq('综合折扣', r.rate, 10000 / 13980, 1e-12);
  eq('五年底价', r.items.find(x => x.name === '五年').bottom, 71.53);
  ok('差额在尾差内', r.pass === true, '差额 ' + r.diff);
}

console.log('\n[6] 边界与健壮性');
{
  const r = computePlan([], [], '', { precision: 2 });
  ok('空数据不抛错', true);
  ok('hasData = false', r.hasData === false);
  eq('付款为 0', r.payment, 0);
  eq('折扣为 0（不出现 NaN）', r.rate, 0);
  eq('瓶数为 0', r.totalBottles, 0);

  const bad = computePlan([P('五年', 6, 0, 10), P('六年', 6, 130, 0)], [], '', {});
  ok('无效行（0价/0量）被忽略', bad.items.length === 0);

  const r3 = computePlan([P('十年礼盒', 2, 260, 3)], [], '', { precision: 2 });
  eq('规格2瓶/箱 × 3箱 = 6瓶', r3.totalBottles, 6);
  eq('金额 = 6×260', r3.payment, 1560);

  const noSpec = computePlan([P('散货', '', 100, 5)], [], '', {});
  ok('拿货行规格缺失 → 整行跳过（不静默按 1 瓶/箱算）', noSpec.hasData === false);
  eq('规格缺失时不产生拿货金额', noSpec.purchaseTotal, 0);
  const giftNoSpec = computePlan([], [G('赠品', '', 50, 4)], '', {});
  eq('赠送行不需要规格也能算瓶数', giftNoSpec.totalBottles, 4);
  eq('赠送行金额 = 4×50', giftNoSpec.giftValue, 200);
  const okSpec = computePlan([P('散货', 6, 100, 5)], [], '', {});
  eq('规格正常时 = 5箱×6瓶', okSpec.totalBottles, 30);

  const text = computePlan([{ name: 'A', spec: '6', price: '100.5', qty: '2' }], [], '1500', {});
  eq('字符串输入可解析', text.purchaseTotal, 1206);
  eq('自定义付款为字符串也可解析', text.payment, 1500);
}

console.log('\n[7] 数值工具');
{
  eq('round2(1.005)', round2(1.005), 1.01);
  eq('round2(-0.005) 远离零取整', round2(-0.005), -0.01);
  eq('round2(-0.001) 归零', round2(-0.001) === 0 ? 0 : round2(-0.001), 0);
  eq('num("¥1,280.50")', num('¥1,280.50'), 1280.5);
  eq('num("abc")', num('abc'), 0);
  eq('trimNum(90.909090)', trimNum(90.909090, 6), '90.90909');
}

console.log('\n[8] 算式计算器 evalExpr');
{
  const r = (s) => evalExpr(s);
  const near = (label, got, want, tol = 1e-9) => {
    if (got !== null && Math.abs(got - want) <= tol) { pass++; console.log('  ✓ ' + label + '  →  ' + got); }
    else { fail++; console.log('  ✗ ' + label + '  →  得到 ' + got + '，期望 ' + want); }
  };
  const bad = (label, s) => { const v = r(s); if (v === null) { pass++; console.log('  ✓ ' + label + '  →  正确判为非法'); } else { fail++; console.log('  ✗ ' + label + '  →  应为非法，却得到 ' + v); } };

  // 用户给的例子
  near('600x97%÷(600+130)x130', r('=600x97%÷(600+130)x130'), 582 / 730 * 130);
  eq('  结果保留 3 位 →', Math.round((582 / 730 * 130) * 1000) / 1000, 103.644);
  near('全角 ×÷（）', r('600×97%÷（600+130）×130'), 582 / 730 * 130);
  near('大写 X 当乘号', r('600X97%/(600+130)*130'), 582 / 730 * 130);
  near('空格与千分位', r(' 1,000 + 500 '), 1500);
  near('乘除优先级', r('2+3×4'), 14);
  near('括号优先', r('(2+3)×4'), 20);
  near('负数与减号', r('-5+2'), -3);
  near('一元负号连用', r('--5'), 5);
  near('百分号后置', r('200%'), 2);
  near('百分号在括号后', r('(600+130)%'), 7.3);
  near('连乘', r('3×4×5'), 60);
  near('小数', r('0.5×4'), 2);
  near('除号 / 与 ÷ 等价', r('100/4'), 25);
  bad('除数为 0', '1/0');
  bad('括号不配对', '(1+2');
  bad('运算符结尾', '1+');
  bad('空算式', '   ');
  bad('纯文字', 'abc');
  bad('数字后跟乱码', '5%2');
  bad('超长算式', '1+'.repeat(150) + '1');
  eq('normalizeExpr 归一化', normalizeExpr('＝（1＋2）'), '(1+2)');
}

console.log('\n[9] 手动付款金额支持多位小数（算式结果）');
{
  const r = computePlan([P('五年', 6, 100, 10)], [], '103.644', { precision: 3 });
  eq('付款金额原样保留 3 位', r.payment, 103.644, 1e-12);
  eq('综合折扣率随之变化', r.rate, 103.644 / 6000, 1e-12);
  eq('客户付款仍标记为手动', r.overridden, true);
  const r2 = computePlan([P('五年', 6, 100, 10)], [], '0.005', { precision: 2 });
  eq('小数不超过 4 位', r2.payment, 0.005, 1e-12);
}

console.log('\n──────────────────────────────');
console.log(fail === 0 ? `全部通过：${pass} 项断言 ✅` : `${pass} 项通过，${fail} 项失败 ❌`);
process.exit(fail === 0 ? 0 : 1);
