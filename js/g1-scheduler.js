/* 小游戏 1：调度大师 —— 你是 kube-scheduler，把 Pod 按 requests 装进节点 */
(function () {
  'use strict';
  const { h, fmtMem, fmtCpu } = KG;
  const GAME = 'scheduler';

  const COLORS = {
    api: '#60a5fa',
    web: '#34d399',
    etl: '#f59e0b',
    ml: '#f472b6',
    train: '#f472b6',
    cache: '#a78bfa',
    db: '#fb923c',
    postgres: '#fb923c',
    metrics: '#22d3ee',
    worker: '#facc15',
    'log-agent': '#94a3b8',
  };
  const colorOf = (app) => COLORS[app] || '#94a3b8';

  function mkNode(name, extra) {
    return Object.assign(
      { name, cap: { cpu: 4000, mem: 8192 }, reserved: { cpu: 500, mem: 1024 }, labels: {}, taints: [], ready: true, pods: [] },
      extra
    );
  }
  let podSeq = 0;
  function mkPod(name, app, cpu, mem, extra) {
    return Object.assign({ id: ++podSeq, name, app, cpu, mem, tolerations: [], nodeSelector: {} }, extra);
  }
  const GPU_TOL = [{ key: 'nvidia.com/gpu', operator: 'Exists', effect: 'NoSchedule' }];
  const daemon = (n) => mkPod('log-agent-' + n, 'log-agent', 200, 256, { fixed: true, daemon: true, tolerations: [{ operator: 'Exists' }] });

  const LEVELS = [
    {
      id: 'l1',
      title: 'requests 占座',
      intro:
        '每台节点 4 核 / 8Gi（<b>capacity</b>），其中 500m CPU、1Gi 内存预留给系统进程、kubelet 和驱逐阈值，真正能分给 Pod 的是 <b>allocatable</b>（3500m / 7Gi，条形图右侧斜线部分是预留）。<br>你现在是 <b>kube-scheduler</b>：先点左侧一个 Pending 的 Pod，再点节点把它调度上去；点节点里的 Pod 可以撤回。调度器只看 Pod 的 <b>requests</b> 放不放得下，和它实际用了多少无关。',
      nodes: () => [mkNode('node-1'), mkNode('node-2')],
      pods: () => [
        mkPod('api-1', 'api', 1000, 1024),
        mkPod('api-2', 'api', 1000, 512),
        mkPod('web-1', 'web', 1500, 2048),
        mkPod('web-2', 'web', 1500, 1024),
        mkPod('etl-1', 'etl', 2000, 2048),
      ],
      tip: {
        title: 'requests 就是"占座"',
        html:
          'Pod 绑定到节点后，它的 requests 会从节点的 allocatable 中扣掉。哪怕容器实际只用了一点点，这部分资源也不会再分给别人。<br>放不下时 Pod 会一直 <code>Pending</code>，<code>kubectl describe pod</code> 能看到类似 <code>0/2 nodes are available: 2 Insufficient cpu.</code> 的事件。<br><code>kubectl describe node</code> 里的 Capacity / Allocatable / Allocated resources 就是这里的三个量。',
      },
      autoNote:
        '默认调度器一次只看一个 Pod，并用 <b>LeastAllocated</b> 打分：优先选最空的节点，让负载分散。它不知道后面还有一个 2000m 的 etl-1，于是把 CPU 摊得很均匀，结果两台节点各剩 1000m，谁都放不下 2000m。<br>真实集群里，这种碎片通常靠<b>抢占（PriorityClass）</b>、<b>Descheduler</b> 或者改成 <b>MostAllocated</b>（尽量装满）打分策略来缓解。',
    },
    {
      id: 'l2',
      title: '两个维度',
      intro:
        '资源不止一种。CPU 大户（ml-train）和内存大户（cache、db）混在一起时，很容易出现某台节点 CPU 满了、内存却还剩很多的情况。这些剩下的内存谁也用不上，叫<b>资源搁浅（stranded resources）</b>。把 8 个 Pod 全部调度上去。',
      nodes: () => [mkNode('node-1'), mkNode('node-2'), mkNode('node-3')],
      pods: () => [
        mkPod('api-1', 'api', 1000, 1024),
        mkPod('api-2', 'api', 1000, 1024),
        mkPod('api-3', 'api', 1000, 1024),
        mkPod('api-4', 'api', 1000, 1024),
        mkPod('ml-train', 'ml', 2500, 2048),
        mkPod('cache-1', 'cache', 500, 4096),
        mkPod('cache-2', 'cache', 500, 4096),
        mkPod('db', 'db', 1000, 3072),
      ],
      tip: {
        title: '多维装箱',
        html:
          '调度器的 <b>NodeResourcesFit</b> 插件会逐项检查 cpu、memory（以及 ephemeral-storage、GPU 等扩展资源），任何一项不够都不行。<br>装得好的关键是把"CPU 重"和"内存重"的 Pod 搭到同一台节点上，让两个维度同时接近用满。',
      },
      autoNote:
        'LeastAllocated 按 CPU、内存两项空闲比例的平均值打分，它把两个 cache 分到了不同节点。最后 db 要的 3Gi 内存在任何一台节点上都凑不齐，可整个集群明明还空着 7Gi 内存：这些内存都搁浅在 CPU 已经满了的节点上。',
    },
    {
      id: 'l3',
      title: '污点与容忍',
      intro:
        '有些节点比较特殊：<b>node-gpu</b> 带污点 <code>nvidia.com/gpu=true:NoSchedule</code>，不容忍它的 Pod 进不去；<b>node-ssd</b> 有标签 <code>disktype=ssd</code>，postgres 用 <code>nodeSelector</code> 指定只能去那里。每台节点上还跑着 DaemonSet 的 <b>log-agent</b>，它同样要占 requests。把所有 Pod 放下。',
      nodes: () => [
        mkNode('node-a', { labels: { zone: 'a' }, pods: [daemon('a')] }),
        mkNode('node-gpu', {
          labels: { accelerator: 'nvidia' },
          taints: [{ key: 'nvidia.com/gpu', value: 'true', effect: 'NoSchedule' }],
          pods: [daemon('gpu')],
        }),
        mkNode('node-ssd', { labels: { disktype: 'ssd' }, pods: [daemon('ssd')] }),
      ],
      pods: () => [
        mkPod('web-1', 'web', 1000, 1024),
        mkPod('web-2', 'web', 1000, 1024),
        mkPod('metrics', 'metrics', 500, 1024, { tolerations: GPU_TOL }),
        mkPod('web-3', 'web', 1000, 1024),
        mkPod('postgres', 'postgres', 1500, 4096, { nodeSelector: { disktype: 'ssd' } }),
        mkPod('train', 'train', 3000, 4096, { tolerations: GPU_TOL, nodeSelector: { accelerator: 'nvidia' } }),
      ],
      tip: {
        title: '污点是排斥，容忍是通行证',
        html:
          '<b>Taint</b> 是节点对 Pod 的排斥，<b>Toleration</b> 是 Pod 的通行证。有通行证只代表<i>可以</i>进去，不代表<i>必须</i>去那里。要把 Pod 固定到某类节点，还得配合 <code>nodeSelector</code> / <code>nodeAffinity</code>。<br>DaemonSet 的 Pod 一般容忍所有污点，每台节点一个，规划容量时别忘了算上它们。<br>过滤顺序大致是：NodeUnschedulable → TaintToleration → NodeAffinity → NodeResourcesFit …，一台节点在第一个不满足的插件处就被淘汰。',
      },
      autoNote:
        'metrics 容忍了 GPU 污点。默认调度器看到 node-gpu 最空，就把它放了上去，结果 train 需要的 3000m 不够了。容忍只表示"允许"，调度器并不会因此偏向或避开这台节点。<br>实践中可以别给普通 Pod 加 GPU 容忍，或者用 nodeAffinity / 打分插件把它们推离 GPU 节点。',
    },
    {
      id: 'l4',
      title: '高峰时段',
      timed: true,
      duration: 90,
      maxExtra: 2,
      intro:
        'Pod 会源源不断地到来，每个 Pod 跑一会儿就完成并释放资源。Pending 超过 <b>15 秒</b>算一次调度失败，失败 3 次游戏结束。<br>快捷键：队首的 Pod 会自动选中，按 <kbd>1</kbd>–<kbd>5</kbd> 直接放到对应节点。实在放不下可以<b>扩容节点</b>（相当于 Cluster Autoscaler，新节点要几秒才能 Ready）。',
      nodes: () => [mkNode('node-1'), mkNode('node-2'), mkNode('node-3')],
      templates: [
        { app: 'api', cpu: 500, mem: 512, w: 3 },
        { app: 'web', cpu: 1000, mem: 1024, w: 3 },
        { app: 'worker', cpu: 1500, mem: 2048, w: 2 },
        { app: 'cache', cpu: 500, mem: 3072, w: 2 },
        { app: 'ml', cpu: 2500, mem: 2048, w: 1 },
      ],
      tip: {
        title: 'Cluster Autoscaler 怎么工作',
        html:
          'Cluster Autoscaler 的触发条件就是：有 Pod 因为资源不足而 Pending。它会模拟"加一台这种规格的节点能不能放下"，能的话就调云厂商 API 扩容。<br>新节点 Ready 之前带有 <code>node.kubernetes.io/not-ready</code> 污点，调度器不会往上放 Pod。反过来，节点长期很空时 CA 会把上面的 Pod 挪走并缩容。',
      },
    },
  ];

  // ------------------------------------------------------------ 调度逻辑
  const allocOf = (n) => ({ cpu: n.cap.cpu - n.reserved.cpu, mem: n.cap.mem - n.reserved.mem });
  function usedOf(n) {
    let cpu = 0;
    let mem = 0;
    for (const p of n.pods) {
      cpu += p.cpu;
      mem += p.mem;
    }
    return { cpu, mem };
  }
  function freeOf(n) {
    const a = allocOf(n);
    const u = usedOf(n);
    return { cpu: a.cpu - u.cpu, mem: a.mem - u.mem };
  }
  function tolerates(p, taint) {
    return p.tolerations.some(
      (t) =>
        (t.key == null ? t.operator === 'Exists' : t.key === taint.key) &&
        (t.operator === 'Exists' || t.value === taint.value) &&
        (!t.effect || t.effect === taint.effect)
    );
  }
  // 返回 null 表示可以调度；否则返回失败原因（与真实调度器的措辞一致）
  function filterNode(n, p) {
    if (!n.ready) return ['node(s) had untolerated taint {node.kubernetes.io/not-ready: }'];
    for (const t of n.taints) {
      if (t.effect === 'NoSchedule' && !tolerates(p, t)) return [`node(s) had untolerated taint {${t.key}: ${t.value}}`];
    }
    for (const k in p.nodeSelector) {
      if (n.labels[k] !== p.nodeSelector[k]) return ["node(s) didn't match Pod's node affinity/selector"];
    }
    const f = freeOf(n);
    const r = [];
    if (p.cpu > f.cpu) r.push('Insufficient cpu');
    if (p.mem > f.mem) r.push('Insufficient memory');
    return r.length ? r : null;
  }
  function failMessage(nodes, p) {
    const counts = {};
    for (const n of nodes) {
      const r = filterNode(n, p);
      if (r) for (const x of r) counts[x] = (counts[x] || 0) + 1;
    }
    const parts = Object.keys(counts)
      .sort()
      .map((k) => `${counts[k]} ${k}`);
    return `0/${nodes.length} nodes are available: ${parts.join(', ')}.`;
  }
  // LeastAllocated：放上去之后剩余比例越高分越高
  function scoreNode(n, p) {
    const a = allocOf(n);
    const f = freeOf(n);
    return (((f.cpu - p.cpu) / a.cpu + (f.mem - p.mem) / a.mem) / 2) * 100;
  }

  // ------------------------------------------------------------ 界面
  function resBar(n, kind, preview) {
    const cap = n.cap[kind];
    const a = allocOf(n)[kind];
    const used = usedOf(n)[kind];
    const fmt = kind === 'cpu' ? fmtCpu : fmtMem;
    const segs = n.pods.map((p) =>
      h('div', { class: 'seg', style: { width: (p[kind] / cap) * 100 + '%', background: colorOf(p.app) }, title: `${p.name}: ${fmt(p[kind])}` })
    );
    if (preview) {
      segs.push(
        h('div', {
          class: 'seg ghost ' + (!preview.blocked && used + preview.pod[kind] <= a ? 'ok' : 'bad'),
          style: { width: (preview.pod[kind] / cap) * 100 + '%' },
        })
      );
    }
    return h(
      'div',
      { class: 'g1-res' },
      h('div', { class: 'g1-res-label' }, h('span', null, kind === 'cpu' ? 'CPU' : '内存'), h('span', { class: 'mono' }, `${fmt(used)} / ${fmt(a)}`)),
      h(
        'div',
        { class: 'rbar' },
        h('div', { class: 'rbar-fill' }, segs),
        h('div', { class: 'rbar-reserved', style: { width: (n.reserved[kind] / cap) * 100 + '%' }, title: `系统预留 ${fmt(n.reserved[kind])}` })
      )
    );
  }

  function podBadges(p) {
    const out = [];
    if (p.tolerations.length && !p.daemon) out.push(h('span', { class: 'mini-badge tol' }, '容忍 ' + (p.tolerations[0].key || '*')));
    for (const k in p.nodeSelector) out.push(h('span', { class: 'mini-badge sel' }, `nodeSelector ${k}=${p.nodeSelector[k]}`));
    return out;
  }

  function mount(body) {
    let sc = null;
    let idx = Math.min(KG.store.get('g1:last', 0), LEVELS.length - 1);
    function load(i) {
      if (sc) sc.dispose();
      sc = KG.scope();
      idx = i;
      KG.store.set('g1:last', i);
      KG.clear(body);
      playLevel(body, i, sc, load);
    }
    load(idx);
    return () => sc && sc.dispose();
  }

  function playLevel(body, li, sc, load) {
    const lv = LEVELS[li];
    let st;
    let alive = true;
    sc.add(() => (alive = false));

    const log = KG.eventLog('kubectl get events --watch');
    const boardEl = h('div', { class: 'g1-board' });
    const hudEl = h('div', { class: 'g1-hud' });
    const actionsEl = h('div', { class: 'row gap' });

    const goals = lv.timed
      ? ['坚持 90 秒，调度失败少于 3 次', '最多扩容 1 台节点', '不扩容，只靠原有 3 台节点']
      : null;

    function reset() {
      podSeq = 0;
      st = {
        nodes: lv.nodes(),
        queue: lv.timed ? [] : lv.pods(),
        selected: null,
        hover: null,
        moves: 0,
        auto: false,
        done: false,
        // 计时模式
        t: 0,
        nextSpawn: 1,
        running: false,
        strikes: 0,
        extra: 0,
        completed: 0,
        spawned: 0,
        rnd: KG.rng(42),
      };
      st.queue.forEach((p, i) => (p.order = i));
      if (!lv.timed) st.selected = st.queue[0] ? st.queue[0].id : null;
      log.clear();
      render();
    }

    const selPod = () => st.queue.find((p) => p.id === st.selected) || null;

    function place(ni, byAuto) {
      if (st.done || (st.auto && !byAuto)) return;
      if (lv.timed && !st.running) return;
      const p = selPod();
      if (!p) {
        KG.toast('先在左边选一个 Pending 的 Pod', 'info');
        return;
      }
      const n = st.nodes[ni];
      const why = filterNode(n, p);
      if (why) {
        log.add('Warning', 'FailedScheduling', 'pod/' + p.name, `节点 ${n.name} 不可用: ${why.join(', ')}`, stamp());
        KG.shake(boardEl.querySelector(`[data-node="${ni}"]`));
        return;
      }
      st.queue = st.queue.filter((q) => q !== p);
      if (lv.timed) p.remaining = p.runtime;
      n.pods.push(p);
      st.moves++;
      log.add('Normal', 'Scheduled', 'pod/' + p.name, `Successfully assigned default/${p.name} to ${n.name}`, stamp());
      st.selected = st.queue[0] ? st.queue[0].id : null;
      render();
      if (!lv.timed && !st.queue.length && !st.auto) finishStatic();
    }

    function unplace(ni, p) {
      if (st.done || st.auto || lv.timed || p.fixed) return;
      const n = st.nodes[ni];
      n.pods = n.pods.filter((q) => q !== p);
      st.queue.push(p);
      st.queue.sort((a, b) => a.order - b.order);
      st.selected = p.id;
      st.moves++;
      log.add('Normal', 'Killing', 'pod/' + p.name, `撤回：从 ${n.name} 上删除，重新回到调度队列`, stamp());
      render();
    }

    const stamp = () => (lv.timed ? st.t.toFixed(1) + 's' : null);

    function finishStatic() {
      st.done = true;
      const n = lv.pods().length;
      const g = [
        { text: '所有 Pod 调度成功', ok: true },
        { text: `总操作次数 ≤ ${n + 4}（调度 + 撤回）`, ok: st.moves <= n + 4, note: `你用了 ${st.moves} 次` },
        { text: '一次成功，没有撤回任何 Pod', ok: st.moves === n },
      ];
      const stars = 1 + (g[1].ok ? 1 : 0) + (g[2].ok ? 1 : 0);
      KG.showResult({
        game: GAME,
        level: lv.id,
        stars,
        goals: g,
        summary: '所有 Pod 都已 Running。',
        extra: h('div', { class: 'tip-inline', html: lv.autoNote ? '<b>想一想：</b>如果让默认调度器按队列顺序来放，结果会怎样？点"🤖 让默认调度器试试"看看。' : '' }),
        onRetry: reset,
        onNext: li + 1 < LEVELS.length ? () => load(li + 1) : null,
      });
      render();
    }

    async function autoRun() {
      reset();
      st.auto = true;
      render();
      log.add('Normal', 'Info', null, '默认调度器接管：按队列顺序逐个 Filter + Score(LeastAllocated)', null);
      const order = st.queue.slice();
      let failed = 0;
      for (const p of order) {
        await KG.sleep(550);
        if (!alive) return;
        st.selected = p.id;
        render();
        await KG.sleep(450);
        if (!alive) return;
        const cands = st.nodes.map((n, i) => ({ i, r: filterNode(n, p) })).filter((c) => !c.r);
        if (!cands.length) {
          failed++;
          p.failed = true;
          log.add('Warning', 'FailedScheduling', 'pod/' + p.name, failMessage(st.nodes, p), null);
          render();
          continue;
        }
        let best = cands[0];
        let bestScore = -Infinity;
        for (const c of cands) {
          const s = scoreNode(st.nodes[c.i], p);
          if (s > bestScore + 1e-9) {
            bestScore = s;
            best = c;
          }
        }
        place(best.i, true);
      }
      st.auto = false;
      st.done = true;
      render();
      KG.modal({
        title: failed ? `默认调度器：${failed} 个 Pod 调度失败` : '默认调度器完成了',
        body: h('div', { class: 'prose', html: failed ? lv.autoNote : '这一关默认调度器也能搞定。' }),
        actions: [{ label: '我自己来', primary: true, onClick: reset }],
      });
    }

    // ---------------- 计时模式
    function spawn() {
      const tpl = lv.templates;
      const total = tpl.reduce((s, x) => s + x.w, 0);
      let r = st.rnd() * total;
      let t = tpl[0];
      for (const x of tpl) {
        r -= x.w;
        if (r < 0) {
          t = x;
          break;
        }
      }
      st.spawned++;
      const p = mkPod(`${t.app}-${st.spawned}`, t.app, t.cpu, t.mem, { waited: 0, runtime: Math.round(14 + st.rnd() * 11) });
      p.order = st.spawned;
      st.queue.push(p);
      if (!st.selected) st.selected = p.id;
    }
    function tick() {
      if (!st.running || st.done) return;
      const dt = 0.1;
      st.t += dt;
      // 到达
      st.nextSpawn -= dt;
      if (st.nextSpawn <= 0) {
        spawn();
        const k = Math.min(1, st.t / lv.duration);
        st.nextSpawn = 2.5 - 1.3 * k;
      }
      // 运行完成
      for (const n of st.nodes) {
        if (!n.ready) {
          n.provision -= dt;
          if (n.provision <= 0) {
            n.ready = true;
            log.add('Normal', 'NodeReady', 'node/' + n.name, `Node ${n.name} status is now: NodeReady`, stamp());
          }
        }
        n.pods = n.pods.filter((p) => {
          p.remaining -= dt;
          if (p.remaining <= 0) {
            st.completed++;
            log.add('Normal', 'Completed', 'pod/' + p.name, `任务完成，释放 ${fmtCpu(p.cpu)} / ${fmtMem(p.mem)}`, stamp());
            return false;
          }
          return true;
        });
      }
      // 等待超时
      st.queue = st.queue.filter((p) => {
        p.waited += dt;
        if (p.waited >= 15) {
          st.strikes++;
          log.add('Warning', 'FailedScheduling', 'pod/' + p.name, 'Pending 超过 15 秒，放弃：' + failMessage(st.nodes, p), stamp());
          KG.toast(`${p.name} 等太久了！（失败 ${st.strikes}/3）`, 'bad');
          return false;
        }
        return true;
      });
      if (!st.queue.find((p) => p.id === st.selected)) st.selected = st.queue[0] ? st.queue[0].id : null;
      if (st.strikes >= 3) return endTimed(false);
      if (st.t >= lv.duration) return endTimed(true);
      render();
    }
    function endTimed(win) {
      st.done = true;
      st.running = false;
      render();
      const g = [
        { text: goals[0], ok: win, note: `完成 ${st.completed} 个 Pod，失败 ${st.strikes} 次` },
        { text: goals[1], ok: win && st.extra <= 1, note: `扩容了 ${st.extra} 台` },
        { text: goals[2], ok: win && st.extra === 0 },
      ];
      const stars = win ? 1 + (g[1].ok ? 1 : 0) + (g[2].ok ? 1 : 0) : 0;
      KG.showResult({
        game: GAME,
        level: lv.id,
        stars,
        goals: g,
        summary: win ? '高峰扛过去了！' : '调度失败太多，业务受影响了。',
        onRetry: reset,
        onNext: null,
      });
    }
    function scaleUp() {
      if (!st.running || st.extra >= lv.maxExtra) return;
      st.extra++;
      const n = mkNode('node-' + (st.nodes.length + 1), { ready: false, provision: 5 });
      st.nodes.push(n);
      log.add('Normal', 'TriggeredScaleUp', 'cluster-autoscaler', `pod didn't fit on existing nodes, scaling up: ${n.name}`, stamp());
      render();
    }

    // ---------------- 渲染
    function selectPod(p) {
      if (st.auto || st.done || st.selected === p.id) return;
      st.selected = p.id;
      renderBoard();
    }
    function render() {
      renderBoard();
      renderChrome();
    }
    function renderBoard() {
      if (!alive) return;
      const sel = selPod();
      // 队列
      const queue = h(
        'div',
        { class: 'panel g1-queue' },
        h('div', { class: 'panel-title' }, `调度队列 · Pending (${st.queue.length})`),
        st.queue.length
          ? st.queue.map((p) =>
              h(
                'button',
                {
                  class: 'g1-pod' + (p.id === st.selected ? ' selected' : '') + (p.failed ? ' failed' : ''),
                  style: { '--pc': colorOf(p.app) },
                  onpointerdown: () => selectPod(p),
                  onclick: () => selectPod(p),
                },
                h('div', { class: 'pn' }, h('span', { class: 'dot' }), p.name, p.failed ? h('span', { class: 'mini-badge bad' }, 'Pending') : null),
                h('div', { class: 'pr mono' }, `cpu ${fmtCpu(p.cpu)} · mem ${fmtMem(p.mem)}`),
                podBadges(p),
                lv.timed
                  ? h('div', { class: 'waitbar' }, h('div', { style: { width: Math.min(100, (p.waited / 15) * 100) + '%' } }))
                  : null
              )
            )
          : h('div', { class: 'empty' }, lv.timed && !st.running && !st.done ? '点"开始"迎接流量' : '队列空了 🎉')
      );

      // 节点
      const nodes = h(
        'div',
        { class: 'g1-nodes', onmouseleave: () => setHover(null) },
        st.nodes.map((n, i) => {
          const hovering = st.hover === i && sel && !st.auto;
          const why = hovering ? filterNode(n, sel) : null;
          return h(
            'div',
            {
              class: 'g1-node panel' + (n.ready ? '' : ' provisioning') + (hovering ? (why ? ' nofit' : ' fit') : ''),
              'data-node': i,
              onpointerdown: (e) => {
                if (e.button === 0) place(i);
              },
              onmouseover: () => setHover(i),
            },
            h(
              'div',
              { class: 'g1-node-head' },
              h('span', { class: 'kbd' }, i + 1),
              h('span', { class: 'nn' }, n.name),
              n.ready ? null : h('span', { class: 'mini-badge warn' }, `NotReady ${Math.max(0, n.provision).toFixed(0)}s`)
            ),
            h(
              'div',
              { class: 'g1-meta' },
              Object.entries(n.labels).map(([k, v]) => h('span', { class: 'mini-badge label' }, `${k}=${v}`)),
              n.taints.map((t) => h('span', { class: 'mini-badge taint' }, `⛔ ${t.key}=${t.value}:${t.effect}`))
            ),
            resBar(n, 'cpu', hovering ? { pod: sel, blocked: !!why && !why.every((r) => r.startsWith('Insufficient')) } : null),
            resBar(n, 'mem', hovering ? { pod: sel, blocked: !!why && !why.every((r) => r.startsWith('Insufficient')) } : null),
            hovering && why ? h('div', { class: 'g1-why' }, '✗ ' + why.join(', ')) : null,
            hovering && !why ? h('div', { class: 'g1-why ok' }, `✓ 可以调度（LeastAllocated 得分 ${scoreNode(n, sel).toFixed(0)}）`) : null,
            h(
              'div',
              { class: 'g1-node-pods' },
              n.pods.map((p) =>
                h(
                  'span',
                  {
                    class: 'g1-chip' + (p.fixed ? ' fixed' : ''),
                    style: { '--pc': colorOf(p.app) },
                    title: p.fixed ? 'DaemonSet Pod，不能撤回' : lv.timed ? '' : '点击撤回',
                    onpointerdown: (e) => {
                      e.stopPropagation();
                      if (e.button === 0) unplace(i, p);
                    },
                  },
                  p.name,
                  lv.timed ? h('span', { class: 'ttl' }, Math.ceil(p.remaining) + 's') : null
                )
              )
            )
          );
        })
      );
      KG.fill(boardEl, queue, nodes);
    }

    // HUD 每次都刷新；按钮只在状态变化时重建（否则按下和松开可能落在不同元素上，点击会丢）
    let actionsSig = '';
    function renderChrome() {
      if (!alive) return;
      const sig = [st.running, st.done, st.t === 0, st.extra, st.auto].join('|');
      const rebuildActions = sig !== actionsSig;
      actionsSig = sig;
      if (lv.timed) {
        KG.fill(
          hudEl,
          h('div', { class: 'hud-item' }, '⏱ ', h('b', null, Math.max(0, lv.duration - st.t).toFixed(0) + 's')),
          h('div', { class: 'hud-item' }, '失败 ', h('b', { class: st.strikes ? 'bad-text' : '' }, `${st.strikes}/3`)),
          h('div', { class: 'hud-item' }, '已完成 ', h('b', null, st.completed)),
          h('div', { class: 'hud-item' }, '扩容 ', h('b', null, `${st.extra}/${lv.maxExtra}`))
        );
        if (rebuildActions) KG.fill(
          actionsEl,
          !st.running && !st.done && st.t === 0
            ? h('button', { class: 'btn primary', onclick: () => ((st.running = true), render()) }, '▶ 开始')
            : null,
          st.t > 0 && !st.done
            ? h('button', { class: 'btn', onclick: () => ((st.running = !st.running), render()) }, st.running ? '⏸ 暂停' : '▶ 继续')
            : null,
          h('button', { class: 'btn', disabled: !st.running || st.extra >= lv.maxExtra, onclick: scaleUp }, '➕ 扩容节点'),
          h('button', { class: 'btn ghost', onclick: reset }, '↺ 重来')
        );
      } else {
        KG.fill(
          hudEl,
          h('div', { class: 'hud-item' }, '操作次数 ', h('b', null, st.moves)),
          h('div', { class: 'hud-item' }, '待调度 ', h('b', null, st.queue.length))
        );
        if (rebuildActions) KG.fill(
          actionsEl,
          h('button', { class: 'btn', disabled: st.auto, onclick: reset }, '↺ 重置'),
          h('button', { class: 'btn ghost', disabled: st.auto, onclick: autoRun }, '🤖 让默认调度器试试')
        );
      }
    }
    function setHover(i) {
      if (st.hover === i) return;
      st.hover = i;
      renderBoard();
    }

    // 键盘：1-9 把选中的 Pod 放到对应节点
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = parseInt(e.key, 10);
      if (k >= 1 && k <= st.nodes.length) {
        place(k - 1);
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    sc.add(() => document.removeEventListener('keydown', onKey));
    if (lv.timed) {
      // 按真实时间推进，页面卡顿或切到后台再回来也不会"慢动作"
      let last = performance.now();
      let acc = 0;
      sc.interval(() => {
        const now = performance.now();
        acc += Math.min(1.5, (now - last) / 1000);
        last = now;
        while (acc >= 0.1 && !st.done) {
          acc -= 0.1;
          tick();
        }
      }, 50);
    }

    body.append(
      KG.levelBar(GAME, LEVELS, li, load),
      h(
        'section',
        { class: 'panel intro' },
        h('h2', null, `第 ${li + 1} 关 · ${lv.title}`),
        h('p', { html: lv.intro }),
        goals ? KG.goalBox(goals) : KG.goalBox(['把所有 Pod 调度到节点上', '总操作次数 ≤ Pod 数 + 4', '一次成功：不撤回任何 Pod']),
        KG.tip(lv.tip.title, lv.tip.html)
      ),
      h('div', { class: 'toolbar' }, hudEl, actionsEl),
      boardEl,
      log.root
    );
    reset();
  }

  KG.register({
    id: GAME,
    icon: '🧩',
    color: '#60a5fa',
    title: '调度大师',
    tagline: '你是 kube-scheduler：按 requests 把 Pod 装进节点',
    concepts: ['capacity / allocatable', 'requests', '多维装箱', 'Taint / Toleration', 'nodeSelector', 'DaemonSet', 'Cluster Autoscaler'],
    en: {
      title: 'Scheduler Master',
      tagline: 'You are kube-scheduler: pack Pods onto nodes by their requests',
      concepts: ['capacity / allocatable', 'requests', 'multi-resource bin packing', 'Taint / Toleration', 'nodeSelector', 'DaemonSet', 'Cluster Autoscaler'],
    },
    progress: () => ({ got: LEVELS.reduce((s, l) => s + KG.getStars(GAME, l.id), 0), total: LEVELS.length * 3 }),
    mount,
  });

  // 供测试使用
  KG._g1 = { LEVELS, filterNode, scoreNode, failMessage };
})();
