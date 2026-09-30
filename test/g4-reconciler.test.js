// 在 Node 中加载浏览器脚本：只需要一个最小的 KG 桩
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const KG = { h() {}, s() {}, register() {}, aliases: {}, store: { get: () => 0, set() {} } };
const ctx = { window: { KG }, KG, console, performance: { now: () => 0 } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/g4-operator.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/g3-concepts.js', 'utf8'), ctx);
const { REC_LEVELS, runReconciler } = KG._g4;
const L = Object.fromEntries(REC_LEVELS.map(l => [l.id, l]));
function judge(id, prog) {
  const lv = L[id]; const { w, x } = runReconciler(lv, prog);
  const checks = lv.checks(w, x); const hard = checks.filter(c => !c.soft);
  const pass = hard.every(c => c.ok);
  const clean = checks.every(c => c.ok) && !x.wrongStatus && x.pwChanges === 0 && !x.manualDelete && !x.touchedWhileDeleting;
  return { pass, clean, failed: checks.filter(c => !c.ok).map(c => c.text) };
}
const GOOD = ['get', 'applySts', 'applySvc', 'ensureSecret', 'statusUpdate', 'retOk'];
const cases = [
  ['r1', GOOD, true, true],
  ['r1', ['get', 'createSts', 'createSvc', 'createSecret', 'statusUpdate', 'retOk'], true, true],
  ['r1', ['get', 'applySts', 'applySvc', 'ensureSecret', 'updateWrong', 'retOk'], false],
  ['r1', ['applySts', 'get', 'applySvc', 'ensureSecret', 'statusUpdate', 'retOk'], false],
  ['r2', GOOD, true, true],
  ['r2', ['get', 'createSts', 'createSvc', 'createSecret', 'statusUpdate', 'retOk'], false],
  ['r2', ['get', 'applySts', 'applySvc', 'applySecret', 'statusUpdate', 'retOk'], false],
  ['r3', ['get', 'addFinalizer', 'ensureBucket', ...GOOD.slice(1)], true, true],
  ['r3', ['get', 'ensureBucket', 'addFinalizer', ...GOOD.slice(1)], false],
  ['r3', GOOD, false],
  ['r4', ['get', 'deleteBucket', 'removeFinalizer', 'retOk'], true, true],
  ['r4', ['get', 'deleteBucket', 'removeFinalizer', 'statusUpdate', 'retOk'], true, true],
  ['r4', ['get', 'removeFinalizer', 'deleteBucket', 'retOk'], false],
  ['r4', ['get', 'deleteBucket', 'retOk'], false],
  ['r4', ['get', 'deleteBucket', 'deleteChildren', 'removeFinalizer', 'retOk'], true, false],
  ['r4', ['get', 'applySts', 'deleteBucket', 'removeFinalizer', 'retOk'], true, false],
  ['r5', ['get', 'ensureBucket', ...GOOD.slice(1)], true, true],
  ['r5', ['get', 'ensureBucketSwallow', ...GOOD.slice(1)], false],
  ['r5', ['get', 'ensureBucketSwallow', 'applySts', 'applySvc', 'ensureSecret', 'statusUpdate', 'retRequeue'], false],
];
for (const [id, prog, pass, clean] of cases) {
  const r = judge(id, prog);
  console.log(id, r.pass ? 'PASS' : 'FAIL', r.clean ? 'clean' : '', '|', prog.join(','), r.failed.length ? '\n    ✗ ' + r.failed.join('\n    ✗ ') : '');
  assert.equal(r.pass, pass, `${id} pass mismatch`);
  if (clean !== undefined) assert.equal(r.clean, clean, `${id} clean mismatch`);
}
// 选择器关卡：确认每关都有解
const { SEL_PODS, SEL_LEVELS, matchTerm } = KG._g3;
const sols = { s1: [{ key: 'app', op: '=', values: ['cart'] }], s2: [{ key: 'app', op: '=', values: ['shop'] }, { key: 'tier', op: '=', values: ['frontend'] }, { key: 'env', op: '=', values: ['prod'] }], s3: [{ key: 'env', op: '=', values: ['prod'] }, { key: 'track', op: 'NotIn', values: ['canary'] }], s4: [{ key: 'app', op: 'In', values: ['cart', 'auth'] }, { key: 'tier', op: '=', values: ['backend'] }], s5: [{ key: 'version', op: 'DoesNotExist', values: [] }], s6: [{ key: 'env', op: '=', values: ['prod'] }, { key: 'version', op: 'Exists', values: [] }, { key: 'tier', op: 'In', values: ['backend', 'db'] }] };
for (const lv of SEL_LEVELS) {
  const target = SEL_PODS.filter(p => lv.target(p.labels)).map(p => p.name).join();
  const got = SEL_PODS.filter(p => sols[lv.id].every(t => matchTerm(p.labels, t))).map(p => p.name).join();
  assert.equal(got, target, lv.id); console.log('selector', lv.id, 'ok ->', target);
}
// s3 陷阱：track In (stable) 会漏掉没有 track 标签的 Pod
const trap = SEL_PODS.filter(p => [{ key: 'env', op: '=', values: ['prod'] }, { key: 'track', op: 'In', values: ['stable'] }].every(t => matchTerm(p.labels, t))).length;
assert.ok(trap < SEL_PODS.filter(p => SEL_LEVELS[2].target(p.labels)).length);
console.log('OK');
