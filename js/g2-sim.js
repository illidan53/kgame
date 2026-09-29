/* 小游戏 2 的模拟内核（纯逻辑，无 DOM，可在 Node 中测试）
 * 内存：cgroup limit → OOMKilled；节点内存耗尽 → 内核 OOM Killer（按 oom_score）；
 *       节点可用内存低于驱逐阈值 → kubelet 按 QoS / requests 驱逐 Pod。
 * CPU：超过 limit → CFS 节流；节点争抢 → 按 requests（cpu.shares/weight）比例分配。
 */
(function (root) {
  'use strict';
  const DAY = 1440;
  const DT = 5; // 每步 5 分钟

  const bell = (t, c, w) => Math.exp(-0.5 * ((t - c) / w) ** 2);
  const wob = (t, seed, amp) => amp * (0.6 * Math.sin(t / 37 + seed) + 0.4 * Math.sin(t / 11 + seed * 2.3));

  // ---------------------------------------------------------------- 关卡
  const LEVELS = [
    {
      id: 'm1',
      kind: 'memory',
      title: '第一次 OOMKilled',
      intro:
        '<b>web</b> 平时用 300Mi 左右内存，午高峰会涨到 550Mi 以上。现在它的配置是 request 256Mi / limit 384Mi，先直接点"开始模拟"，看看一天里会发生什么，然后调整滑块修好它。<br>图表里的灰色虚线是"昨天的监控"，设置 request / limit 时就参考它。',
      node: { capacity: 4096, systemReserved: 512, evictionThreshold: 256 },
      pods: [
        {
          name: 'web',
          critical: true,
          color: '#60a5fa',
          desc: '在线服务：平时 ~300Mi，13:00 左右午高峰',
          max: 1536,
          preset: { req: 256, lim: 384 },
          profile: (t) => 260 + 290 * bell(t, 780, 90) + 90 * bell(t, 1230, 60) + wob(t, 1, 18),
        },
      ],
      goals: [
        { text: 'web 全天没有被 OOMKilled', check: (R) => R.web.kills === 0 && !R.web.pending },
        {
          text: 'request 介于平均用量和峰值之间（按真实需求预留）',
          check: (R, C, L) => C.web.effReq >= L.stats.web.avg && C.web.effReq <= L.stats.web.peak,
          note: (R, C, L) => `平均 ${L.stats.web.avg}Mi，峰值 ${L.stats.web.peak}Mi；你的 request 是 ${C.web.effReq}Mi`,
        },
        { text: 'limit 设置了且不超过 1Gi（不给无限膨胀的机会）', check: (R, C) => C.web.lim > 0 && C.web.lim <= 1024 },
      ],
      tip: {
        title: 'request 与 limit 各管什么',
        html:
          '<b>request</b> 是给调度器看的"预订量"：决定 Pod 能不能被放到节点上，也影响节点紧张时谁先被驱逐。它<i>不会</i>限制容器实际使用。<br><b>limit</b> 是写进 cgroup 的硬上限（memory.max）。内存超过 limit 时，内核直接杀掉容器进程，状态变成 <code>OOMKilled</code>（exit code 137），kubelet 按指数退避重启，反复崩溃就是 <code>CrashLoopBackOff</code>。<br>经验做法：request ≈ 常态用量（例如 P50～P90），limit ≈ 峰值 + 余量。',
      },
    },
    {
      id: 'm2',
      kind: 'memory',
      title: '谁先被驱逐？',
      intro:
        '三个 Pod 挤在一台节点上。<b>api</b> 中午有流量高峰，<b>report</b> 是 09:00–18:00 的报表任务，内存会越跑越大。现在三个都没设 request / limit（BestEffort）。<br>节点内存不够时 kubelet 要驱逐一个 Pod。先跑一次看它选了谁，再想办法让关键服务活下来。',
      node: { capacity: 3072, systemReserved: 512, evictionThreshold: 256 },
      pods: [
        {
          name: 'api',
          critical: true,
          color: '#60a5fa',
          desc: '关键服务：平时 ~500Mi，12:30 高峰 ~1.1Gi',
          max: 2048,
          preset: { req: 0, lim: 0 },
          profile: (t) => 480 + 600 * bell(t, 750, 70) + wob(t, 2, 20),
        },
        {
          name: 'worker',
          critical: true,
          color: '#34d399',
          desc: '关键服务：~350Mi，19:00 左右 ~550Mi',
          max: 2048,
          preset: { req: 0, lim: 0 },
          profile: (t) => 340 + 200 * bell(t, 1140, 90) + wob(t, 3, 15),
        },
        {
          name: 'report',
          critical: false,
          color: '#f59e0b',
          desc: '可牺牲的报表任务：09:00–18:00 运行，内存随时间增长到 ~1Gi',
          max: 2048,
          window: [540, 1080],
          preset: { req: 0, lim: 0 },
          profile: (t, age) => Math.min(1000, 180 + 4 * age) + wob(t, 8, 10),
        },
      ],
      goals: [
        { text: 'api 全天零中断（未被杀 / 驱逐）', check: (R) => R.api.down === 0 },
        { text: 'worker 全天零中断', check: (R) => R.worker.down === 0 },
        { text: '所有 Pod 都调度成功，且 requests 总和 ≤ 1920Mi（别浪费预留）', check: (R, C) => C._sumReq <= 1920 && !R.report.pending, note: (R, C) => `你的 requests 总和：${C._sumReq}Mi` },
      ],
      tip: {
        title: 'QoS 等级与驱逐顺序',
        html:
          'K8s 按 requests / limits 把 Pod 分成三个 <b>QoS 等级</b>：<br>• <b>Guaranteed</b>：request = limit（CPU、内存都要设）<br>• <b>Burstable</b>：设了 request，但 request &lt; limit 或没设 limit<br>• <b>BestEffort</b>：什么都没设<br>节点可用内存低于驱逐阈值（如 <code>memory.available&lt;100Mi</code>）时，kubelet 按顺序挑 Pod 驱逐：①用量是否<b>超过 request</b>，超过的优先；②Pod 优先级；③超出 request 的量，越多越优先。所以 BestEffort（request=0）最先挨刀，而用量没超过 request 的 Pod 基本安全。<br>被驱逐的 Pod 会被 ReplicaSet 在别处重建，但这一段时间服务是中断的。',
      },
    },
    {
      id: 'm3',
      kind: 'memory',
      title: '泄漏与内核 OOM',
      intro:
        '<b>leaky</b> 有内存泄漏（代码一时修不好），而且每 3 小时做一次全量缓存刷新，内存会瞬间多出 700Mi。节点内存被瞬间打满时，kubelet 来不及驱逐，<b>内核 OOM Killer</b> 会直接按 <code>oom_score</code> 挑进程杀掉。<br>目标：把损失限制在 leaky 自己身上，让 api 和 cache 不受牵连。',
      node: { capacity: 3072, systemReserved: 512, evictionThreshold: 256 },
      pods: [
        {
          name: 'api',
          critical: true,
          color: '#60a5fa',
          desc: '关键服务：稳定 ~620Mi',
          max: 2048,
          preset: { req: 0, lim: 0 },
          profile: (t) => 620 + wob(t, 4, 25),
        },
        {
          name: 'cache',
          critical: true,
          color: '#a78bfa',
          desc: '关键服务：稳定 ~720Mi',
          max: 2048,
          preset: { req: 512, lim: 0 },
          profile: (t) => 720 + wob(t, 5, 20),
        },
        {
          name: 'leaky',
          critical: false,
          color: '#f472b6',
          desc: '有泄漏：启动 ~260Mi，每小时 +144Mi；每 3 小时刷新一次缓存 +700Mi',
          max: 2048,
          historyUntil: 480,
          preset: { req: 1024, lim: 0 },
          profile: (t, age) => 260 + 2.4 * age + (t % 180 >= 150 && t % 180 < 160 ? 700 : 0) + wob(t, 6, 10),
        },
      ],
      goals: [
        { text: 'api 和 cache 全天零中断', check: (R) => R.api.down === 0 && R.cache.down === 0 },
        { text: 'leaky 可用率 ≥ 85%', check: (R) => R.leaky.avail >= 0.85, note: (R) => `leaky 可用率 ${(R.leaky.avail * 100).toFixed(1)}%` },
        { text: '全天没有节点级事件（驱逐 / 内核 OOM），问题都被 limit 挡在 leaky 容器内', check: (R) => R._nodeEvents === 0, note: (R) => `节点级事件 ${R._nodeEvents} 次` },
      ],
      tip: {
        title: '内核 OOM Killer 与 oom_score_adj',
        html:
          'kubelet 大约每 10 秒检查一次内存，突发的内存尖峰可能在它反应之前就把节点打满。这时由 <b>Linux 内核 OOM Killer</b> 出手：它给每个进程算 <code>oom_score ≈ 内存占比×1000 + oom_score_adj</code>，挑分数最高的杀。<br>kubelet 会按 QoS 设置 <code>oom_score_adj</code>：Guaranteed = <b>-997</b>，BestEffort = <b>1000</b>，Burstable = <code>1000 - 1000×request/节点内存</code>。所以<b>没设 request 的关键服务</b>，很可能替泄漏的邻居背锅。<br>给泄漏的容器设 <b>limit</b>，它就只会在自己的 cgroup 里被 OOMKilled 然后重启，不会拖累整台节点。',
      },
    },
    {
      id: 'c1',
      kind: 'cpu',
      title: 'CPU：节流而不是被杀',
      intro:
        'CPU 是<b>可压缩资源</b>：用超了不会被杀，只会变慢。<b>api</b> 对延迟很敏感，中午流量大；<b>batch</b> 是批处理任务，能吃多少 CPU 就吃多少。<br>调整 CPU request / limit：既要 api 的延迟达标（≤ 200ms），又要让 batch 尽量多干活。',
      node: { cpu: 3800 },
      pods: [
        {
          name: 'api',
          critical: true,
          color: '#60a5fa',
          desc: '延迟敏感：平时 ~0.4 核，13:00 高峰 ~2 核，每小时整点有短暂突发',
          max: 4000,
          preset: { req: 500, lim: 1000 },
          profile: (t) => 350 + 1500 * bell(t, 780, 100) + (t % 60 < 10 ? 450 : 0) + wob(t, 7, 30),
        },
        {
          name: 'batch',
          critical: false,
          color: '#f59e0b',
          desc: '批处理：全天都想要 4 核',
          max: 4000,
          preset: { req: 2000, lim: 0 },
          profile: () => 4000,
        },
      ],
      goals: [
        { text: 'api 延迟超过 200ms 的时长 ≤ 30 分钟', check: (R) => R.api.sloBad <= 30 && !R.api.pending, note: (R) => (R.api.pending ? 'api 没调度上（Pending）' : `超标 ${R.api.sloBad} 分钟`) },
        { text: 'batch 全天完成 ≥ 60 核·小时 的计算', check: (R) => R.batch.work >= 60, note: (R) => `完成 ${R.batch.work.toFixed(1)} 核·小时` },
        { text: 'api 从未被 CPU limit 节流', check: (R) => R.api.throttled === 0 && !R.api.pending, note: (R) => `被节流 ${R.api.throttled} 分钟` },
      ],
      tip: {
        title: 'CPU request = 权重，CPU limit = 配额',
        html:
          '<b>CPU request</b> 会变成 cgroup 的 <code>cpu.weight</code>（旧版叫 cpu.shares）。节点 CPU 紧张时，各容器<b>按 request 的比例</b>分 CPU；不紧张时谁都可以超过 request 用空闲 CPU。<br><b>CPU limit</b> 会变成 CFS 配额（<code>cpu.max</code>，每 100ms 周期最多跑多少）。用满配额就被<b>节流（throttled）</b>，要等下一个周期，<i>哪怕节点上还有空闲 CPU</i>。<br>所以 CPU 超了<b>不会 OOM</b>，只会变慢。延迟敏感的服务要谨慎设置 CPU limit，更重要的是给足 request。',
      },
    },
  ];

  // 预先算出每个 Pod 的"历史监控"曲线和统计（不受 limit 影响的自然用量）
  for (const L of LEVELS) {
    L.stats = {};
    for (const p of L.pods) {
      const pts = [];
      let sum = 0;
      let n = 0;
      let peak = 0;
      for (let t = 0; t < DAY; t += DT) {
        const inWin = !p.window || (t >= p.window[0] && t < p.window[1]);
        if (!inWin) {
          pts.push([t, null]);
          continue;
        }
        const age = p.window ? t - p.window[0] : t;
        const v = Math.max(0, p.profile(t, age));
        pts.push([t, v]);
        sum += v;
        n++;
        peak = Math.max(peak, v);
      }
      L.stats[p.name] = { pts, avg: Math.round(sum / Math.max(1, n)), peak: Math.round(peak) };
    }
  }

  // ---------------------------------------------------------------- 公共
  function qosOf(req, lim) {
    if (!req && !lim) return 'BestEffort';
    const r = req || lim;
    return lim && r === lim ? 'Guaranteed' : 'Burstable';
  }
  // 只设 limit 不设 request 时，request 默认等于 limit
  const effReq = (c) => c.req || c.lim || 0;

  function normConfig(level, cfg) {
    const C = {};
    let sumReq = 0;
    level.pods.forEach((p, i) => {
      const c = cfg[i];
      C[p.name] = { req: c.req, lim: c.lim, effReq: effReq(c), qos: qosOf(c.req, c.lim) };
      sumReq += effReq(c);
    });
    C._sumReq = sumReq;
    return C;
  }

  function schedule(level, pods, alloc) {
    let sum = 0;
    for (const p of pods) {
      if (sum + p.req > alloc) {
        p.pending = true;
        p.status = 'Pending';
      } else sum += p.req;
    }
    return sum;
  }

  // ---------------------------------------------------------------- 内存模拟
  function createMemSim(level, cfg) {
    const nd = level.node;
    const alloc = nd.capacity - nd.systemReserved - nd.evictionThreshold;
    const kernelLimit = nd.capacity - nd.systemReserved;
    const pods = level.pods.map((def, i) => ({
      def,
      name: def.name,
      req: effReq(cfg[i]),
      lim: cfg[i].lim || 0,
      qos: qosOf(cfg[i].req, cfg[i].lim),
      status: def.window ? 'Waiting' : 'Running',
      pending: false,
      age: 0,
      until: 0,
      restarts: 0,
      backoff: 0,
      usage: 0,
      hist: [],
      marks: [],
      down: 0,
      active: 0,
      kills: 0,
      oom: 0,
      kernel: 0,
      evicted: 0,
      blockedNoted: false,
    }));
    const S = { t: 0, pods, alloc, kernelLimit, capacity: nd.capacity, pressureUntil: -1, events: [], nodeHist: [], done: false, nodeEvents: 0, kind: 'memory' };
    schedule(level, pods, alloc);
    for (const p of pods) {
      if (p.pending) S.events.push({ t: 0, type: 'Warning', reason: 'FailedScheduling', obj: 'pod/' + p.name, msg: `0/1 nodes are available: 1 Insufficient memory.（requests 总和超过 allocatable ${alloc}Mi）` });
    }
    S.step = () => stepMem(S);
    return S;
  }

  function oomScore(p, S) {
    let adj;
    if (p.qos === 'Guaranteed') adj = -997;
    else if (p.qos === 'BestEffort') adj = 1000;
    else adj = Math.min(999, Math.max(2, Math.round(1000 - (1000 * p.req) / S.capacity)));
    return Math.round((p.usage / S.capacity) * 1000) + adj;
  }

  function killContainer(p, t) {
    p.status = 'Restarting';
    p.restarts++;
    p.kills++;
    const delay = 10 * Math.pow(2, Math.min(p.backoff, 4)); // 10,20,40,80,160 分钟（模拟时间，已放大）
    p.backoff++;
    p.until = t + delay;
    p.usage = 0;
    return delay;
  }

  function stepMem(S) {
    if (S.t >= DAY) {
      S.done = true;
      return;
    }
    const t = S.t;
    const ev = (type, reason, obj, msg) => S.events.push({ t, type, reason, obj, msg });
    const pressure = t < S.pressureUntil;

    // 1. 状态推进：窗口开始/结束、重启、重建
    for (const p of S.pods) {
      if (p.pending) continue;
      const w = p.def.window;
      const inWin = !w || (t >= w[0] && t < w[1]);
      if (!inWin) {
        if (w && t >= w[1] && p.status !== 'Completed') {
          p.status = 'Completed';
          ev('Normal', 'Completed', 'pod/' + p.name, '任务窗口结束，Pod 正常退出');
        }
        p.usage = 0;
        continue;
      }
      if (p.status === 'Waiting') {
        p.status = 'Running';
        p.age = 0;
        ev('Normal', 'Started', 'pod/' + p.name, '任务开始运行');
      }
      if ((p.status === 'Restarting' || p.status === 'Evicted') && t >= p.until) {
        if (p.status === 'Evicted' && p.qos === 'BestEffort' && pressure) {
          if (!p.blockedNoted) {
            ev('Warning', 'FailedScheduling', 'pod/' + p.name, "0/1 nodes are available: 1 node(s) had untolerated taint {node.kubernetes.io/memory-pressure: }（节点处于 MemoryPressure，BestEffort Pod 暂时进不来）");
            p.blockedNoted = true;
          }
        } else {
          if (p.status === 'Evicted') ev('Normal', 'Scheduled', 'pod/' + p.name, 'ReplicaSet 重建的新 Pod 已调度并启动');
          else ev('Normal', 'Started', 'pod/' + p.name, `容器重启（第 ${p.restarts} 次）`);
          p.status = 'Running';
          p.age = 0;
          p.blockedNoted = false;
        }
      }
    }

    const running = () => S.pods.filter((p) => p.status === 'Running');

    // 2. 计算用量 + cgroup limit
    for (const p of running()) {
      p.usage = Math.max(0, p.def.profile(t, p.age));
      if (p.lim && p.usage > p.lim) {
        const used = p.usage;
        p.oom++;
        const d = killContainer(p, t);
        p.marks.push({ t, v: used, kind: 'oom' });
        ev('Warning', 'OOMKilled', 'pod/' + p.name, `内存 ${Math.round(used)}Mi 超过 limit ${p.lim}Mi，容器被 cgroup OOM 杀死（exit 137），${p.restarts >= 2 ? 'CrashLoopBackOff，' : ''}${d} 分钟后重启`);
      }
    }

    // 3. 节点内存被打满 → 内核 OOM Killer
    const total = () => running().reduce((s, p) => s + p.usage, 0);
    let guard = 0;
    while (total() > S.kernelLimit && guard++ < 10) {
      const rs = running();
      let victim = rs[0];
      let best = -Infinity;
      for (const p of rs) {
        const sc = oomScore(p, S);
        if (sc > best) {
          best = sc;
          victim = p;
        }
      }
      const used = victim.usage;
      victim.kernel++;
      S.nodeEvents++;
      killContainer(victim, t);
      victim.marks.push({ t, v: used, kind: 'kernel' });
      ev('Warning', 'SystemOOM', 'node/node-1', `节点内存耗尽（${Math.round(total() + used)}Mi > ${S.kernelLimit}Mi），内核 OOM Killer 选中 ${victim.name}（oom_score=${best}，QoS=${victim.qos}）`);
    }

    // 4. kubelet 驱逐（每个周期最多驱逐一个）
    const tot = total();
    if (tot > S.alloc) {
      if (!pressure) ev('Warning', 'MemoryPressure', 'node/node-1', `可用内存低于驱逐阈值：Pod 用量 ${Math.round(tot)}Mi > ${S.alloc}Mi`);
      S.pressureUntil = t + 30;
      const rs = running();
      rs.sort((a, b) => {
        const ea = a.usage > a.req ? 1 : 0;
        const eb = b.usage > b.req ? 1 : 0;
        if (ea !== eb) return eb - ea;
        return b.usage - b.req - (a.usage - a.req);
      });
      const v = rs[0];
      if (v) {
        const used = v.usage;
        v.evicted++;
        S.nodeEvents++;
        v.status = 'Evicted';
        v.until = t + 60;
        v.usage = 0;
        v.restarts = 0;
        v.backoff = 0;
        v.marks.push({ t, v: used, kind: 'evict' });
        ev('Warning', 'Evicted', 'pod/' + v.name, `The node was low on resource: memory. Container ${v.name} was using ${Math.round(used)}Mi, request is ${v.req}Mi（QoS=${v.qos}）`);
      }
    }

    // 5. 记录
    for (const p of S.pods) {
      const w = p.def.window;
      const inWin = !w || (t >= w[0] && t < w[1]);
      if (inWin) {
        p.active += DT;
        if (p.status !== 'Running') p.down += DT;
      }
      if (p.status === 'Running') p.age += DT;
      if (p.status === 'Running' && p.age >= 60) p.backoff = 0;
      p.hist.push({ t, v: p.status === 'Running' ? p.usage : null, s: p.status });
    }
    S.nodeHist.push({ t, v: total(), pressure: t < S.pressureUntil });
    S.t += DT;
    if (S.t >= DAY) S.done = true;
  }

  // ---------------------------------------------------------------- CPU 模拟
  function waterfill(total, demands, weights) {
    const got = demands.map(() => 0);
    let remaining = total;
    let active = demands.map((d, i) => i).filter((i) => demands[i] > 0);
    while (active.length && remaining > 1e-6) {
      const W = active.reduce((s, i) => s + weights[i], 0);
      const sat = active.filter((i) => demands[i] - got[i] <= (remaining * weights[i]) / W);
      if (!sat.length) {
        for (const i of active) got[i] += (remaining * weights[i]) / W;
        remaining = 0;
        break;
      }
      for (const i of sat) {
        remaining -= demands[i] - got[i];
        got[i] = demands[i];
      }
      active = active.filter((i) => !sat.includes(i));
    }
    return got;
  }

  function createCpuSim(level, cfg) {
    const alloc = level.node.cpu;
    const pods = level.pods.map((def, i) => ({
      def,
      name: def.name,
      req: effReq(cfg[i]),
      lim: cfg[i].lim || 0,
      qos: qosOf(cfg[i].req, cfg[i].lim),
      status: 'Running',
      pending: false,
      hist: [],
      marks: [],
      work: 0,
      throttled: 0,
      sloBad: 0,
      down: 0,
      lat: 0,
      usage: 0,
      demand: 0,
    }));
    const S = { t: 0, pods, alloc, events: [], nodeHist: [], done: false, kind: 'cpu' };
    schedule(level, pods, alloc);
    for (const p of pods) {
      if (p.pending) S.events.push({ t: 0, type: 'Warning', reason: 'FailedScheduling', obj: 'pod/' + p.name, msg: `0/1 nodes are available: 1 Insufficient cpu.（requests 总和超过 ${alloc}m）` });
    }
    S.step = () => stepCpu(S);
    return S;
  }

  function stepCpu(S) {
    if (S.t >= DAY) {
      S.done = true;
      return;
    }
    const t = S.t;
    const rs = S.pods.filter((p) => !p.pending);
    const demand = rs.map((p) => Math.max(0, p.def.profile(t)));
    const capped = rs.map((p, i) => (p.lim ? Math.min(demand[i], p.lim) : demand[i]));
    const weights = rs.map((p) => Math.max(p.req, 2)); // BestEffort 的 cpu.shares 最小为 2
    const got = waterfill(S.alloc, capped, weights);
    let total = 0;
    rs.forEach((p, i) => {
      const d = demand[i];
      const g = got[i];
      const thr = !!p.lim && d > p.lim + 1e-6;
      p.demand = d;
      p.usage = g;
      p.work += (g * DT) / 60 / 1000; // 核·小时
      const r = g > 0 ? d / g : 99;
      p.lat = r <= 1.001 ? 40 : Math.min(5000, 40 * r * r * r);
      if (thr) {
        p.throttled += DT;
        if (!p.wasThrottled) S.events.push({ t, type: 'Warning', reason: 'CPUThrottling', obj: 'pod/' + p.name, msg: `需求 ${Math.round(d)}m 超过 limit ${p.lim}m，被 CFS 配额节流（节点空闲 CPU 也用不了）` });
      }
      p.wasThrottled = thr;
      const bad = p.def.critical && p.lat > 200;
      if (bad) {
        p.sloBad += DT;
        if (!p.wasBad) S.events.push({ t, type: 'Warning', reason: 'HighLatency', obj: 'pod/' + p.name, msg: `延迟 ${Math.round(p.lat)}ms > 200ms：需要 ${Math.round(d)}m，只拿到 ${Math.round(g)}m${thr ? '（被 limit 节流）' : '（节点 CPU 争抢，按 request 比例分配）'}` });
      }
      p.wasBad = bad;
      total += g;
      p.hist.push({ t, v: g, d, lat: p.lat, thr });
    });
    for (const p of S.pods) if (p.pending) p.hist.push({ t, v: null });
    S.nodeHist.push({ t, v: total });
    S.t += DT;
    if (S.t >= DAY) S.done = true;
  }

  // ---------------------------------------------------------------- 结果
  function summarize(level, S, cfg) {
    const R = {};
    for (const p of S.pods) {
      R[p.name] = {
        pending: p.pending,
        down: p.pending ? DAY : p.down,
        avail: p.pending ? 0 : p.active ? 1 - p.down / p.active : 1,
        kills: (p.oom || 0) + (p.kernel || 0) + (p.evicted || 0),
        oom: p.oom || 0,
        kernel: p.kernel || 0,
        evicted: p.evicted || 0,
        work: p.work || 0,
        throttled: p.throttled || 0,
        sloBad: p.pending ? DAY : p.sloBad || 0,
      };
    }
    R._nodeEvents = S.nodeEvents || 0;
    const C = normConfig(level, cfg);
    const results = level.goals.map((g) => !!g.check(R, C, level));
    const stars = results[0] ? 1 + (results[1] ? 1 : 0) + (results[2] ? 1 : 0) : 0;
    return { R, C, results, stars };
  }

  function createSim(level, cfg) {
    return level.kind === 'cpu' ? createCpuSim(level, cfg) : createMemSim(level, cfg);
  }
  function runAll(level, cfg) {
    const S = createSim(level, cfg);
    while (!S.done) S.step();
    return { S, ...summarize(level, S, cfg) };
  }

  const API = { LEVELS, DAY, DT, qosOf, effReq, createSim, summarize, runAll, normConfig, waterfill };
  root.KGSim = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
