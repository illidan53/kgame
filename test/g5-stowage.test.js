// 配载：用穷举求解器检查每关的难度，并用真实的模拟验证每关"参考思路"里的解能拿三星
const assert = require('assert');
const S = require('../js/g5-stowage-sim.js');
const { STEPS, NODE_TYPES, BAND, LEVELS, snapUp, podUsage, usersAt, peakPerPod, simulate } = S;

const inBand = (x) => x >= BAND[0] - 1e-9 && x <= BAND[1] + 1e-9;

// 枚举副本数 × 船队 × 装船方式。cpuReq: 'peak' 按峰值申报 CPU；'low' 把 CPU request 压到最低（超卖）
function solve(level, { cpuReq = 'peak', maxR = S.MAX_REPLICAS, maxNodes = 6, only } = {}) {
  const apps = level.apps;
  const out = { combos: 0, two: [], three: [] };
  const rVecs = [];
  const recR = (i, acc) => {
    if (i === apps.length) return rVecs.push(acc.slice());
    for (let r = 1; r <= maxR; r++) recR(i + 1, [...acc, r]);
  };
  only ? rVecs.push(only) : recR(0, []);
  const fleets = [];
  const recF = (i, acc, n) => {
    if (i === level.nodeTypes.length) return n > 0 && fleets.push(acc.slice());
    for (let c = 0; c + n <= maxNodes; c++) recF(i + 1, [...acc, c], n + c);
  };
  recF(0, [], 0);

  for (const r of rVecs) {
    out.combos++;
    const series = apps.map((a, k) => {
      const cpu = [];
      const mem = [];
      for (let i = 0; i < STEPS; i++) {
        const u = podUsage(a, usersAt(a, i / STEPS) / r[k]);
        cpu.push(u.cpu);
        mem.push(u.mem);
      }
      return { cpu, mem };
    });
    const req = series.map((x) => ({ cpu: cpuReq === 'low' ? S.SNAP.cpu : snapUp(Math.max(...x.cpu), S.SNAP.cpu), mem: snapUp(Math.max(...x.mem), S.SNAP.mem) }));
    // 每种船能装哪些"货物组合"并且两头都落在 60–80%
    const fits = {};
    for (const t of level.nodeTypes) {
      const T = NODE_TYPES[t];
      fits[t] = [];
      const recC = (i, acc) => {
        if (i === apps.length) {
          if (acc.every((c) => !c)) return;
          if (acc.reduce((s, c, k) => s + c * req[k].cpu, 0) > T.cpu || acc.reduce((s, c, k) => s + c * req[k].mem, 0) > T.mem) return;
          let pc = 0;
          let pm = 0;
          for (let s = 0; s < STEPS; s++) {
            pc = Math.max(pc, acc.reduce((v, c, k) => v + c * series[k].cpu[s], 0));
            pm = Math.max(pm, acc.reduce((v, c, k) => v + c * series[k].mem[s], 0));
          }
          if (inBand(pc / T.cpu) && inBand(pm / T.mem)) fits[t].push(acc.slice());
          return;
        }
        for (let c = 0; c <= r[i]; c++) recC(i + 1, [...acc, c]);
      };
      recC(0, []);
    }
    let best = null;
    for (const f of fleets) {
      const ships = [];
      f.forEach((c, i) => {
        for (let j = 0; j < c; j++) ships.push(level.nodeTypes[i]);
      });
      const price = ships.reduce((s, t) => s + NODE_TYPES[t].price, 0);
      if (best && price >= best.price) continue;
      const left = r.slice();
      const pick = [];
      const dfs = (k) => {
        if (k === ships.length) return left.every((x) => x === 0);
        for (const v of fits[ships[k]]) {
          if (v.some((c, i) => c > left[i])) continue;
          v.forEach((c, i) => (left[i] -= c));
          pick.push(v);
          if (dfs(k + 1)) return true;
          v.forEach((c, i) => (left[i] += c));
          pick.pop();
        }
        return false;
      };
      if (dfs(0)) best = { r, ships, pick: pick.map((v) => v.slice()), price };
    }
    if (best) {
      out.two.push(best);
      if (best.price <= level.budget) out.three.push(best);
    }
  }
  return out;
}

// 按副本数和船队拼出一份计划；request / limit 按峰值如实申报，cpuReq 可以覆盖
function planOf(level, replicas, ships, cpuReq = {}) {
  const apps = {};
  level.apps.forEach((a, k) => {
    const p = peakPerPod(a, replicas[k]);
    const cpu = snapUp(p.cpu, S.SNAP.cpu);
    const mem = snapUp(p.mem, S.SNAP.mem);
    apps[a.id] = { replicas: replicas[k], req: { cpu: cpuReq[a.id] ?? cpu, mem }, lim: { cpu, mem } };
  });
  const nodes = ships.map(([type, counts]) => ({ type, pods: counts.flatMap((c, k) => Array(c).fill(level.apps[k].id)) }));
  return { apps, nodes };
}

const L = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
const report = [];

// 1. 参考思路里的解都能拿三星
const examples = {
  s1: planOf(L.s1, [8], [['c4', [8]]]),
  s2: planOf(L.s2, [6, 6], [['c4', [2, 2]], ['c4', [2, 2]], ['c4', [2, 2]]]),
  s3: planOf(L.s3, [2, 2, 4], [['c4', [1, 1, 1]], ['c4', [1, 1, 1]], ['s2', [0, 0, 2]]]),
  s4: planOf(L.s4, [10, 5], Array(5).fill(['s2', [2, 1]]), { api: 600, batch: 700 }),
};
for (const [id, plan] of Object.entries(examples)) {
  const res = simulate(L[id], plan);
  assert.equal(res.stars, 3, `${id} 的参考解应该三星：${JSON.stringify({ events: res.events, peaks: res.nodes.map((n) => [n.peakCpu.toFixed(2), n.peakMem.toFixed(2)]), spend: res.spend })}`);
}

// 2. 每关都有解，三星的副本组合要少；朴素做法（每个服务 3 个副本、如实申报）拿不到两星
for (const lv of LEVELS) {
  const mode = lv.id === 's4' ? 'low' : 'peak';
  const all = solve(lv, { cpuReq: mode, maxR: lv.apps.length === 3 ? 10 : 12, maxNodes: lv.apps.length === 3 ? 5 : 6 });
  assert.ok(all.three.length > 0, `${lv.id} 没有三星解`);
  const share = all.three.length / all.combos;
  assert.ok(share <= 0.25, `${lv.id} 太容易：${(share * 100).toFixed(1)}% 的副本组合能三星`);
  const naive = solve(lv, { cpuReq: mode, only: lv.apps.map(() => 3) });
  assert.equal(naive.two.length, 0, `${lv.id}：每个服务 3 个副本就能两星，太容易`);
  report.push(`${lv.id} ${lv.title}：两星 ${all.two.length} / ${all.combos} 个副本组合，三星 ${all.three.length}（${(share * 100).toFixed(1)}%）`);
}

// 3. 错峰：CPU 按峰值申报最多两星，必须超卖才能三星
{
  const honest = solve(L.s4, { cpuReq: 'peak' });
  assert.ok(honest.two.length > 0, 's4 按峰值申报应该还能两星');
  assert.equal(honest.three.length, 0, 's4 按峰值申报不应该三星');
}

// 4. 各种事故都能被判出来
{
  const base = examples.s1;
  const tweak = (fn) => {
    const p = JSON.parse(JSON.stringify(base));
    fn(p);
    return simulate(L.s1, p);
  };
  const kinds = (r) => [...new Set(r.events.map((e) => e.kind))].sort().join(',');
  assert.equal(kinds(tweak((p) => (p.apps.web.lim.mem = 512))), 'oom');
  assert.equal(kinds(tweak((p) => (p.apps.web.lim.cpu = 200))), 'throttle');
  assert.equal(kinds(tweak((p) => (p.apps.web.req.mem = 512))), 'overReq');
  assert.equal(tweak((p) => p.nodes[0].pods.pop()).stars, 0, '有 Pod 没装船不能得星');
  // request 报低、多装：同一艘船装下两倍的 Pod，高峰超载
  const over = tweak((p) => {
    p.apps.web.replicas = 16;
    p.nodes[0].pods = Array(16).fill('web');
  });
  assert.ok(over.events.some((e) => e.kind === 'overload'), '装太多应该超载');
}

console.log(report.join('\n'));
console.log('OK');
