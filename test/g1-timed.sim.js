// 计时关难度调参：用"首次适应"和"最佳适应"两种机器人模拟玩家
const fs = require('fs'); const vm = require('vm');
const KG = { h() {}, s() {}, register() {}, store: { get: () => 0, set() {} }, fmtMem: String, fmtCpu: String, rng: (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; } };
const ctx = { window: { KG }, KG, console, document: { addEventListener() {} } }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/g1-scheduler.js', 'utf8'), ctx);
const { LEVELS, filterNode } = KG._g1; const lv = LEVELS.find(l => l.timed);
const P = { i0: +process.argv[2] || 2.5, i1: +process.argv[3] || 1.2, rMin: +process.argv[4] || 14, rSpan: +process.argv[5] || 11 };
function play(strategy, react, scaleAt) {
  const rnd = KG.rng(42); const nodes = lv.nodes(); let q = [], t = 0, next = 1, strikes = 0, done = 0, spawned = 0, extra = 0, cool = 0;
  const free = n => { let c = 3500, m = 7168; for (const p of n.pods) { c -= p.cpu; m -= p.mem; } return { c, m }; };
  while (t < lv.duration) {
    t += 0.1; next -= 0.1;
    if (next <= 0) { const tot = lv.templates.reduce((s, x) => s + x.w, 0); let r = rnd() * tot, tp = lv.templates[0]; for (const x of lv.templates) { r -= x.w; if (r < 0) { tp = x; break; } } spawned++; q.push({ cpu: tp.cpu, mem: tp.mem, waited: 0, runtime: Math.round(P.rMin + rnd() * P.rSpan), tolerations: [], nodeSelector: {} }); next = P.i0 - (P.i0 - P.i1) * Math.min(1, t / lv.duration); }
    for (const n of nodes) { if (!n.ready) { n.provision -= 0.1; if (n.provision <= 0) n.ready = true; } n.pods = n.pods.filter(p => (p.remaining -= 0.1) > 0 || (done++, false)); }
    q = q.filter(p => (p.waited += 0.1) < 15 || (strikes++, false));
    if (strikes >= 3) return { win: false, t: t.toFixed(0), strikes, extra };
    cool -= 0.1;
    if (cool <= 0 && q.length) {
      cool = react;
      // 尝试队首，放不下就试下一个（人会跳过放不下的）
      for (const p of q) {
        const ok = nodes.map((n, i) => ({ n, i })).filter(x => !filterNode(x.n, p));
        if (!ok.length) continue;
        const pick = strategy === 'first' ? ok[0] : ok.sort((a, b) => { const fa = free(a.n), fb = free(b.n); return (fa.c - p.cpu) / 3500 + (fa.m - p.mem) / 7168 - ((fb.c - p.cpu) / 3500 + (fb.m - p.mem) / 7168); })[0];
        p.remaining = p.runtime; pick.n.pods.push(p); q = q.filter(x => x !== p); break;
      }
      if (scaleAt != null && q.length >= scaleAt && extra < 2) { extra++; nodes.push(Object.assign(lv.nodes()[0], { name: 'x' + extra, ready: false, provision: 5, pods: [] })); }
    }
  }
  return { win: true, strikes, extra, done };
}
for (const s of ['first', 'best']) for (const react of [0.4, 0.8]) console.log(s, react, JSON.stringify(play(s, react)), 'with-scale:', JSON.stringify(play(s, react, 4)));
