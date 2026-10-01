/* 配载（Stowage）的模拟内核：纯逻辑，无 DOM，可在 Node 中测试。
 * 每个 Deployment 的单个 Pod 用量 = 基线 + 斜率 × 分到这个 Pod 的用户数；Service 把用户平均分给已装船（Running）的副本。
 * 调度（玩家拖动）只看 request；一天里看的是实际用量：
 *   内存超过 limit → OOMKilled；内存超过 request → 节点一紧张就会先被驱逐（内存不可压缩，所以 request 要覆盖高峰）；
 *   CPU 超过 limit → 被节流；CPU 超过 request 只是借用空闲，可以；
 *   节点上的实际用量超过可分配量 → 超载。
 * 目标：高峰时每个节点的 CPU 和内存使用率都在 60–80%。
 */
(function (root) {
  'use strict';

  const STEPS = 96; // 一天 96 步，每步 15 分钟
  const SNAP = { cpu: 50, mem: 64 };
  const BAND = [0.6, 0.8];
  const MAX_REPLICAS = 12;

  // ---------------------------------------------------------------- 流量曲线
  // 每条曲线是几个高斯峰叠在底量上，归一化到最高点 = 1。t ∈ [0, 1) 表示一天
  const CURVES = {
    evening: { base: 0.12, peaks: [[0.39, 0.06, 0.32], [0.83, 0.075, 0.95]] }, // 早上一个小峰，20:00 高峰
    morning: { base: 0.1, peaks: [[0.4, 0.06, 0.95], [0.78, 0.08, 0.3]] }, // 9:30 高峰
    night: { base: 0.08, peaks: [[0.1, 0.06, 0.95], [1.1, 0.06, 0.95]] }, // 2:30 的批处理（跨午夜）
  };
  const rawCurve = (c, t) => c.peaks.reduce((v, [m, w, a]) => v + a * Math.exp(-((t - m) ** 2) / (2 * w * w)), c.base);
  const CURVE_MAX = {};
  for (const k in CURVES) {
    let m = 0;
    for (let i = 0; i <= 2000; i++) m = Math.max(m, rawCurve(CURVES[k], i / 2000));
    CURVE_MAX[k] = m;
  }
  const traffic = (curve, t) => rawCurve(CURVES[curve], ((t % 1) + 1) % 1) / CURVE_MAX[curve];

  // ---------------------------------------------------------------- 节点型号（可分配量，已扣除系统预留）
  const NODE_TYPES = {
    c4: { id: 'c4', name: '计算型 c4', en: 'Compute c4', cpu: 4000, mem: 8192, price: 4 },
    m4: { id: 'm4', name: '通用型 m4', en: 'General m4', cpu: 4000, mem: 16384, price: 5 },
    r2: { id: 'r2', name: '内存型 r2', en: 'Memory r2', cpu: 2000, mem: 16384, price: 4 },
    s2: { id: 's2', name: '小型 s2', en: 'Small s2', cpu: 2000, mem: 4096, price: 2 },
  };

  // ---------------------------------------------------------------- 关卡（数值由 test/g5-stowage.test.js 的求解器校验）
  // cpu / mem：[基线, 每个用户增加多少]，单位 m / Mi；users：高峰时的总用户数；curve：一天的流量形状
  const START = { replicas: 3, req: { cpu: 500, mem: 512 }, lim: { cpu: 1000, mem: 1024 } };
  const LEVELS = [
    {
      id: 's1',
      title: '第一艘船',
      intro:
        '每个 <b>web</b> Pod 的用量随它分到的用户数直线上涨（左边的拟合线）。今晚 20:00 高峰一共 6000 个用户，Service 会平均分给所有副本——副本越多，每个 Pod 越轻，但每个 Pod 都有一份 480Mi 的内存底座。<br>调好副本数和 request / limit，造一艘<b>计算型 c4</b>，把 Pod 拖上船，然后开船跑一天。',
      tip: {
        title: 'request 和 limit 怎么定',
        html: '调度器只看 <b>request</b>：船上已申报的量加上新 Pod 的 request，不能超过可分配量。<br><b>内存不可压缩</b>：用量超过 request，节点一紧张这个 Pod 就最先被驱逐；超过 limit 直接 OOMKilled。所以内存 request 要盖住高峰。<br><b>CPU 可压缩</b>：用量超过 request 只是借用空闲的 CPU；超过 limit 才会被节流。',
      },
      debrief:
        '副本数决定每个 Pod 分到多少用户。3 个副本时每个 Pod 高峰要 860m / 980Mi，整船内存只有 36%；副本加到 8～10 个，每个 Pod 变轻，但 480Mi 的底座一份份加起来，内存才爬进 60–80%。CPU 几乎只跟总用户数有关，副本数从 3 到 10，它都在 65–75% 之间。',
      apps: [{ id: 'web', color: '#60a5fa', curve: 'evening', users: 6000, cpu: [60, 0.4], mem: [480, 0.25] }],
      nodeTypes: ['c4'],
      budget: 4,
    },
    {
      id: 's2',
      title: '两种货',
      intro:
        '<b>api</b> 吃 CPU，<b>cache</b> 吃内存，高峰都是 20:00、各 12000 个用户。只装一种货，船总有一头吃水太浅。<br>船坞里有计算型 c4（4 核 / 8Gi）和内存型 r2（2 核 / 16Gi），预算 ¥12。',
      tip: {
        title: '两个维度要一起满',
        html: '一艘船要同时让 CPU 和内存都落在 60–80%。吃 CPU 的和吃内存的 Pod 混在同一条船上，两头才会一样深。<br>副本数改变的是每个 Pod 的大小：随用户增长的那部分总量不变，但每多一个副本就多一份基线。',
      },
      debrief:
        '最便宜的是 3 艘 c4，每艘都混装：比如 api 6 个、cache 6 个，每艘 2 + 2；或者 api 3 个、cache 9 个，每艘 1 + 3。把 cache 全放到 r2 上看起来顺理成章，但 r2 的 CPU 用不到 60%；api 单独装一艘 c4，内存又太浅。',
      apps: [
        { id: 'api', color: '#60a5fa', curve: 'evening', users: 12000, cpu: [100, 0.5], mem: [256, 0.04] },
        { id: 'cache', color: '#34d399', curve: 'evening', users: 12000, cpu: [50, 0.05], mem: [1024, 0.6] },
      ],
      nodeTypes: ['c4', 'r2'],
      budget: 12,
    },
    {
      id: 's3',
      title: '选船',
      intro:
        '三种货：<b>api</b> 吃 CPU，<b>cache</b> 吃内存，<b>search</b> 两样都要一些。船坞里有四种船，价格不同，预算 ¥10。<br>先算出每种 Pod 的大小，再挑比例合适的船。',
      tip: {
        title: '挑船看比例',
        html: '每种船的 CPU 和内存比例不同：c4 是 1 核配 2Gi，m4 是 1 核配 4Gi，r2 是 1 核配 8Gi，s2 也是 1 核配 2Gi，但只有 c4 的一半大。<br>一艘船上货物的 CPU : 内存比例越接近船的比例，越容易两头都装满。小船能用来"补零头"。',
      },
      debrief:
        '最便宜的组合是 ¥10。比如 api 2、cache 2、search 4 个副本：两艘 c4 各装 1 个 api、1 个 cache、1 个 search，再用一艘 s2 装剩下的 2 个 search。m4 和 r2 也能拿两星，但会超预算。',
      apps: [
        { id: 'api', color: '#60a5fa', curve: 'evening', users: 6000, cpu: [100, 0.5], mem: [256, 0.04] },
        { id: 'cache', color: '#34d399', curve: 'evening', users: 10000, cpu: [50, 0.05], mem: [1024, 0.6] },
        { id: 'search', color: '#818cf8', curve: 'evening', users: 8000, cpu: [150, 0.3], mem: [768, 0.25] },
      ],
      nodeTypes: ['c4', 'm4', 'r2', 's2'],
      budget: 10,
    },
    {
      id: 's4',
      title: '错峰',
      intro:
        '<b>api</b> 晚上 8 点最忙；<b>batch</b> 是凌晨 2 点跑的批处理，高峰时有 3000 个任务。它们不会同时到高峰。<br>如果每个 Pod 的 CPU request 都按自己的峰值申报，船上申报的总量会远大于任何一刻的真实用量。预算 ¥10。',
      tip: {
        title: 'CPU 可以超卖，内存不行',
        html: 'CPU 是可压缩资源：request 可以低于峰值，只要 <b>limit</b> 盖住峰值、同一时刻整艘船的用量不超过容量——两个错峰的服务正好互相让出 CPU。<br>内存不行：内存 request 仍然要盖住各自的高峰。',
      },
      debrief:
        '按峰值申报 CPU 最多做到两星（要花 ¥12）。把 CPU request 降下来，比如 api 600m、batch 700m，limit 仍然盖住峰值，就能用 5 艘小型 s2，每艘装 2 个 api + 1 个 batch，正好 ¥10：晚上 api 忙、凌晨 batch 忙，同一艘船的 CPU 高峰都落在 60–80%。',
      apps: [
        { id: 'api', color: '#60a5fa', curve: 'evening', users: 12000, cpu: [100, 0.5], mem: [384, 0.1] },
        { id: 'batch', color: '#fbbf24', curve: 'night', users: 3000, unit: '任务', cpu: [100, 1.5], mem: [1536, 0.3] },
      ],
      nodeTypes: ['c4', 'm4', 's2'],
      budget: 10,
    },
  ];
  for (const lv of LEVELS) for (const a of lv.apps) a.start = a.start || START;

  // ---------------------------------------------------------------- 计算
  const snapUp = (v, step) => Math.ceil(v / step - 1e-9) * step;
  const usersAt = (app, t) => app.users * traffic(app.curve, t);
  const podUsage = (app, users) => ({ cpu: app.cpu[0] + app.cpu[1] * users, mem: app.mem[0] + app.mem[1] * users });

  // 一个 Pod 在一天里的最高用量（假设 running 个副本平分流量）
  function peakPerPod(app, running) {
    let best = { cpu: 0, mem: 0 };
    for (let i = 0; i < STEPS; i++) {
      const u = podUsage(app, usersAt(app, i / STEPS) / Math.max(1, running));
      best = { cpu: Math.max(best.cpu, u.cpu), mem: Math.max(best.mem, u.mem) };
    }
    return best;
  }

  // 默认配置：副本数 2，request / limit 给一个"看起来差不多"的值，玩家需要自己调
  function defaultPlan(level) {
    const apps = {};
    for (const a of level.apps) apps[a.id] = { replicas: a.start?.replicas ?? 2, req: { ...(a.start?.req || { cpu: 500, mem: 512 }) }, lim: { ...(a.start?.lim || { cpu: 1000, mem: 1024 }) } };
    return { apps, nodes: (level.startNodes || []).map((type) => ({ type, pods: [] })) };
  }

  // 节点上按 request 已经占了多少
  function reserved(level, plan, node) {
    const r = { cpu: 0, mem: 0 };
    for (const id of node.pods) {
      r.cpu += plan.apps[id].req.cpu;
      r.mem += plan.apps[id].req.mem;
    }
    return r;
  }

  // 能不能把一个 app 的 Pod 放上这个节点：和 kube-scheduler 的 NodeResourcesFit 一样只看 request
  function canPlace(level, plan, node, appId) {
    const type = NODE_TYPES[node.type];
    const r = reserved(level, plan, node);
    const q = plan.apps[appId].req;
    const lack = [];
    if (r.cpu + q.cpu > type.cpu) lack.push({ res: 'cpu', free: type.cpu - r.cpu, need: q.cpu });
    if (r.mem + q.mem > type.mem) lack.push({ res: 'mem', free: type.mem - r.mem, need: q.mem });
    return { ok: lack.length === 0, lack };
  }

  const cost = (plan) => plan.nodes.reduce((s, n) => s + NODE_TYPES[n.type].price, 0);

  // 跑完整的一天。返回每一步每个节点的使用率、事件，以及星级
  function simulate(level, plan) {
    const running = {};
    for (const a of level.apps) running[a.id] = 0;
    for (const n of plan.nodes) for (const id of n.pods) running[id]++;
    const placed = Object.values(running).reduce((s, v) => s + v, 0);
    const total = level.apps.reduce((s, a) => s + plan.apps[a.id].replicas, 0);

    const nodes = plan.nodes.map((n) => ({ type: n.type, cpu: [], mem: [], peakCpu: 0, peakMem: 0, overload: false }));
    const events = [];
    const seen = new Set();
    const flag = (step, kind, key, data) => {
      if (seen.has(kind + key)) return;
      seen.add(kind + key);
      events.push({ step, kind, ...data });
    };
    const podPeak = {}; // 每个 app 单个 Pod 的最高用量（想要的，不受 limit 限制）

    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS;
      const per = {};
      for (const a of level.apps) {
        if (!running[a.id]) continue;
        const want = podUsage(a, usersAt(a, t) / running[a.id]);
        const cfg = plan.apps[a.id];
        const pp = podPeak[a.id] || { cpu: 0, mem: 0 };
        podPeak[a.id] = { cpu: Math.max(pp.cpu, want.cpu), mem: Math.max(pp.mem, want.mem) };
        if (want.mem > cfg.lim.mem) flag(i, 'oom', a.id, { app: a.id });
        else if (want.mem > cfg.req.mem) flag(i, 'overReq', a.id, { app: a.id });
        if (want.cpu > cfg.lim.cpu) flag(i, 'throttle', a.id, { app: a.id });
        // 节流后实际拿到的 CPU 不超过 limit；OOMKilled 的容器在重启，这一刻按 limit 计内存
        per[a.id] = { cpu: Math.min(want.cpu, cfg.lim.cpu), mem: Math.min(want.mem, cfg.lim.mem) };
      }
      plan.nodes.forEach((n, k) => {
        const type = NODE_TYPES[n.type];
        let cpu = 0;
        let mem = 0;
        for (const id of n.pods) {
          cpu += per[id].cpu;
          mem += per[id].mem;
        }
        const st = nodes[k];
        st.cpu.push(cpu / type.cpu);
        st.mem.push(mem / type.mem);
        st.peakCpu = Math.max(st.peakCpu, cpu / type.cpu);
        st.peakMem = Math.max(st.peakMem, mem / type.mem);
        if (cpu > type.cpu || mem > type.mem) {
          st.overload = true;
          flag(i, 'overload', 'n' + k, { node: k });
        }
      });
    }

    const inBand = (x) => x >= BAND[0] - 1e-9 && x <= BAND[1] + 1e-9;
    // ★：全部装船，而且一天里没有任何事故（OOMKilled、节流、内存超 request、超载）
    const safe = placed === total && placed > 0 && events.length === 0;
    const full = plan.nodes.length > 0 && nodes.every((n) => inBand(n.peakCpu) && inBand(n.peakMem));
    const spend = cost(plan);
    const cheap = spend <= level.budget;
    const stars = safe ? (full ? (cheap ? 3 : 2) : 1) : 0;
    return { nodes, events, podPeak, placed, total, spend, safe, full, cheap, stars };
  }

  const API = { STEPS, SNAP, BAND, MAX_REPLICAS, CURVES, NODE_TYPES, LEVELS, traffic, usersAt, podUsage, peakPerPod, snapUp, defaultPlan, reserved, canPlace, cost, simulate };
  root.KGStowage = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
