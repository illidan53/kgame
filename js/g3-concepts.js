/* 标签选择器 / 我是 ReplicaSet / 滚动更新 —— 原"控制平面三连"拆出的三个游戏 */
(function () {
  'use strict';
  const { h, s } = KG;
  // 拆分前三个游戏同属 id 'concepts'，星星一直存在这个名下；继续沿用，老玩家的进度不丢
  const SAVE = 'concepts';

  // ================================================================ 3a 标签选择器
  const SEL_PODS = [
    { name: 'shop-web-1', labels: { app: 'shop', tier: 'frontend', env: 'prod', track: 'stable', version: 'v2' } },
    { name: 'shop-web-2', labels: { app: 'shop', tier: 'frontend', env: 'prod', track: 'canary', version: 'v3' } },
    { name: 'shop-web-s', labels: { app: 'shop', tier: 'frontend', env: 'staging', version: 'v3' } },
    { name: 'shop-api-1', labels: { app: 'shop', tier: 'backend', env: 'prod', track: 'stable', version: 'v2' } },
    { name: 'shop-api-2', labels: { app: 'shop', tier: 'backend', env: 'prod', version: 'v2' } },
    { name: 'shop-api-s', labels: { app: 'shop', tier: 'backend', env: 'staging', version: 'v3' } },
    { name: 'cart-api-1', labels: { app: 'cart', tier: 'backend', env: 'prod', track: 'stable', version: 'v1' } },
    { name: 'cart-api-2', labels: { app: 'cart', tier: 'backend', env: 'prod', track: 'canary', version: 'v2' } },
    { name: 'cart-api-s', labels: { app: 'cart', tier: 'backend', env: 'staging' } },
    { name: 'auth-api-1', labels: { app: 'auth', tier: 'backend', env: 'prod', version: 'v5' } },
    { name: 'auth-api-s', labels: { app: 'auth', tier: 'backend', env: 'staging', version: 'v6' } },
    { name: 'shop-db-0', labels: { app: 'shop', tier: 'db', env: 'prod' } },
    { name: 'cart-db-0', labels: { app: 'cart', tier: 'db', env: 'prod', version: 'v1' } },
    { name: 'debug-shell', labels: { app: 'debug', env: 'staging' } },
  ];
  const SEL_KEYS = ['app', 'tier', 'env', 'track', 'version'];
  const SEL_VALUES = {};
  for (const k of SEL_KEYS) SEL_VALUES[k] = [...new Set(SEL_PODS.map((p) => p.labels[k]).filter(Boolean))].sort();
  const LABEL_COLORS = { app: '#60a5fa', tier: '#a78bfa', env: '#34d399', track: '#f59e0b', version: '#f472b6' };

  const SEL_LEVELS = [
    {
      id: 's1',
      title: '按标签过滤',
      kind: 'kubectl',
      task: '用标签查询列出 <b>cart</b> 应用的所有 Pod。带 🎯 的就是目标。',
      target: (l) => l.app === 'cart',
      tip: '标签（Label）就是贴在对象上的 key=value 键值对。K8s 里对象之间几乎都靠<b>标签选择器</b>关联：Service 找后端 Pod，Deployment / ReplicaSet 认领自己的 Pod，NetworkPolicy、PodDisruptionBudget 圈定作用范围……<br>命令行：<code>kubectl get pods -l app=cart</code>',
    },
    {
      id: 's2',
      title: 'Service 选择器',
      kind: 'Service',
      name: 'shop-web',
      eqOnly: true,
      task: '给 <b>shop 生产环境的前端</b>建一个 Service。金丝雀 Pod 也要分到流量。',
      target: (l) => l.app === 'shop' && l.tier === 'frontend' && l.env === 'prod',
      tip: 'Service 的 <code>spec.selector</code> 是一个简单的 map，<b>只支持等值匹配</b>，多个条件之间是 AND。<br>金丝雀发布的常见做法：stable 和 canary 两个 Deployment 的 Pod 共享 <code>app</code>、<code>tier</code> 等标签，Service 只按这些共同标签选，流量就会按 Pod 数量比例分给两个版本。',
    },
    {
      id: 's3',
      title: '不是金丝雀',
      kind: 'kubectl',
      task: '列出<b>生产环境</b>中所有<b>不是金丝雀（canary）</b>的 Pod。注意：有些 Pod 根本没有 <code>track</code> 标签。',
      target: (l) => l.env === 'prod' && l.track !== 'canary',
      tip: '<code>NotIn</code>（以及命令行里的 <code>!=</code>）会<b>同时匹配没有这个标签的对象</b>。<br>所以 <code>track notin (canary)</code> ≠ <code>track in (stable)</code>：后者会漏掉没打 track 标签的 Pod。',
    },
    {
      id: 's4',
      title: '多选一',
      kind: 'NetworkPolicy',
      name: 'allow-db-clients',
      task: '选中 <b>cart 和 auth</b> 两个应用的<b>后端</b> Pod（所有环境都算），允许它们访问数据库。',
      target: (l) => (l.app === 'cart' || l.app === 'auth') && l.tier === 'backend',
      tip: 'Deployment、NetworkPolicy、PDB 等使用的是完整的 <code>LabelSelector</code>：<code>matchLabels</code>（等值）加上 <code>matchExpressions</code>（In / NotIn / Exists / DoesNotExist）。所有条件之间都是 AND；想表达"或"，只能在同一个 key 上用 <code>In</code>。',
    },
    {
      id: 's5',
      title: '缺失的标签',
      kind: 'kubectl',
      task: '找出所有<b>没有 version 标签</b>的 Pod，好给它们补上。',
      target: (l) => !('version' in l),
      tip: '<code>Exists</code> / <code>DoesNotExist</code> 只看 key 在不在，不关心值。命令行写法分别是 <code>-l version</code> 和 <code>-l \'!version\'</code>。',
    },
    {
      id: 's6',
      title: '组合拳',
      kind: 'PodDisruptionBudget',
      name: 'prod-backend-pdb',
      task: '节点维护前，要保护<b>生产环境</b>里<b>带版本号</b>的<b>后端和数据库</b> Pod，不让它们被同时驱逐。',
      target: (l) => l.env === 'prod' && 'version' in l && (l.tier === 'backend' || l.tier === 'db'),
      tip: 'PodDisruptionBudget 通过选择器圈定一组 Pod，限制"自愿中断"（比如 <code>kubectl drain</code>）时最多能同时驱逐多少个。选择器圈错了，保护就形同虚设。',
    },
  ];

  function matchTerm(l, t) {
    const has = Object.prototype.hasOwnProperty.call(l, t.key);
    switch (t.op) {
      case '=':
        return has && l[t.key] === t.values[0];
      case 'In':
        return has && t.values.includes(l[t.key]);
      case 'NotIn':
        return !has || !t.values.includes(l[t.key]);
      case 'Exists':
        return has;
      case 'DoesNotExist':
        return !has;
    }
    return false;
  }
  const termValid = (t) => (t.op === '=' || t.op === 'In' || t.op === 'NotIn' ? t.values.length > 0 : true);
  function termToCli(t) {
    switch (t.op) {
      case '=':
        return `${t.key}=${t.values[0]}`;
      case 'In':
        return `${t.key} in (${t.values.join(',')})`;
      case 'NotIn':
        return `${t.key} notin (${t.values.join(',')})`;
      case 'Exists':
        return t.key;
      case 'DoesNotExist':
        return '!' + t.key;
    }
  }
  function selectorYaml(lv, terms) {
    const ok = terms.filter(termValid);
    if (lv.kind === 'kubectl') return `kubectl get pods -l '${ok.map(termToCli).join(',')}'`;
    if (lv.kind === 'Service') {
      return `apiVersion: v1\nkind: Service\nmetadata:\n  name: ${lv.name}\nspec:\n  selector:\n${ok.map((t) => `    ${t.key}: ${t.values[0]}`).join('\n') || '    {}'}\n  ports:\n  - port: 80`;
    }
    const eq = ok.filter((t) => t.op === '=');
    const ex = ok.filter((t) => t.op !== '=');
    const field = lv.kind === 'NetworkPolicy' ? 'podSelector' : 'selector';
    const api = { NetworkPolicy: 'networking.k8s.io/v1', PodDisruptionBudget: 'policy/v1' }[lv.kind] || 'apps/v1';
    let y = `apiVersion: ${api}\nkind: ${lv.kind}\nmetadata:\n  name: ${lv.name}\nspec:\n  ${field}:\n`;
    if (eq.length) y += `    matchLabels:\n${eq.map((t) => `      ${t.key}: ${t.values[0]}`).join('\n')}\n`;
    if (ex.length) y += `    matchExpressions:\n${ex.map((t) => `    - {key: ${t.key}, operator: ${t.op}${t.values.length && t.op !== 'Exists' && t.op !== 'DoesNotExist' ? `, values: [${t.values.join(', ')}]` : ''}}`).join('\n')}\n`;
    if (!eq.length && !ex.length) y += '    {}\n';
    return y.trimEnd();
  }

  function mountSelector(host) {
    let sc = null;
    let idx = Math.min(KG.store.get('g3s:last', 0), SEL_LEVELS.length - 1);
    function load(i) {
      if (sc) sc.dispose();
      sc = KG.scope();
      idx = i;
      KG.store.set('g3s:last', i);
      KG.clear(host);
      playSelector(host, i, load);
    }
    load(idx);
    return () => sc && sc.dispose();
  }

  function playSelector(host, li, load) {
    const lv = SEL_LEVELS[li];
    let terms = [];
    let attempts = 0;
    let result = null; // 上一次 apply 的结果
    let solved = false;
    const podsEl = h('div', { class: 'g3s-pods' });
    const builderEl = h('div', { class: 'g3s-builder' });
    const yamlEl = h('pre', { class: 'code' });
    const statusEl = h('div', { class: 'g3s-status' });
    const target = new Set(SEL_PODS.filter((p) => lv.target(p.labels)).map((p) => p.name));

    function changed() {
      result = null;
      render();
    }
    function addTerm() {
      const used = new Set(terms.map((t) => t.key));
      const key = SEL_KEYS.find((k) => !used.has(k)) || 'app';
      terms.push({ key, op: '=', values: [SEL_VALUES[key][0]] });
      changed();
    }
    function apply() {
      if (solved) return;
      const valid = terms.filter(termValid);
      if (!valid.length) {
        KG.toast(lv.kind === 'kubectl' ? '至少加一个条件' : 'selector 不能为空：空选择器要么选中全部，要么一个都不选', 'bad');
        return;
      }
      if (valid.length !== terms.length) {
        KG.toast('有条件还没选值', 'bad');
        return;
      }
      attempts++;
      const matched = new Set(SEL_PODS.filter((p) => terms.every((t) => matchTerm(p.labels, t))).map((p) => p.name));
      const extra = [...matched].filter((n) => !target.has(n));
      const missed = [...target].filter((n) => !matched.has(n));
      result = { matched, extra, missed };
      render();
      if (!extra.length && !missed.length) {
        solved = true;
        const stars = attempts === 1 ? 3 : attempts === 2 ? 2 : 1;
        KG.showResult({
          game: SAVE,
          level: 'sel-' + lv.id,
          stars,
          goals: [
            { text: '选中的 Pod 与目标完全一致', ok: true },
            { text: '两次以内答对', ok: attempts <= 2 },
            { text: '一次答对', ok: attempts === 1, note: `你用了 ${attempts} 次` },
          ],
          extra: h('div', null, h('pre', { class: 'code' }, selectorYaml(lv, terms)), KG.tip('知识点', lv.tip, true)),
          onRetry: () => load(li),
          onNext: li + 1 < SEL_LEVELS.length ? () => load(li + 1) : null,
        });
      } else {
        KG.shake(statusEl);
      }
    }

    function termRow(t, i) {
      const keySel = h(
        'select',
        {
          class: 'sel',
          onchange: (e) => {
            t.key = e.target.value;
            t.values = t.op === '=' ? [SEL_VALUES[t.key][0]] : [];
            changed();
          },
        },
        SEL_KEYS.map((k) => h('option', { value: k, selected: k === t.key }, k))
      );
      const ops = lv.eqOnly ? ['='] : ['=', 'In', 'NotIn', 'Exists', 'DoesNotExist'];
      const opSel = h(
        'select',
        {
          class: 'sel',
          disabled: lv.eqOnly,
          onchange: (e) => {
            const prev = t.op;
            t.op = e.target.value;
            if (t.op === '=') t.values = [t.values[0] || SEL_VALUES[t.key][0]];
            else if (t.op === 'Exists' || t.op === 'DoesNotExist') t.values = [];
            else if (prev === '=' || prev === 'Exists' || prev === 'DoesNotExist') t.values = t.values.slice(0, 1);
            changed();
          },
        },
        ops.map((o) => h('option', { value: o, selected: o === t.op }, o))
      );
      let valEl = null;
      if (t.op === '=') {
        valEl = h(
          'select',
          {
            class: 'sel',
            onchange: (e) => {
              t.values = [e.target.value];
              changed();
            },
          },
          SEL_VALUES[t.key].map((v) => h('option', { value: v, selected: v === t.values[0] }, v))
        );
      } else if (t.op === 'In' || t.op === 'NotIn') {
        valEl = h(
          'div',
          { class: 'vchips' },
          SEL_VALUES[t.key].map((v) =>
            h(
              'button',
              {
                class: 'vchip' + (t.values.includes(v) ? ' on' : ''),
                onclick: () => {
                  t.values = t.values.includes(v) ? t.values.filter((x) => x !== v) : [...t.values, v];
                  changed();
                },
              },
              v
            )
          )
        );
      } else valEl = h('span', { class: 'muted-text' }, t.op === 'Exists' ? '（有这个 key 就行）' : '（没有这个 key）');
      return h(
        'div',
        { class: 'g3s-term' },
        keySel,
        opSel,
        valEl,
        h(
          'button',
          {
            class: 'icon-btn',
            'aria-label': '删除条件',
            onclick: () => {
              terms.splice(i, 1);
              changed();
            },
          },
          '✕'
        )
      );
    }

    function render() {
      // Pod 网格
      KG.fill(
        podsEl,
        SEL_PODS.map((p) => {
          let cls = '';
          if (result) {
            const m = result.matched.has(p.name);
            const tg = target.has(p.name);
            cls = m && tg ? ' hit' : m && !tg ? ' extra' : !m && tg ? ' missed' : '';
          }
          return h(
            'div',
            { class: 'g3s-pod' + (target.has(p.name) ? ' target' : '') + cls },
            h('div', { class: 'g3s-pod-name mono' }, target.has(p.name) ? '🎯 ' : '', p.name),
            h(
              'div',
              { class: 'g3s-labels' },
              SEL_KEYS.filter((k) => k in p.labels).map((k) => h('span', { class: 'lbl', style: { '--lc': LABEL_COLORS[k] } }, `${k}=${p.labels[k]}`))
            ),
            result && cls === ' extra' ? h('div', { class: 'g3s-flag bad-text' }, '多选了') : null,
            result && cls === ' missed' ? h('div', { class: 'g3s-flag warn-text' }, '漏掉了') : null
          );
        })
      );
      // 构造器
      KG.fill(
        builderEl,
        h('div', { class: 'panel-title' }, lv.kind === 'kubectl' ? '标签查询条件（AND）' : `${lv.kind} 选择器（所有条件 AND）`, lv.eqOnly ? h('span', { class: 'mini-badge warn', style: { marginLeft: '8px' } }, '只支持等值') : null),
        terms.length ? terms.map(termRow) : h('div', { class: 'empty' }, '还没有条件，点下面的"+ 添加条件"'),
        h('div', { class: 'row gap wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: addTerm }, '+ 添加条件'), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: apply, disabled: solved }, lv.kind === 'kubectl' ? '⏎ 执行查询' : '⏎ kubectl apply'))
      );
      yamlEl.textContent = selectorYaml(lv, terms);
      if (result) {
        const ok = !result.extra.length && !result.missed.length;
        KG.fill(
          statusEl,
          ok
            ? h('span', { class: 'ok-text' }, `✓ 完全正确！选中 ${result.matched.size} 个 Pod`)
            : h('span', null, `选中了 ${result.matched.size} 个 Pod：`, result.extra.length ? h('span', { class: 'bad-text' }, `多选 ${result.extra.length} 个 `) : null, result.missed.length ? h('span', { class: 'warn-text' }, `漏掉 ${result.missed.length} 个`) : null, '，改一改再试。')
        );
      } else KG.fill(statusEl, h('span', { class: 'muted-text' }, `已尝试 ${attempts} 次 · 目标 ${target.size} 个 Pod。写好选择器后执行，才会看到它选中了谁。`));
    }

    host.append(
      KG.levelBar(SAVE, SEL_LEVELS.map((l) => ({ ...l, id: 'sel-' + l.id })), li, load),
      h('section', { class: 'panel intro' }, h('h2', null, `第 ${li + 1} 关 · ${lv.title}`), h('p', { html: lv.task }), KG.goalBox(['选中的 Pod 与 🎯 目标完全一致', '两次以内答对', '一次答对'])),
      h('div', { class: 'g3s-layout' }, h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, 'Pods（14 个）'), podsEl), h('div', { class: 'g3s-side' }, h('div', { class: 'panel' }, builderEl, statusEl), h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, lv.kind === 'kubectl' ? '命令' : 'YAML'), yamlEl)))
    );
    addTerm();
  }

  // ================================================================ 3b ReplicaSet 控制循环
  const CTRL_DURATION = 60;
  const CTRL_SCRIPT = [
    { t: 4, type: 'delete', msg: '有人手滑执行了 kubectl delete pod' },
    { t: 10, type: 'scale', n: 5 },
    { t: 17, type: 'nodeDown', node: 1 },
    { t: 27, type: 'scale', n: 2 },
    { t: 33, type: 'evict' },
    { t: 37, type: 'nodeUp', node: 1 },
    { t: 41, type: 'crash' },
    { t: 46, type: 'scale', n: 4 },
    { t: 53, type: 'delete', msg: '又有人手滑执行了 kubectl delete pod' },
  ];
  const ACTIVE = new Set(['Pending', 'ContainerCreating', 'Running', 'Restarting', 'Unknown']);

  function mountController(host) {
    const sc = KG.scope();
    const log = KG.eventLog('kubectl get events -w');
    const hudEl = h('div', { class: 'g3c-hud' });
    const nodesEl = h('div', { class: 'g3c-nodes' });
    const actEl = h('div', { class: 'row gap wrap' });
    const timeEl = h('div', { class: 'g3c-timeline' });
    let st;
    let seq = 0;
    const rnd = KG.rng(7);
    const suffix = () => Math.floor(rnd() * 36 ** 5).toString(36).padStart(5, '0');

    function reset(auto) {
      seq = 0;
      st = {
        t: 0,
        running: false,
        done: false,
        auto: !!auto,
        desired: 3,
        nodes: [
          { name: 'node-1', ready: true },
          { name: 'node-2', ready: true },
          { name: 'node-3', ready: true },
        ],
        pods: [],
        script: 0,
        sync: 0,
        ticks: 0,
        nextReconcile: 0,
        timeline: [],
      };
      for (let i = 0; i < 3; i++) st.pods.push(newPod(i, 'Running'));
      log.clear();
      render(true);
    }
    function newPod(nodeIdx, phase) {
      seq++;
      return { id: seq, name: 'web-7d9f-' + suffix(), node: nodeIdx, phase: phase || 'Pending', pt: 0, restarts: 0 };
    }
    const activePods = () => st.pods.filter((p) => ACTIVE.has(p.phase));
    const stamp = () => st.t.toFixed(1) + 's';

    function pickNode() {
      const ready = st.nodes.map((n, i) => ({ n, i })).filter((x) => x.n.ready);
      if (!ready.length) return -1;
      let best = ready[0].i;
      let bestN = Infinity;
      for (const { i } of ready) {
        const c = st.pods.filter((p) => p.node === i && ACTIVE.has(p.phase)).length;
        if (c < bestN) {
          bestN = c;
          best = i;
        }
      }
      return best;
    }
    function createPod(by) {
      if (!st.running) return;
      const ni = pickNode();
      const p = newPod(ni, 'Pending');
      st.pods.push(p);
      log.add('Normal', 'SuccessfulCreate', 'replicaset/web-7d9f', `Created pod: ${p.name}${by === 'auto' ? '' : '（你手动创建）'}`, stamp());
      render(true);
    }
    function deletePod(p, by) {
      if (!st.running || !ACTIVE.has(p.phase)) return;
      p.phase = 'Terminating';
      p.pt = 0;
      log.add('Normal', 'SuccessfulDelete', 'replicaset/web-7d9f', `Deleted pod: ${p.name}${by === 'auto' ? '' : '（你手动删除）'}`, stamp());
      render(true);
    }
    function randomActive(filter) {
      const c = activePods().filter(filter || (() => true));
      return c.length ? c[Math.floor(rnd() * c.length)] : null;
    }

    function runScript() {
      while (st.script < CTRL_SCRIPT.length && CTRL_SCRIPT[st.script].t <= st.t) {
        const e = CTRL_SCRIPT[st.script++];
        if (e.type === 'delete') {
          const p = randomActive((q) => q.phase === 'Running');
          if (p) {
            p.phase = 'Terminating';
            p.pt = 0;
            log.add('Warning', 'Killing', 'pod/' + p.name, e.msg, stamp());
            KG.toast('💀 ' + e.msg, 'bad');
          }
        } else if (e.type === 'scale') {
          st.desired = e.n;
          log.add('Normal', 'ScalingReplicaSet', 'deployment/web', `kubectl scale --replicas=${e.n}：期望副本数改为 ${e.n}`, stamp());
          KG.toast(`📐 期望副本数 → ${e.n}`, 'info');
        } else if (e.type === 'nodeDown') {
          const n = st.nodes[e.node];
          n.ready = false;
          st.pods.forEach((p) => {
            if (p.node === e.node && ACTIVE.has(p.phase)) {
              p.phase = 'Unknown';
              p.pt = 0;
            }
          });
          log.add('Warning', 'NodeNotReady', 'node/' + n.name, `Node ${n.name} status is now: NodeNotReady（kubelet 失联）`, stamp());
          KG.toast(`🔥 ${n.name} 宕机了`, 'bad');
        } else if (e.type === 'nodeUp') {
          const n = st.nodes[e.node];
          n.ready = true;
          log.add('Normal', 'NodeReady', 'node/' + n.name, `Node ${n.name} status is now: NodeReady`, stamp());
        } else if (e.type === 'evict') {
          const p = randomActive((q) => q.phase === 'Running');
          if (p) {
            p.phase = 'Evicted';
            p.pt = 0;
            log.add('Warning', 'Evicted', 'pod/' + p.name, 'The node was low on resource: memory.（Pod 进入 Failed 状态，不再算作活跃副本）', stamp());
            KG.toast('⛔ 一个 Pod 被驱逐了', 'bad');
          }
        } else if (e.type === 'crash') {
          const p = randomActive((q) => q.phase === 'Running');
          if (p) {
            p.phase = 'Restarting';
            p.pt = 0;
            p.restarts++;
            log.add('Warning', 'BackOff', 'pod/' + p.name, '容器崩溃，kubelet 正在原地重启它（Pod 还在，不需要新建）', stamp());
            KG.toast('💥 一个容器崩溃重启了', 'info');
          }
        }
      }
    }

    function autoReconcile() {
      const act = activePods();
      const diff = st.desired - act.length;
      if (diff === 0) return;
      if (diff > 0) {
        log.add('Normal', 'Reconcile', 'replicaset/web-7d9f', `期望 ${st.desired}，实际 ${act.length} → 创建 ${diff} 个`, stamp());
        for (let i = 0; i < diff; i++) createPod('auto');
      } else {
        const rank = { Pending: 0, ContainerCreating: 1, Unknown: 2, Restarting: 3, Running: 4 };
        const victims = act.slice().sort((a, b) => rank[a.phase] - rank[b.phase] || b.id - a.id).slice(0, -diff);
        log.add('Normal', 'Reconcile', 'replicaset/web-7d9f', `期望 ${st.desired}，实际 ${act.length} → 删除 ${-diff} 个（优先删未就绪、最新的）`, stamp());
        victims.forEach((p) => deletePod(p, 'auto'));
      }
    }

    function tick() {
      if (!st.running || st.done) return;
      const dt = 0.1;
      st.t += dt;
      runScript();
      for (const p of st.pods) {
        p.pt += dt;
        if (p.phase === 'Pending' && p.pt >= 0.6) {
          if (p.node < 0 || !st.nodes[p.node].ready) {
            const ni = pickNode();
            if (ni >= 0) p.node = ni;
          } else {
            p.phase = 'ContainerCreating';
            p.pt = 0;
          }
        } else if (p.phase === 'ContainerCreating' && p.pt >= 1.4) {
          p.phase = 'Running';
          p.pt = 0;
        } else if (p.phase === 'Restarting' && p.pt >= 2.5) {
          p.phase = 'Running';
          p.pt = 0;
        } else if (p.phase === 'Unknown' && p.pt >= 5) {
          p.phase = 'Terminating';
          p.pt = 0;
          log.add('Normal', 'TaintManagerEviction', 'pod/' + p.name, '节点长时间 NotReady，node lifecycle controller 删除了上面的 Pod', stamp());
        }
      }
      st.pods = st.pods.filter((p) => !((p.phase === 'Terminating' && p.pt >= 1.2) || (p.phase === 'Evicted' && p.pt >= 3)));
      if (st.auto) {
        st.nextReconcile -= dt;
        if (st.nextReconcile <= 0) {
          st.nextReconcile = 0.5;
          autoReconcile();
        }
      }
      st.ticks++;
      const inSync = activePods().length === st.desired;
      if (inSync) st.sync++;
      st.timeline.push(inSync);
      if (st.t >= CTRL_DURATION - 1e-6) return finish();
      render(false);
    }

    function finish() {
      st.done = true;
      st.running = false;
      render(true);
      const rate = st.sync / Math.max(1, st.ticks);
      if (st.auto) {
        KG.modal({
          title: `真正的控制器：同步率 ${KG.pct(rate)}`,
          body: h(
            'div',
            { class: 'prose', html: 'ReplicaSet 控制器每次同步都只做三件事：<b>观察</b>（从 Informer 缓存里数自己的 Pod）→ <b>比较</b>（期望 − 实际）→ <b>行动</b>（创建或删除差额）。<br>它从不关心"发生了什么事件"：Pod 是被误删、被驱逐，还是节点宕机，处理方式都一样。这叫 <b>level-triggered</b>（看状态，而不是看事件）。<br>注意容器崩溃那一次：Pod 对象还在，由 kubelet 原地重启容器，ReplicaSet 什么都不用做。' }
          ),
          actions: [{ label: '我来当控制器', primary: true, onClick: () => reset(false) }],
        });
        return;
      }
      const stars = rate >= 0.85 ? 3 : rate >= 0.7 ? 2 : rate >= 0.5 ? 1 : 0;
      KG.showResult({
        game: SAVE,
        level: 'ctrl',
        stars,
        goals: [
          { text: '同步率 ≥ 50%（活跃 Pod 数 = 期望副本数的时间占比）', ok: rate >= 0.5, note: `你的同步率 ${KG.pct(rate)}` },
          { text: '同步率 ≥ 70%', ok: rate >= 0.7 },
          { text: '同步率 ≥ 85%', ok: rate >= 0.85 },
        ],
        extra: h('div', { class: 'tip-inline', html: '试试"🤖 让真正的控制器来"：它每 0.5 秒对一次账，看看能做到多少。' }),
        onRetry: () => reset(false),
      });
    }

    const PHASE_CLS = { Pending: 'muted', ContainerCreating: 'info', Running: 'ok', Restarting: 'warn', Unknown: 'warn', Terminating: 'muted', Evicted: 'bad' };
    let actSig = '';
    function render(full) {
      const act = activePods();
      const ready = st.pods.filter((p) => p.phase === 'Running').length;
      const diff = st.desired - act.length;
      KG.fill(
        hudEl,
        h('div', { class: 'g3c-stat big' }, h('span', null, '期望 replicas'), h('b', null, st.desired)),
        h('div', { class: 'g3c-stat big' + (diff ? ' off' : ' on') }, h('span', null, '活跃 Pod'), h('b', null, act.length)),
        h('div', { class: 'g3c-stat' }, h('span', null, 'Ready'), h('b', null, ready)),
        h('div', { class: 'g3c-stat' + (diff ? ' off' : ' on') }, h('span', null, '差额'), h('b', null, diff > 0 ? `缺 ${diff}` : diff < 0 ? `多 ${-diff}` : '✓ 同步')),
        h('div', { class: 'g3c-stat' }, h('span', null, '同步率'), h('b', null, st.ticks ? KG.pct(st.sync / st.ticks) : '—')),
        h('div', { class: 'g3c-stat' }, h('span', null, '剩余'), h('b', null, Math.max(0, CTRL_DURATION - st.t).toFixed(0) + 's'))
      );
      KG.fill(
        nodesEl,
        st.nodes.map((n, i) =>
          h(
            'div',
            { class: 'panel g3c-node' + (n.ready ? '' : ' down') },
            h('div', { class: 'g3c-node-head' }, h('b', { class: 'mono' }, n.name), h('span', { class: 'badge ' + (n.ready ? 'ok' : 'bad') }, n.ready ? 'Ready' : 'NotReady')),
            h(
              'div',
              { class: 'g3c-pods' },
              st.pods
                .filter((p) => p.node === i)
                .map((p) =>
                  h(
                    'button',
                    {
                      class: 'g3c-pod ' + p.phase.toLowerCase(),
                      title: ACTIVE.has(p.phase) ? '点击删除这个 Pod' : '',
                      onpointerdown: (e) => {
                        if (e.button === 0 && !st.auto) deletePod(p);
                      },
                    },
                    h('span', { class: 'mono' }, p.name.slice(-5)),
                    h('span', { class: 'badge ' + PHASE_CLS[p.phase] }, p.phase + (p.restarts ? ` ↻${p.restarts}` : ''))
                  )
                )
            )
          )
        ),
        st.pods.some((p) => p.node < 0) ? h('div', { class: 'panel g3c-node' }, h('div', { class: 'g3c-node-head' }, h('b', null, '未调度')), h('div', { class: 'g3c-pods' }, st.pods.filter((p) => p.node < 0).map((p) => h('span', { class: 'g3c-pod pending' }, p.name.slice(-5))))) : null
      );
      // 同步时间线
      const segs = 120;
      const per = CTRL_DURATION * 10 / segs;
      const cells = [];
      for (let i = 0; i < segs; i++) {
        const slice = st.timeline.slice(Math.floor(i * per), Math.floor((i + 1) * per));
        cells.push(h('span', { class: slice.length ? (slice.every(Boolean) ? 'ok' : slice.some(Boolean) ? 'mid' : 'bad') : '' }));
      }
      KG.fill(timeEl, cells);
      const sig = [st.running, st.done, st.auto, st.t === 0].join('|');
      if (full || sig !== actSig) {
        actSig = sig;
        KG.fill(
          actEl,
          !st.running && !st.done && st.t === 0 ? h('button', { class: 'btn primary', onclick: () => ((st.running = true), render(true)) }, st.auto ? '▶ 开始（自动模式）' : '▶ 开始') : null,
          h('button', { class: 'btn primary', disabled: !st.running || st.auto, onpointerdown: (e) => e.button === 0 && createPod() }, '➕ 创建 Pod'),
          h('button', { class: 'btn ghost', onclick: () => reset(false) }, '↺ 重来'),
          h('button', { class: 'btn ghost', onclick: () => reset(true) }, '🤖 让真正的控制器来')
        );
      }
    }

    let lastT = performance.now();
    let acc = 0;
    sc.interval(() => {
      const now = performance.now();
      acc += Math.min(1.5, (now - lastT) / 1000);
      lastT = now;
      while (acc >= 0.1) {
        acc -= 0.1;
        tick();
      }
    }, 50);
    const onKey = (e) => {
      if ((e.key === 'c' || e.key === 'C' || e.key === '+') && st.running && !st.auto) createPod();
    };
    document.addEventListener('keydown', onKey);
    sc.add(() => document.removeEventListener('keydown', onKey));

    host.append(
      h(
        'section',
        { class: 'panel intro' },
        h('h2', null, '你是 ReplicaSet 控制器'),
        h(
          'p',
          { html: '你的唯一职责：让<b>活跃 Pod 的数量</b>始终等于<b>期望副本数</b>。接下来 60 秒里，会有人删 Pod、改副本数、节点宕机……<br>点 <b>➕ 创建 Pod</b>（或按 <kbd>C</kbd>）补副本，点某个 Pod 删掉它。注意：刚创建、还没 Running 的 Pod <b>也算数</b>，别重复创建；Unknown 状态的 Pod 在被删除之前同样算数。' }
        ),
        KG.goalBox(['同步率 ≥ 50%', '同步率 ≥ 70%', '同步率 ≥ 85%']),
        KG.tip('控制循环（Control Loop）', 'K8s 的几乎每个组件都是一个控制循环：不停地把<b>实际状态</b>往<b>期望状态</b>推。ReplicaSet 期望的是"匹配我选择器的活跃 Pod 有 N 个"，Deployment 期望的是"ReplicaSet 的版本和数量正确"，kubelet 期望的是"分配到本节点的 Pod 的容器都在跑"。<br>控制器之间通过 API Server 上的对象间接协作：ReplicaSet 只负责创建 Pod 对象，<b>调度器</b>负责给它选节点，<b>kubelet</b> 负责把容器跑起来。')
      ),
      h('div', { class: 'g3c-top' }, hudEl, actEl),
      timeEl,
      nodesEl,
      log.root
    );
    reset(false);
    return () => sc.dispose();
  }

  // ================================================================ 3c 滚动更新
  const RO_LEVELS = [
    {
      id: 'r1',
      title: '零停机发布',
      from: 'v1',
      to: 'v2',
      broken: false,
      preset: { surge: 0, unavail: 2, probe: false },
      intro:
        'shop 有 4 个副本，Service 持续收到 <b>300 rps</b> 的流量，每个 Pod 最多处理 <b>100 rps</b>，所以至少要有 3 个"真正能干活"的 Pod。新版本 v2 启动后需要约 <b>3 秒预热</b>（比如 JVM 加载、建连接池），预热完成前处理不了请求。<br>调好 <code>maxSurge</code>、<code>maxUnavailable</code> 和 <code>readinessProbe</code>，完成一次不丢请求的发布。',
      goals: ['发布完成，且失败请求 < 5%', '全程零失败请求', '发布耗时 ≤ 15 秒'],
    },
    {
      id: 'r2',
      title: '坏版本 v3',
      from: 'v2',
      to: 'v3',
      broken: true,
      preset: { surge: 1, unavail: 1, probe: false },
      intro:
        '这次要发布的 v3 有 bug：进程能起来，但所有请求都返回 <b>500</b>，健康检查 <code>/healthz</code> 也失败。<br>你事先不知道它是坏的。先配好发布策略，开始发布；发现不对就点 <b>↩ 回滚</b>（<code>kubectl rollout undo</code>）。',
      goals: ['失败请求 < 2%', '执行回滚，最终 4 个 v2 全部 Ready', '全程零失败请求'],
    },
  ];
  const VER_COLORS = { v1: '#94a3b8', v2: '#60a5fa', v3: '#f472b6' };
  const RPS = 300;
  const CAP = 100;

  function mountRollout(host) {
    let sc = null;
    let idx = Math.min(KG.store.get('g3r:last', 0), RO_LEVELS.length - 1);
    function load(i) {
      if (sc) sc.dispose();
      sc = KG.scope();
      idx = i;
      KG.store.set('g3r:last', i);
      KG.clear(host);
      playRollout(host, i, sc, load);
    }
    load(idx);
    return () => sc && sc.dispose();
  }

  function playRollout(host, li, sc, load) {
    const lv = RO_LEVELS[li];
    const cfg = { ...lv.preset };
    let st;
    let seq = 0;
    const log = KG.eventLog('kubectl rollout status deploy/shop -w');
    const canvas = h('canvas', { class: 'g3r-canvas' });
    const statsEl = h('div', { class: 'g3r-stats' });
    const cfgEl = h('div', { class: 'g3r-cfg' });
    const yamlEl = h('pre', { class: 'code' });
    const statusLine = h('div', { class: 'g3r-status mono' });
    const sparkEl = h('div', { class: 'g3r-spark' });

    function podName(ver) {
      seq++;
      return `shop-${ver === 'v1' ? '5c8b' : ver === 'v2' ? '7d9f' : '9e2a'}-${(seq * 7919).toString(36).slice(-4).padStart(4, 'x')}`;
    }
    function mkPod(ver, running) {
      return {
        id: ++seq,
        name: podName(ver),
        ver,
        phase: running ? 'Running' : 'Pending',
        pt: 0,
        warm: running ? 0 : 3,
        broken: lv.broken && ver === lv.to,
        rps: 0,
        err: 0,
      };
    }
    function reset() {
      seq = 0;
      st = {
        t: 0,
        phase: 'idle', // idle | rolling | done
        target: lv.from,
        pods: [0, 1, 2, 3].map(() => mkPod(lv.from, true)),
        total: 0,
        errors: 0,
        started: 0,
        completedAt: null,
        rolledBack: false,
        nextSync: 0,
        deadlineNoted: false,
        history: [],
        secBucket: { ok: 0, err: 0 },
        particles: [],
        endIn: null,
      };
      log.clear();
      renderCfg();
      renderStats();
    }

    const isReady = (p) => p.phase === 'Running' && (cfg.probe ? p.warm <= 0 && !p.broken : true);
    const healthy = (p) => p.phase === 'Running' && p.warm <= 0 && !p.broken;
    const live = () => st.pods.filter((p) => p.phase !== 'Terminating');

    function syncDeployment() {
      const R = 4;
      let all = live();
      const nw = all.filter((p) => p.ver === st.target);
      const canAdd = Math.min(R + cfg.surge - all.length, R - nw.length);
      for (let i = 0; i < canAdd; i++) {
        const p = mkPod(st.target, false);
        st.pods.push(p);
        log.add('Normal', 'SuccessfulCreate', `rs/shop-${st.target}`, `Created pod: ${p.name}`, st.t.toFixed(1) + 's');
      }
      all = live();
      const minAvail = R - cfg.unavail;
      const newUnavail = all.filter((p) => p.ver === st.target && !isReady(p)).length;
      let maxDown = all.length - minAvail - newUnavail;
      const old = all.filter((p) => p.ver !== st.target).sort((a, b) => (isReady(a) ? 1 : 0) - (isReady(b) ? 1 : 0));
      while (maxDown > 0 && old.length) {
        const p = old.shift();
        p.phase = 'Terminating';
        p.pt = 0;
        maxDown--;
        log.add('Normal', 'SuccessfulDelete', `rs/shop-${p.ver}`, `Deleted pod: ${p.name}`, st.t.toFixed(1) + 's');
      }
      const updated = live().filter((p) => p.ver === st.target);
      const avail = live().filter(isReady).length;
      const done = updated.length === R && live().length === R && updated.every(isReady);
      statusLine.textContent = done
        ? `deployment "shop" successfully rolled out（${st.target}）`
        : `Waiting for deployment "shop" rollout to finish: ${updated.filter(isReady).length} of ${R} updated replicas are available... (available ${avail}, total ${live().length})`;
      return done;
    }

    function start() {
      if (st.phase !== 'idle') return;
      st.phase = 'rolling';
      st.target = lv.to;
      st.started = st.t;
      log.add('Normal', 'ScalingReplicaSet', 'deploy/shop', `kubectl set image deploy/shop shop=shop:${lv.to}（maxSurge=${cfg.surge}, maxUnavailable=${cfg.unavail}, readinessProbe=${cfg.probe ? 'on' : 'off'}）`, st.t.toFixed(1) + 's');
      renderCfg();
    }
    function rollback() {
      if (st.phase !== 'rolling' || st.target === lv.from) return;
      st.target = lv.from;
      st.rolledBack = true;
      log.add('Normal', 'Rollback', 'deploy/shop', `kubectl rollout undo deploy/shop → 回到 ${lv.from}`, st.t.toFixed(1) + 's');
      renderCfg();
    }

    function tick(dt) {
      st.t += dt;
      // Pod 生命周期
      for (const p of st.pods) {
        p.pt += dt;
        if (p.phase === 'Pending' && p.pt >= 0.4) {
          p.phase = 'ContainerCreating';
          p.pt = 0;
        } else if (p.phase === 'ContainerCreating' && p.pt >= 1.0) {
          p.phase = 'Running';
          p.pt = 0;
        } else if (p.phase === 'Running' && p.warm > 0) p.warm -= dt;
      }
      st.pods = st.pods.filter((p) => !(p.phase === 'Terminating' && p.pt >= 1.0));
      // Deployment 控制器
      if (st.phase === 'rolling') {
        st.nextSync -= dt;
        if (st.nextSync <= 0) {
          st.nextSync = 0.5;
          const done = syncDeployment();
          if (done && st.endIn == null) {
            st.completedAt = st.t;
            st.endIn = 1.5;
            log.add('Normal', 'RolloutComplete', 'deploy/shop', `发布完成，全部 ${st.target} 就绪`, st.t.toFixed(1) + 's');
          }
          if (!done && !st.deadlineNoted && st.t - st.started > 20) {
            st.deadlineNoted = true;
            log.add('Warning', 'ProgressDeadlineExceeded', 'deploy/shop', 'ReplicaSet "shop" has timed out progressing.（K8s 不会自动回滚，需要人来决定）', st.t.toFixed(1) + 's');
          }
        }
        if (st.endIn != null) {
          st.endIn -= dt;
          if (st.endIn <= 0) return finish();
        }
        if (st.t - st.started > 60) return finish();
      }
      // 流量
      const eps = st.pods.filter((p) => p.phase !== 'Terminating' && isReady(p));
      const req = RPS * dt;
      st.pods.forEach((p) => {
        p.rps = 0;
        p.err = 0;
      });
      let ok = 0;
      let err = 0;
      if (!eps.length) err = req;
      else {
        const share = req / eps.length;
        for (const p of eps) {
          const served = healthy(p) ? Math.min(share, CAP * dt) : 0;
          ok += served;
          err += share - served;
          p.rps = share / dt;
          p.err = (share - served) / dt;
        }
      }
      if (st.phase === 'rolling') {
        st.total += req;
        st.errors += err;
      }
      st.secBucket.ok += ok;
      st.secBucket.err += err;
      spawnParticles(eps, ok, err, req);
    }

    function finish() {
      st.phase = 'done';
      renderCfg();
      renderStats();
      const errRate = st.total ? st.errors / st.total : 0;
      const allTarget = live().length === 4 && live().every((p) => p.ver === st.target && isReady(p));
      const completed = st.completedAt != null;
      const dur = completed ? st.completedAt - st.started : null;
      let g;
      if (lv.id === 'r1') {
        g = [
          { text: lv.goals[0], ok: completed && st.target === lv.to && errRate < 0.05, note: `失败率 ${(errRate * 100).toFixed(1)}%` },
          { text: lv.goals[1], ok: completed && st.errors < 0.5 },
          { text: lv.goals[2], ok: completed && dur <= 15, note: dur != null ? `耗时 ${dur.toFixed(1)} 秒` : '未完成' },
        ];
      } else {
        g = [
          { text: lv.goals[0], ok: errRate < 0.02, note: `失败率 ${(errRate * 100).toFixed(1)}%` },
          { text: lv.goals[1], ok: st.rolledBack && allTarget && st.target === lv.from },
          { text: lv.goals[2], ok: st.errors < 0.5 },
        ];
      }
      const stars = g[0].ok ? 1 + (g[1].ok ? 1 : 0) + (g[2].ok ? 1 : 0) : 0;
      KG.showResult({
        game: SAVE,
        level: 'ro-' + lv.id,
        stars,
        goals: g,
        extra: KG.tip(
          '复盘',
          lv.id === 'r1'
            ? '• <b>readinessProbe</b>：没有它时，容器一启动 Pod 就被当成 Ready，Service 马上把流量打给还在预热的实例；Deployment 也以为新 Pod 可用了，于是继续删旧 Pod。<br>• <b>maxUnavailable</b>：发布过程中最多允许少几个可用 Pod。300 rps 需要 3 个 Pod，所以它最多只能是 1。<br>• <b>maxSurge</b>：最多能多建几个 Pod。它越大发布越快，代价是临时多占资源。<br>推荐：readinessProbe 打开，maxUnavailable=0 或 1，maxSurge=2 左右。'
            : '• 有 <b>readinessProbe</b> 时，坏掉的 v3 永远不会 Ready：Service 不会把流量发给它，Deployment 也不会继续删旧 Pod，发布就"卡住"了。卡住是好事，说明这道闸门起作用了。<br>• 超过 <code>progressDeadlineSeconds</code> 后 Deployment 的状态会变成 <code>ProgressDeadlineExceeded</code>，但 K8s <b>不会自动回滚</b>，要靠人或 Argo Rollouts / Flagger 之类的工具。<br>• 没有探针时，坏版本会被当成健康的，一路把旧版本全换掉。',
          true
        ),
        onRetry: reset,
        onNext: li + 1 < RO_LEVELS.length ? () => load(li + 1) : null,
      });
    }

    // ---------------- 粒子动画
    function spawnParticles(eps, ok, err, req) {
      const n = Math.max(1, Math.round(req / 4));
      for (let i = 0; i < n; i++) {
        if (!eps.length) {
          st.particles.push({ kind: 'drop', t: 0, dur: 0.8, ok: false, jitter: Math.random() });
          continue;
        }
        const p = eps[Math.floor(Math.random() * eps.length)];
        const good = healthy(p) && Math.random() > p.err / Math.max(1e-6, p.rps);
        st.particles.push({ kind: 'req', pod: p.id, t: 0, dur: 0.7 + Math.random() * 0.15, ok: good, jitter: Math.random() });
      }
      if (st.particles.length > 400) st.particles.splice(0, st.particles.length - 400);
    }

    let colors = null;
    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      const g = (v) => cs.getPropertyValue(v).trim();
      colors = { text: g('--text'), muted: g('--muted'), panel: g('--panel2'), border: g('--border2'), ok: g('--ok'), bad: g('--bad'), warn: g('--warn'), accent: g('--accent') };
    }
    function draw(dt) {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const rows = Math.max(6, st.pods.length);
      const rowH = 36;
      const H = 30 + rows * rowH;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.height = H + 'px';
      }
      if (!colors) readColors();
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const narrow = W < 560;
      const svcW = narrow ? 96 : 150;
      const svcH = 96;
      const svcX = 8;
      const svcY = H / 2 - svcH / 2;
      const podX = svcW + (narrow ? 40 : Math.max(90, W * 0.28));
      const podW = W - podX - 8;
      // Service
      c.fillStyle = colors.panel;
      c.strokeStyle = colors.accent;
      c.lineWidth = 1.5;
      roundRect(c, svcX, svcY, svcW, svcH, 10);
      c.fill();
      c.stroke();
      const eps = st.pods.filter((p) => p.phase !== 'Terminating' && isReady(p));
      c.fillStyle = colors.text;
      c.font = `600 ${narrow ? 12 : 14}px ${getComputedStyle(document.body).fontFamily}`;
      c.fillText('Service', svcX + 10, svcY + 22);
      c.font = `${narrow ? 11 : 12}px ui-monospace, Menlo, monospace`;
      c.fillStyle = colors.muted;
      c.fillText('shop:80', svcX + 10, svcY + 40);
      c.fillText(`${RPS} rps`, svcX + 10, svcY + 58);
      c.fillStyle = eps.length ? colors.ok : colors.bad;
      c.fillText(`endpoints: ${eps.length}`, svcX + 10, svcY + 76);
      // Pods
      const order = st.pods.slice().sort((a, b) => a.id - b.id);
      const yOf = {};
      order.forEach((p, i) => {
        const y = 15 + i * rowH;
        yOf[p.id] = y + rowH / 2 - 2;
        const col = VER_COLORS[p.ver];
        c.globalAlpha = p.phase === 'Terminating' ? 0.35 : 1;
        c.fillStyle = colors.panel;
        roundRect(c, podX, y, podW, rowH - 6, 8);
        c.fill();
        c.fillStyle = col;
        roundRect(c, podX, y, 6, rowH - 6, 3);
        c.fill();
        const ready = isReady(p) && p.phase !== 'Terminating';
        c.strokeStyle = ready ? colors.ok : colors.border;
        c.lineWidth = ready ? 1.5 : 1;
        roundRect(c, podX, y, podW, rowH - 6, 8);
        c.stroke();
        c.fillStyle = colors.text;
        c.font = `12px ui-monospace, Menlo, monospace`;
        c.fillText(narrow ? p.ver : `${p.name}`, podX + 14, y + 19);
        let label;
        let lc = colors.muted;
        if (p.phase === 'Running') {
          if (p.broken) {
            label = cfg.probe ? '0/1 NotReady (500)' : 'Ready · 返回 500!';
            lc = colors.bad;
          } else if (p.warm > 0) {
            label = cfg.probe ? `预热中 ${p.warm.toFixed(1)}s` : `Ready · 预热中!`;
            lc = cfg.probe ? colors.warn : colors.bad;
          } else {
            label = `Ready ${p.rps ? Math.round(p.rps) + 'rps' : ''}`;
            lc = p.err > 0.5 ? colors.bad : colors.ok;
          }
        } else label = p.phase;
        c.fillStyle = lc;
        c.textAlign = 'right';
        c.fillText(label, podX + podW - 10, y + 19);
        c.textAlign = 'left';
        if (!narrow) {
          c.fillStyle = col;
          c.fillText(p.ver, podX + podW - 10 - c.measureText(label).width - 34, y + 19);
        }
        c.globalAlpha = 1;
      });
      // 粒子
      const x0 = svcX + svcW;
      const y0 = svcY + svcH / 2;
      st.particles = st.particles.filter((q) => {
        q.t += dt;
        const k = Math.min(1, q.t / q.dur);
        if (q.kind === 'drop') {
          c.fillStyle = colors.bad;
          c.globalAlpha = 1 - k;
          c.beginPath();
          c.arc(x0 + 10 + q.jitter * 30, y0 + k * 60, 3, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = 1;
          return k < 1;
        }
        const ty = yOf[q.pod];
        if (ty == null) return false;
        const x = x0 + (podX - x0) * k;
        const y = y0 + (ty - y0) * (k * k * (3 - 2 * k)) + (q.jitter - 0.5) * 6 * (1 - k);
        c.fillStyle = q.ok ? colors.ok : colors.bad;
        c.beginPath();
        c.arc(x, y, q.ok ? 2.5 : 3, 0, Math.PI * 2);
        c.fill();
        if (k >= 1 && !q.ok && q.t < q.dur + 0.25) {
          c.strokeStyle = colors.bad;
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(podX - 8, ty - 5);
          c.lineTo(podX - 2, ty + 5);
          c.moveTo(podX - 2, ty - 5);
          c.lineTo(podX - 8, ty + 5);
          c.stroke();
        }
        return q.t < q.dur + 0.25;
      });
    }
    function roundRect(c, x, y, w, h2, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h2, r);
      c.arcTo(x + w, y + h2, x, y + h2, r);
      c.arcTo(x, y + h2, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    // ---------------- 面板
    let cfgSig = '';
    function renderCfg() {
      const sig = [st.phase, st.target, cfg.surge, cfg.unavail, cfg.probe].join('|');
      if (sig === cfgSig) return;
      cfgSig = sig;
      const editable = st.phase === 'idle';
      const slider = (key, label, desc) =>
        h(
          'label',
          { class: 'g3r-slider' },
          h('span', { class: 'mono' }, label),
          h('input', {
            type: 'range',
            min: 0,
            max: 4,
            step: 1,
            value: cfg[key],
            disabled: !editable,
            oninput: (e) => {
              cfg[key] = +e.target.value;
              if (cfg.surge === 0 && cfg.unavail === 0) {
                if (key === 'surge') cfg.unavail = 1;
                else cfg.surge = 1;
                KG.toast('maxSurge 和 maxUnavailable 不能同时为 0（否则永远无法推进）', 'info');
              }
              renderCfg();
            },
          }),
          h('b', { class: 'mono' }, cfg[key]),
          h('small', { class: 'muted-text' }, desc)
        );
      KG.fill(
        cfgEl,
        slider('surge', 'maxSurge', '发布时最多多出几个 Pod'),
        slider('unavail', 'maxUnavailable', '发布时最多允许几个 Pod 不可用'),
        h(
          'label',
          { class: 'g3r-check' },
          h('input', {
            type: 'checkbox',
            checked: cfg.probe,
            disabled: !editable,
            onchange: (e) => {
              cfg.probe = e.target.checked;
              renderCfg();
            },
          }),
          h('span', null, h('b', { class: 'mono' }, 'readinessProbe'), ' 通过健康检查后才接流量')
        ),
        h(
          'div',
          { class: 'row gap wrap', style: { marginTop: '6px' } },
          st.phase === 'idle' ? h('button', { class: 'btn primary', onclick: start }, `🚀 发布 ${lv.to}`) : null,
          lv.broken && st.phase === 'rolling' ? h('button', { class: 'btn danger', onclick: rollback, disabled: st.target === lv.from }, st.target === lv.from ? '回滚中…' : '↩ 回滚') : null,
          h('button', { class: 'btn ghost', onclick: () => ((cfgSig = ''), reset()) }, '↺ 重来')
        )
      );
      yamlEl.textContent = `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: shop\nspec:\n  replicas: 4\n  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxSurge: ${cfg.surge}\n      maxUnavailable: ${cfg.unavail}\n  template:\n    spec:\n      containers:\n      - name: shop\n        image: shop:${st.target}${cfg.probe ? '\n        readinessProbe:\n          httpGet: {path: /healthz, port: 8080}\n          periodSeconds: 1' : ''}`;
    }
    function renderStats() {
      const errRate = st.total ? st.errors / st.total : 0;
      KG.fill(
        statsEl,
        h('div', { class: 'g3c-stat' }, h('span', null, '状态'), h('b', null, st.phase === 'idle' ? '待发布' : st.phase === 'done' ? '结束' : st.deadlineNoted ? '卡住了' : '发布中')),
        h('div', { class: 'g3c-stat' }, h('span', null, '请求'), h('b', null, Math.round(st.total))),
        h('div', { class: 'g3c-stat' + (st.errors >= 0.5 ? ' off' : '') }, h('span', null, '失败'), h('b', null, Math.round(st.errors))),
        h('div', { class: 'g3c-stat' + (errRate > 0.02 ? ' off' : '') }, h('span', null, '失败率'), h('b', null, (errRate * 100).toFixed(1) + '%')),
        h('div', { class: 'g3c-stat' }, h('span', null, '耗时'), h('b', null, st.phase === 'idle' ? '—' : ((st.completedAt ?? st.t) - st.started).toFixed(1) + 's'))
      );
      const bars = st.history.slice(-60).map((b) => {
        const tot = b.ok + b.err;
        const e = tot ? b.err / tot : 0;
        return h('span', { style: { height: Math.max(2, e * 100) + '%' }, class: e > 0.001 ? 'bad' : 'ok', title: `失败率 ${(e * 100).toFixed(0)}%` });
      });
      KG.fill(sparkEl, bars.length ? bars : h('div', { class: 'spark-empty' }, '发布开始后，这里显示每秒的失败率'));
    }

    // 模拟按真实时间推进（定时器），画面用 requestAnimationFrame 绘制
    let simAcc = 0;
    let secAcc = 0;
    let uiAcc = 0;
    let last = performance.now();
    sc.interval(() => {
      const now = performance.now();
      const dt = Math.min(1.5, (now - last) / 1000);
      last = now;
      if (st.phase !== 'done') {
        simAcc += dt;
        while (simAcc >= 0.1) {
          simAcc -= 0.1;
          tick(0.1);
          if (st.phase === 'done') break;
          secAcc += 0.1;
          if (secAcc >= 1 - 1e-6) {
            secAcc = 0;
            st.history.push(st.secBucket);
            st.secBucket = { ok: 0, err: 0 };
          }
        }
      }
      uiAcc += dt;
      if (uiAcc > 0.2) {
        uiAcc = 0;
        renderStats();
        renderCfg();
      }
    }, 50);
    sc.raf((dt) => {
      if (canvas.isConnected) draw(dt);
    });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => (colors = null);
    mq.addEventListener('change', onScheme);
    sc.add(() => mq.removeEventListener('change', onScheme));

    host.append(
      KG.levelBar(SAVE, RO_LEVELS.map((l) => ({ ...l, id: 'ro-' + l.id })), li, load),
      h('section', { class: 'panel intro' }, h('h2', null, `第 ${li + 1} 关 · ${lv.title}`), h('p', { html: lv.intro }), KG.goalBox(lv.goals), KG.tip('RollingUpdate 是怎么推进的', 'Deployment 控制器每次同步：<br>① 先扩新 ReplicaSet：总 Pod 数不超过 <code>replicas + maxSurge</code>；<br>② 再缩旧 ReplicaSet：可用 Pod 数不低于 <code>replicas − maxUnavailable</code>。<br>这里的"可用"就是 <b>Ready</b>，而 Ready 由 <b>readinessProbe</b> 决定。Service 也只把流量转发给 Ready 的 Pod（EndpointSlice）。所以 readinessProbe 同时是<b>流量闸门</b>和<b>发布闸门</b>。')),
      h('div', { class: 'g3r-layout' }, h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, '发布策略'), cfgEl, h('details', { class: 'tip', style: { marginTop: '10px' } }, h('summary', null, 'Deployment YAML'), yamlEl)), h('div', { class: 'panel g3r-stage' }, statsEl, canvas, statusLine, h('div', { class: 'panel-title', style: { marginTop: '8px', marginBottom: '4px' } }, '每秒失败率'), sparkEl)),
      log.root
    );
    reset();
  }

  // ================================================================ 入口
  const stars = (ids) => () => ({ got: ids.reduce((a, id) => a + KG.getStars(SAVE, id), 0), total: ids.length * 3 });

  KG.register({
    id: 'selector',
    icon: '🏷️',
    color: '#22d3ee',
    title: '标签选择器',
    tagline: '写 selector 精确圈中目标 Pod，执行后才揭晓结果',
    concepts: ['Label / Selector', 'matchLabels', 'In / NotIn / Exists', 'Service', 'NetworkPolicy', 'PDB'],
    en: { title: 'Label Selectors', tagline: 'Write a selector that picks exactly the target Pods; the result shows when you run it' },
    progress: stars(SEL_LEVELS.map((l) => 'sel-' + l.id)),
    mount: (body) => mountSelector(body),
  });

  KG.register({
    id: 'replicaset',
    icon: '🔁',
    color: '#34d399',
    title: '我是 ReplicaSet',
    tagline: '60 秒内手动维持副本数：误删、扩缩容、节点宕机、驱逐',
    concepts: ['ReplicaSet', '控制循环', 'level-triggered', '节点故障', 'Pod 驱逐'],
    en: { title: 'I Am a ReplicaSet', tagline: 'Hold the replica count by hand for 60 s through deletes, scaling and node failures', concepts: ['ReplicaSet', 'control loop', 'level-triggered', 'node failure', 'Pod eviction'] },
    progress: stars(['ctrl']),
    mount: (body) => mountController(body),
  });

  KG.register({
    id: 'rollout',
    icon: '🚀',
    color: '#34d399',
    title: '滚动更新',
    tagline: '调 maxSurge / maxUnavailable / readinessProbe，看流量在新旧 Pod 间流动',
    concepts: ['Deployment', 'maxSurge / maxUnavailable', 'readinessProbe', '回滚'],
    en: { title: 'Rolling Update', tagline: 'Tune maxSurge, maxUnavailable and readinessProbe; watch traffic shift to new Pods', concepts: ['Deployment', 'maxSurge / maxUnavailable', 'readinessProbe', 'rollback'] },
    progress: stars(RO_LEVELS.map((l) => 'ro-' + l.id)),
    mount: (body) => mountRollout(body),
  });

  // 旧地址 #/concepts/<模式> 转到拆分后的游戏
  KG.aliases.concepts = (sub) => ({ controller: 'replicaset', rollout: 'rollout' })[sub] || 'selector';

  KG._g3 = { SEL_PODS, SEL_LEVELS, matchTerm };
})();
