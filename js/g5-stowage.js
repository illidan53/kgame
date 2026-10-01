/* 小游戏：配载 —— 定副本数和 request / limit，选船、把 Pod 拖上船，让高峰时每艘船的 CPU 和内存都在 60–80%。
 * 节点画成货船：船头吃水 = CPU 使用率，船尾吃水 = 内存使用率，绿色载重线是 60–80%。
 * 规划时船只按 request（申报的重量）下沉——这就是调度器看到的；开船后才按真实用量下沉。 */
(function () {
  'use strict';
  const { h, s, fmtCpu, fmtMem, fmtClock } = KG;
  const Sim = window.KGStowage;
  const GAME = 'stowage';
  const { LEVELS, NODE_TYPES, STEPS, SNAP, BAND } = Sim;
  const DAY_MS = 10000; // 开船时一天播放 10 秒

  const pct = (x) => Math.round(x * 100) + '%';
  const inBand = (x) => x >= BAND[0] - 1e-9 && x <= BAND[1] + 1e-9;
  const clockOf = (t) => fmtClock(Math.min(t, 0.999) * 1440);
  const snap = (v, step, min = step) => Math.max(min, Math.round(v / step) * step);
  const nice = (v, step) => Math.ceil(v / step) * step;
  const unitOf = (a) => a.unit || '用户';

  // ------------------------------------------------------------ 船
  // 本地尺寸：甲板区 40px 在上，船身 52px 在下；吃水从龙骨往上量：使用率 p → 6 + 40p 像素
  const DECK_H = 40;
  const HULL_H = 52;
  const HULL_W = 240;
  const WATER_Y = 104; // 场景里水面的位置
  const draft = (u) => 6 + 40 * Math.min(u, 1.15);
  const markY = (p) => HULL_H - draft(p);

  function hullSvg() {
    const band = (x) => s('rect', { class: 'g5-band', x, y: markY(BAND[1]), width: 8, height: markY(BAND[0]) - markY(BAND[1]) });
    const full = (x) => s('line', { class: 'g5-full', x1: x - 2, x2: x + 10, y1: markY(1), y2: markY(1) });
    return s(
      'svg',
      { class: 'g5-hull', viewBox: `0 0 ${HULL_W} ${HULL_H}`, width: HULL_W, height: HULL_H, 'aria-hidden': 'true' },
      s('path', { class: 'g5-hull-body', d: `M0 0 H${HULL_W} L${HULL_W - 14} ${HULL_H} H22 Z` }),
      s('path', { class: 'g5-hull-rail', d: `M0 0 H${HULL_W} L${HULL_W - 1} 6 H1 Z` }),
      band(12),
      band(HULL_W - 26),
      full(12),
      full(HULL_W - 26),
      s('text', { class: 'g5-hull-label', x: 16, y: markY(BAND[1]) - 3 }, 'CPU'),
      s('text', { class: 'g5-hull-label', x: HULL_W - 22, y: markY(BAND[1]) - 3 }, '内存')
    );
  }

  // 把船沉到使用率 (cpu, mem) 对应的吃水；两头不一样深就倾斜
  function trim(vessel, cpu, mem) {
    const db = draft(cpu);
    const ds = draft(mem);
    const ang = (Math.atan2(ds - db, HULL_W - 40) * 180) / Math.PI;
    const top = WATER_Y + (db + ds) / 2 - (DECK_H + HULL_H);
    vessel.style.transform = `translate(-50%, ${top.toFixed(1)}px) rotate(${ang.toFixed(2)}deg)`;
  }

  // ------------------------------------------------------------ 关卡
  function mount(body) {
    let sc = null;
    let idx = Math.min(KG.store.get('g5:last', 0), LEVELS.length - 1);
    function load(i) {
      if (sc) sc.dispose();
      sc = KG.scope();
      idx = i;
      KG.store.set('g5:last', i);
      KG.clear(body);
      playLevel(body, i, sc, load);
    }
    load(idx);
    return () => sc && sc.dispose();
  }

  function playLevel(body, li, sc, load) {
    const lv = LEVELS[li];
    const APPS = Object.fromEntries(lv.apps.map((a) => [a.id, a]));
    let plan = Sim.defaultPlan(lv);
    let phase = 'plan'; // plan | sail | done
    let res = null;
    let shown = 0; // 已经播报过的事件数
    let playing = false;
    let picked = null; // 点选模式：{ app, from }
    let t = 0;

    // 规划时，侧栏停在流量最高的时刻
    let peakT = 0;
    {
      let best = -1;
      for (let i = 0; i < STEPS; i++) {
        const u = lv.apps.reduce((sum, a) => sum + Sim.usersAt(a, i / STEPS) / a.users, 0);
        if (u > best) (best = u), (peakT = i / STEPS);
      }
    }
    t = peakT;

    const log = KG.eventLog('kubectl get events -w');
    const running = (id) => plan.nodes.reduce((n, node) => n + node.pods.filter((p) => p === id).length, 0);
    const docked = (id) => plan.apps[id].replicas - running(id);
    const peakOf = (id) => Sim.peakPerPod(APPS[id], plan.apps[id].replicas);

    // 改了任何规划，就回到规划阶段
    function edited() {
      if (phase !== 'plan') {
        phase = 'plan';
        playing = false;
        res = null;
        t = peakT;
        log.clear();
      }
      renderAll();
    }

    // ------------------------------------------------------------ 侧栏：流量 → 用量
    const crowd = s('svg', { class: 'g5-crowd', viewBox: '0 0 300 86', 'aria-hidden': 'true' });
    const dayChart = s('svg', { class: 'g5-day', viewBox: '0 0 300 96', 'aria-label': '一天的流量' });
    const fitCpu = s('svg', { class: 'g5-fit', viewBox: '0 0 300 132', 'aria-label': '每个 Pod 的 CPU 随用户数' });
    const fitMem = s('svg', { class: 'g5-fit', viewBox: '0 0 300 132', 'aria-label': '每个 Pod 的内存随用户数' });
    const clockEl = h('span', { class: 'g5-clock mono' });
    const usersEl = h('span', { class: 'g5-users' });
    const side = h(
      'aside',
      { class: 'panel g5-side' },
      h('div', { class: 'panel-title' }, '流量 → 用量'),
      crowd,
      h('div', { class: 'g5-now' }, clockEl, usersEl),
      dayChart,
      fitCpu,
      fitMem,
      h(
        'ul',
        { class: 'g5-formulas mono' },
        lv.apps.map((a) =>
          h(
            'li',
            { style: { '--c': a.color } },
            h('b', null, a.id),
            ` CPU = ${a.cpu[0]}m + ${a.cpu[1]}m × ${unitOf(a)}/Pod`,
            h('br'),
            ` 内存 = ${a.mem[0]}Mi + ${a.mem[1]}Mi × ${unitOf(a)}/Pod`
          )
        )
      )
    );

    const dots = [];
    function drawCrowd(dt) {
      const load = lv.apps.reduce((sum, a) => sum + Sim.usersAt(a, t) / a.users, 0) / lv.apps.length;
      if (Math.random() < (4 + 60 * load) * dt) dots.push({ x: -4, y: 10 + Math.random() * 66, v: 50 + Math.random() * 40, r: 1.6 + Math.random() * 1.4, c: lv.apps[Math.floor(Math.random() * lv.apps.length)].color });
      for (const d of dots) d.x += d.v * dt;
      while (dots.length && dots[0].x > 250) dots.shift();
      crowd.innerHTML =
        `<rect class="g5-crowd-bg" width="300" height="86" rx="10"/>` +
        dots.map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(1)}" fill="${d.c}" opacity=".75"/>`).join('') +
        `<path class="g5-svc" d="M246 8 L292 32 L292 54 L246 78 Z"/><text class="g5-svc-text" x="270" y="47" text-anchor="middle">Service</text>`;
    }

    function drawDay() {
      const x0 = 30;
      const w = 262;
      const y0 = 78;
      const hh = 66;
      let out = '';
      const maxU = Math.max(...lv.apps.map((a) => a.users));
      for (const a of lv.apps) {
        let d = '';
        for (let i = 0; i <= 96; i++) d += `${i ? 'L' : 'M'}${(x0 + (i / 96) * w).toFixed(1)} ${(y0 - (Sim.usersAt(a, i / 96) / maxU) * hh).toFixed(1)}`;
        out += `<path d="${d}" fill="none" stroke="${a.color}" stroke-width="2"/>`;
      }
      const px = x0 + t * w;
      out += `<line class="g5-cursor" x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${y0 - hh - 4}" y2="${y0}"/>`;
      out += `<text class="g5-axis" x="2" y="${y0 - hh + 4}">${maxU >= 1000 ? maxU / 1000 + 'k' : maxU}</text><text class="g5-axis" x="2" y="${y0}">0</text>`;
      out += ['0', '6', '12', '18', '24'].map((l, i) => `<text class="g5-axis" x="${x0 + (i / 4) * w}" y="${y0 + 13}" text-anchor="middle">${l}h</text>`).join('');
      dayChart.innerHTML = out;
      clockEl.textContent = clockOf(t) + (phase === 'plan' ? ' 高峰' : '');
      const total = lv.apps.map((a) => `${a.id} ${Math.round(Sim.usersAt(a, t)).toLocaleString()}`).join(' · ');
      usersEl.textContent = total;
    }

    // 拟合线：横轴是每个 Pod 分到的用户数，圆点是当前副本数下此刻的位置
    function drawFit(svg, key) {
      const x0 = 40;
      const w = 250;
      const y0 = 112;
      const hh = 88;
      const xMax = nice(Math.max(...lv.apps.map((a) => (a.users / plan.apps[a.id].replicas) * 1.6)), 500);
      const yMax = nice(Math.max(...lv.apps.map((a) => a[key][0] + a[key][1] * xMax)), key === 'cpu' ? 500 : 512);
      const X = (u) => x0 + (Math.min(u, xMax) / xMax) * w;
      const Y = (v) => y0 - (Math.min(v, yMax) / yMax) * hh;
      let out = `<text class="g5-fit-title" x="${x0}" y="12">每个 Pod 的${key === 'cpu' ? ' CPU' : '内存'}</text>`;
      out += `<line class="g5-grid" x1="${x0}" y1="${y0}" x2="${x0 + w}" y2="${y0}"/><line class="g5-grid" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - hh}"/>`;
      out += `<text class="g5-axis" x="${x0 - 4}" y="${y0 - hh + 4}" text-anchor="end">${key === 'cpu' ? fmtCpu(yMax) : fmtMem(yMax)}</text>`;
      out += `<text class="g5-axis" x="${x0 + w}" y="${y0 + 13}" text-anchor="end">${xMax.toLocaleString()} ${lv.apps.length === 1 ? unitOf(lv.apps[0]) : '用户'}/Pod</text>`;
      for (const a of lv.apps) {
        const n = phase === 'plan' ? plan.apps[a.id].replicas : Math.max(1, running(a.id));
        const u = Sim.usersAt(a, t) / n;
        const v = a[key][0] + a[key][1] * u;
        out += `<line x1="${X(0)}" y1="${Y(a[key][0]).toFixed(1)}" x2="${X(xMax)}" y2="${Y(a[key][0] + a[key][1] * xMax).toFixed(1)}" stroke="${a.color}" stroke-width="2.2" stroke-linecap="round"/>`;
        out += `<circle cx="${X(u).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4.5" fill="var(--panel)" stroke="${a.color}" stroke-width="2.4"/>`;
      }
      svg.innerHTML = out;
    }

    // ------------------------------------------------------------ Deployment：副本数和资源框
    // 资源框：宽 = CPU，高 = 内存。虚线框是 request，实线框是 limit，实心块是用量（规划时是高峰，开船后是此刻）
    const appCards = lv.apps.map((a) => appCard(a));

    function appCard(a) {
      const cfg = () => plan.apps[a.id];
      const W = 250;
      const H = 150;
      const O = { x: 34, y: 130 };
      let scale = null;
      const svg = s('svg', { class: 'g5-box', viewBox: `0 0 ${W} ${H}`, 'aria-label': `${a.id} 的 request 和 limit` });
      const repEl = h('span', { class: 'g5-rep mono' });
      const warnEl = h('div', { class: 'g5-warn' });
      const inputs = {};
      const field = (kind, res, label) => {
        const el = h('input', {
          type: 'number',
          class: 'g5-num mono',
          step: SNAP[res],
          min: SNAP[res],
          'aria-label': `${a.id} ${label}`,
          onchange: (e) => {
            setVal(kind, res, Number(e.target.value) || SNAP[res]);
            if (kind === 'req') evictOverflow(a.id);
            edited();
          },
        });
        inputs[kind + res] = el;
        return h('label', { class: 'g5-field' }, h('span', null, label), el, h('span', { class: 'g5-unit' }, res === 'cpu' ? 'm' : 'Mi'));
      };
      function setVal(kind, res, v) {
        const c = cfg();
        v = snap(v, SNAP[res]);
        c[kind][res] = v;
        // limit 不能小于 request
        if (kind === 'req' && c.lim[res] < v) c.lim[res] = v;
        if (kind === 'lim' && c.req[res] > v) c.req[res] = v;
      }
      function rescale() {
        const c = cfg();
        const p = peakOf(a.id);
        scale = { cpu: nice(Math.max(p.cpu * 1.35, c.lim.cpu * 1.1, 400), 250), mem: nice(Math.max(p.mem * 1.35, c.lim.mem * 1.1, 512), 256) };
      }
      const X = (v) => O.x + (v / scale.cpu) * (W - O.x - 10);
      const Y = (v) => O.y - (v / scale.mem) * (O.y - 10);

      function draw(live) {
        if (!scale) rescale();
        const c = cfg();
        const p = peakOf(a.id);
        let out = `<line class="g5-grid" x1="${O.x}" y1="${O.y}" x2="${W - 6}" y2="${O.y}"/><line class="g5-grid" x1="${O.x}" y1="${O.y}" x2="${O.x}" y2="6"/>`;
        out += `<text class="g5-axis" x="${W - 6}" y="${O.y + 13}" text-anchor="end">CPU ${fmtCpu(scale.cpu)}</text><text class="g5-axis" x="${O.x - 4}" y="14" text-anchor="end">内存</text><text class="g5-axis" x="${O.x - 4}" y="25" text-anchor="end">${fmtMem(scale.mem)}</text>`;
        // 用量
        if (live) {
          const throttled = live.cpu > c.lim.cpu;
          const oom = live.mem > c.lim.mem;
          const over = live.mem > c.req.mem;
          out += `<rect class="g5-peak-ghost" x="${O.x}" y="${Y(p.mem).toFixed(1)}" width="${(X(p.cpu) - O.x).toFixed(1)}" height="${(O.y - Y(p.mem)).toFixed(1)}"/>`;
          out += `<rect class="g5-use${throttled || oom || over ? ' bad' : ''}" x="${O.x}" y="${Y(Math.min(live.mem, c.lim.mem)).toFixed(1)}" width="${(X(Math.min(live.cpu, c.lim.cpu)) - O.x).toFixed(1)}" height="${(O.y - Y(Math.min(live.mem, c.lim.mem))).toFixed(1)}" fill="${a.color}"/>`;
          out += `<text class="g5-use-text" x="${O.x + 5}" y="${O.y - 5}">${fmtCpu(live.cpu)} / ${fmtMem(live.mem)}</text>`;
        } else {
          out += `<rect class="g5-use peak" x="${O.x}" y="${Y(p.mem).toFixed(1)}" width="${(X(p.cpu) - O.x).toFixed(1)}" height="${(O.y - Y(p.mem)).toFixed(1)}" fill="${a.color}"/>`;
          out += `<text class="g5-use-text" x="${O.x + 5}" y="${O.y - 5}">高峰 ${fmtCpu(p.cpu)} / ${fmtMem(p.mem)}</text>`;
        }
        out += `<rect class="g5-lim" x="${O.x}" y="${Y(c.lim.mem).toFixed(1)}" width="${(X(c.lim.cpu) - O.x).toFixed(1)}" height="${(O.y - Y(c.lim.mem)).toFixed(1)}"/>`;
        out += `<rect class="g5-req" x="${O.x}" y="${Y(c.req.mem).toFixed(1)}" width="${(X(c.req.cpu) - O.x).toFixed(1)}" height="${(O.y - Y(c.req.mem)).toFixed(1)}"/>`;
        out += `<circle class="g5-handle req" data-kind="req" cx="${X(c.req.cpu).toFixed(1)}" cy="${Y(c.req.mem).toFixed(1)}" r="6"/>`;
        out += `<rect class="g5-handle lim" data-kind="lim" x="${(X(c.lim.cpu) - 6).toFixed(1)}" y="${(Y(c.lim.mem) - 6).toFixed(1)}" width="12" height="12" rx="2"/>`;
        svg.innerHTML = out;
      }

      // 拖动角上的把手调整 request / limit
      svg.addEventListener('pointerdown', (e) => {
        const kind = e.target.dataset && e.target.dataset.kind;
        if (!kind) return;
        e.preventDefault();
        svg.setPointerCapture(e.pointerId);
        const r = svg.getBoundingClientRect();
        const toVal = (ev) => {
          const x = ((ev.clientX - r.left) / r.width) * W;
          const y = ((ev.clientY - r.top) / r.height) * H;
          return { cpu: ((x - O.x) / (W - O.x - 10)) * scale.cpu, mem: ((O.y - y) / (O.y - 10)) * scale.mem };
        };
        const move = (ev) => {
          const v = toVal(ev);
          setVal(kind, 'cpu', Math.min(v.cpu, scale.cpu));
          setVal(kind, 'mem', Math.min(v.mem, scale.mem));
          if (phase !== 'plan') edited();
          else renderAll(true);
        };
        const up = () => {
          svg.removeEventListener('pointermove', move);
          // 松手时再检查：request 变大后船上装不下的退回码头
          if (kind === 'req') evictOverflow(a.id);
          rescale();
          edited();
        };
        svg.addEventListener('pointermove', move);
        svg.addEventListener('pointerup', up, { once: true });
        svg.addEventListener('pointercancel', up, { once: true });
      });

      const card = h(
        'div',
        { class: 'panel g5-app', style: { '--c': a.color } },
        h(
          'div',
          { class: 'g5-app-head' },
          h('span', { class: 'g5-swatch' }),
          h('b', { class: 'mono' }, a.id),
          h('span', { class: 'g5-app-kind' }, 'Deployment'),
          h(
            'div',
            { class: 'g5-stepper' },
            h('button', { class: 'btn small', 'aria-label': `${a.id} 减少副本`, onclick: () => setReplicas(a.id, cfg().replicas - 1) }, '−'),
            repEl,
            h('button', { class: 'btn small', 'aria-label': `${a.id} 增加副本`, onclick: () => setReplicas(a.id, cfg().replicas + 1) }, '+')
          )
        ),
        svg,
        h('div', { class: 'g5-fields' }, field('req', 'cpu', 'request CPU'), field('req', 'mem', 'request 内存'), field('lim', 'cpu', 'limit CPU'), field('lim', 'mem', 'limit 内存')),
        warnEl
      );

      return {
        card,
        rescale,
        render(dragging) {
          const c = cfg();
          repEl.textContent = `${c.replicas} 副本`;
          for (const k in inputs) if (document.activeElement !== inputs[k]) inputs[k].value = c[k.slice(0, 3)][k.slice(3)];
          if (!dragging) rescale();
          const live = phase === 'plan' ? null : Sim.podUsage(a, Sim.usersAt(a, t) / Math.max(1, running(a.id)));
          draw(live);
          // 规划时就提醒：拿高峰用量对比 request / limit
          const p = peakOf(a.id);
          const notes = [];
          if (p.mem > c.lim.mem) notes.push(['bad', `内存 limit ${fmtMem(c.lim.mem)} 低于高峰 ${fmtMem(p.mem)}：会 OOMKilled`]);
          else if (p.mem > c.req.mem) notes.push(['warn', `内存 request 盖不住高峰 ${fmtMem(p.mem)}：节点紧张时会先被驱逐`]);
          if (p.cpu > c.lim.cpu) notes.push(['warn', `CPU limit 低于高峰 ${fmtCpu(p.cpu)}：会被节流`]);
          KG.fill(warnEl, notes.map(([cls, txt]) => h('div', { class: cls + '-text' }, txt)));
        },
      };
    }

    function setReplicas(id, n) {
      n = Math.max(1, Math.min(Sim.MAX_REPLICAS, n));
      const c = plan.apps[id];
      // 减副本：先从码头拿走，不够再从最后一艘装着它的船上卸下
      while (c.replicas > n) {
        if (docked(id) <= 0) {
          const k = plan.nodes.map((node) => node.pods.includes(id)).lastIndexOf(true);
          plan.nodes[k].pods.splice(plan.nodes[k].pods.lastIndexOf(id), 1);
        }
        c.replicas--;
      }
      c.replicas = n;
      edited();
    }

    // request 调大以后，船上装不下的 Pod 退回码头
    function evictOverflow(id) {
      let back = 0;
      for (const node of plan.nodes) {
        const T = NODE_TYPES[node.type];
        for (;;) {
          const r = Sim.reserved(lv, plan, node);
          if ((r.cpu <= T.cpu && r.mem <= T.mem) || !node.pods.includes(id)) break;
          node.pods.splice(node.pods.lastIndexOf(id), 1);
          back++;
        }
      }
      if (back) KG.toast(`${back} 个 ${id} Pod 的 request 变大，船上装不下，退回了码头`, 'warn');
    }

    // ------------------------------------------------------------ 港口：码头、船坞、船队
    const dockEl = h('div', { class: 'g5-dock', role: 'button', tabindex: '0', 'aria-label': '码头：没装船的 Pod' });
    const fleetEl = h('div', { class: 'g5-fleet' });
    const costEl = h('span', { class: 'g5-cost' });
    const yard = h(
      'div',
      { class: 'g5-yard' },
      lv.nodeTypes.map((id) => {
        const T = NODE_TYPES[id];
        return h(
          'button',
          {
            class: 'btn g5-buy',
            onclick: () => {
              plan.nodes.push({ type: id, pods: [] });
              edited();
            },
          },
          h('b', null, '+ ', T.name),
          h('span', { class: 'mono' }, `${T.cpu / 1000} 核 · ${T.mem / 1024}Gi · ¥${T.price}`)
        );
      })
    );
    const harbor = h(
      'section',
      { class: 'panel g5-harbor' },
      h('div', { class: 'g5-harbor-head' }, h('div', { class: 'panel-title' }, '港口'), costEl),
      h('div', { class: 'g5-yard-row' }, h('span', { class: 'muted-text' }, '船坞：'), yard),
      dockEl,
      fleetEl
    );

    const podChip = (id, from) =>
      h(
        'button',
        {
          class: 'g5-pod' + (picked && picked.app === id && picked.from === from ? ' picked' : ''),
          style: { '--c': APPS[id].color },
          'data-app': id,
          title: `${id}：request ${fmtCpu(plan.apps[id].req.cpu)} / ${fmtMem(plan.apps[id].req.mem)}`,
          'aria-label': `${id} Pod${from === 'dock' ? '，在码头' : `，在第 ${from + 1} 艘船上`}`,
          onpointerdown: (e) => grab(e, id, from),
          onclick: (e) => {
            if (e.detail === 0) pick(id, from);
          },
        },
        h('span', { class: 'g5-pod-label' }, id[0].toUpperCase())
      );

    function renderDock() {
      const chips = [];
      for (const a of lv.apps) for (let i = 0; i < docked(a.id); i++) chips.push(podChip(a.id, 'dock'));
      KG.fill(dockEl, h('span', { class: 'g5-dock-label' }, '码头'), chips.length ? chips : h('span', { class: 'muted-text' }, '全部装船了'));
    }

    const ships = [];
    function renderFleet() {
      ships.length = 0;
      KG.fill(
        fleetEl,
        plan.nodes.length
          ? plan.nodes.map((node, k) => {
              const T = NODE_TYPES[node.type];
              const vessel = h('div', { class: 'g5-vessel' }, h('div', { class: 'g5-deck' }, node.pods.map((id) => podChip(id, k))), hullSvg());
              const meter = (label) => {
                const fill = h('span', { class: 'g5-meter-fill' });
                const text = h('span', { class: 'g5-meter-text mono' });
                return { el: h('div', { class: 'g5-meter' }, h('span', { class: 'g5-meter-label' }, label), h('span', { class: 'g5-meter-bar' }, h('span', { class: 'g5-meter-band' }), fill), text), fill, text };
              };
              const mc = meter('CPU');
              const mm = meter('内存');
              const el = h(
                'div',
                {
                  class: 'g5-ship',
                  role: 'button',
                  tabindex: '0',
                  'data-k': k,
                  'aria-label': `第 ${k + 1} 艘船，${T.name}`,
                  onclick: (e) => {
                    if (picked && !e.target.closest('.g5-pod, .g5-ship-x')) drop(picked.app, picked.from, k);
                  },
                  onkeydown: (e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && picked && e.target === e.currentTarget) {
                      e.preventDefault();
                      drop(picked.app, picked.from, k);
                    }
                  },
                },
                h(
                  'div',
                  { class: 'g5-ship-head' },
                  h('b', null, `#${k + 1} ${T.name}`),
                  h('span', { class: 'mono muted-text' }, `${T.cpu / 1000} 核 · ${T.mem / 1024}Gi`),
                  h(
                    'button',
                    {
                      class: 'g5-ship-x',
                      'aria-label': `拆掉第 ${k + 1} 艘船`,
                      title: '拆掉这艘船，货物退回码头',
                      onclick: () => {
                        plan.nodes.splice(k, 1);
                        edited();
                      },
                    },
                    '✕'
                  )
                ),
                h('div', { class: 'g5-scene' }, vessel, h('div', { class: 'g5-sea' }), h('div', { class: 'g5-alert' }, '超载')),
                h('div', { class: 'g5-meters' }, mc.el, mm.el)
              );
              ships.push({ el, vessel, mc, mm, node, T });
              return el;
            })
          : h('div', { class: 'empty' }, '还没有船。从上面的船坞造一艘。')
      );
      updateShips();
    }

    // 船的吃水：规划时按 request（调度器看到的），开船后按真实用量
    function updateShips() {
      const step = Math.min(STEPS - 1, Math.floor(t * STEPS));
      ships.forEach((sh, k) => {
        let cpu;
        let mem;
        if (phase === 'plan' || !res) {
          const r = Sim.reserved(lv, plan, sh.node);
          cpu = r.cpu / sh.T.cpu;
          mem = r.mem / sh.T.mem;
        } else {
          cpu = res.nodes[k].cpu[step];
          mem = res.nodes[k].mem[step];
        }
        trim(sh.vessel, cpu, mem);
        sh.el.classList.toggle('overload', cpu > 1 || mem > 1);
        const set = (m, v, peak) => {
          m.fill.style.width = Math.min(v, 1.2) * (100 / 1.2) + '%';
          m.fill.className = 'g5-meter-fill' + (v > 1 ? ' bad' : inBand(v) ? ' ok' : '');
          m.text.textContent = (phase === 'plan' ? '申报 ' : '') + pct(v) + (peak != null ? ` · 峰 ${pct(peak)}` : '');
        };
        const done = phase === 'done' && res;
        set(sh.mc, cpu, done ? res.nodes[k].peakCpu : null);
        set(sh.mm, mem, done ? res.nodes[k].peakMem : null);
      });
      const spend = Sim.cost(plan);
      costEl.textContent = `花费 ¥${spend} / 预算 ¥${lv.budget}`;
      costEl.classList.toggle('bad-text', spend > lv.budget);
    }

    // ------------------------------------------------------------ 拖放和点选
    function moveOk(id, from, k) {
      if (from === k) return { ok: true };
      if (typeof from === 'number') plan.nodes[from].pods.splice(plan.nodes[from].pods.lastIndexOf(id), 1);
      const fit = Sim.canPlace(lv, plan, plan.nodes[k], id);
      if (typeof from === 'number') plan.nodes[from].pods.push(id);
      return fit;
    }
    function drop(id, from, to) {
      picked = null;
      if (to === 'dock') {
        if (typeof from === 'number') plan.nodes[from].pods.splice(plan.nodes[from].pods.lastIndexOf(id), 1);
        return edited();
      }
      if (from === to) return renderAll();
      const fit = moveOk(id, from, to);
      if (!fit.ok) {
        const why = fit.lack.map((l) => `${l.res === 'cpu' ? 'CPU' : '内存'}还能申报 ${l.res === 'cpu' ? fmtCpu(l.free) : fmtMem(l.free)}，这个 Pod 要 ${l.res === 'cpu' ? fmtCpu(l.need) : fmtMem(l.need)}`).join('；');
        KG.toast(`装不下：${why}`, 'warn', 3200);
        const el = fleetEl.querySelector(`.g5-ship[data-k="${to}"]`);
        KG.shake(el);
        return renderAll();
      }
      if (typeof from === 'number') plan.nodes[from].pods.splice(plan.nodes[from].pods.lastIndexOf(id), 1);
      plan.nodes[to].pods.push(id);
      edited();
    }
    function pick(id, from) {
      picked = picked && picked.app === id && picked.from === from ? null : { app: id, from };
      renderAll();
      if (picked) KG.toast('再点一艘船装上去，或者点码头卸下来', 'info', 1800);
    }
    dockEl.addEventListener('click', (e) => {
      if (picked && !e.target.closest('.g5-pod')) drop(picked.app, picked.from, 'dock');
    });
    dockEl.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && picked && e.target === dockEl) {
        e.preventDefault();
        drop(picked.app, picked.from, 'dock');
      }
    });

    function targetAt(x, y) {
      const el = document.elementFromPoint(x, y);
      const ship = el && el.closest('.g5-ship');
      if (ship && fleetEl.contains(ship)) return Number(ship.dataset.k);
      if (el && el.closest('.g5-dock') === dockEl) return 'dock';
      return null;
    }
    function grab(e, id, from) {
      if (e.button !== 0) return;
      const chip = e.currentTarget;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let ghost = null;
      let over = null;
      const mark = (to) => {
        if (over === to) return;
        if (over != null) (over === 'dock' ? dockEl : fleetEl.querySelector(`.g5-ship[data-k="${over}"]`))?.classList.remove('drop-ok', 'drop-no');
        over = to;
        if (to == null) return;
        const el = to === 'dock' ? dockEl : fleetEl.querySelector(`.g5-ship[data-k="${to}"]`);
        el?.classList.add(to === 'dock' || moveOk(id, from, to).ok ? 'drop-ok' : 'drop-no');
      };
      const move = (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
          ghost = h('div', { class: 'g5-ghost', style: { '--c': APPS[id].color } }, id);
          document.body.appendChild(ghost);
          chip.classList.add('lifting');
          sc.add(() => ghost && ghost.remove());
        }
        ghost.style.transform = `translate(${ev.clientX - 22}px, ${ev.clientY - 14}px)`;
        mark(targetAt(ev.clientX, ev.clientY));
      };
      const end = (ev) => {
        chip.removeEventListener('pointermove', move);
        chip.removeEventListener('pointerup', end);
        chip.removeEventListener('pointercancel', end);
        if (!ghost) return ev.type === 'pointerup' && pick(id, from);
        ghost.remove();
        ghost = null;
        mark(null);
        const to = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
        if (to == null) return renderAll();
        drop(id, from, to);
      };
      try {
        chip.setPointerCapture(e.pointerId);
      } catch (err) {
        /* 指针已经抬起 */
      }
      chip.addEventListener('pointermove', move);
      chip.addEventListener('pointerup', end);
      chip.addEventListener('pointercancel', end);
    }
    const onKey = (e) => {
      if (e.key === 'Escape' && picked) {
        picked = null;
        renderAll();
      }
    };
    document.addEventListener('keydown', onKey);
    sc.add(() => document.removeEventListener('keydown', onKey));

    // ------------------------------------------------------------ 开船
    const ctrlEl = h('div', { class: 'row gap wrap' });
    const scrub = h('input', {
      type: 'range',
      class: 'g5-scrub',
      min: 0,
      max: 1000,
      'aria-label': '一天中的时间',
      oninput: (e) => {
        if (phase !== 'done') return;
        t = Number(e.target.value) / 1000;
        renderLive();
      },
    });
    function sail() {
      res = Sim.simulate(lv, plan);
      phase = 'sail';
      playing = true;
      shown = 0;
      t = 0;
      picked = null;
      log.clear();
      const ships = plan.nodes.map((n, k) => `#${k + 1} ${NODE_TYPES[n.type].name}`).join('、') || '没有船';
      log.add('Normal', 'Sailing', null, `${ships}，开船。${res.placed < res.total ? `还有 ${res.total - res.placed} 个 Pod 在码头（Pending），它们的用户会挤到其他副本上。` : ''}`, '00:00');
      renderAll();
    }
    const REASON = {
      oom: (e) => ['Warning', 'OOMKilled', `pod/${e.app}`, `内存超过 limit ${fmtMem(plan.apps[e.app].lim.mem)}，容器被杀掉重启`],
      overReq: (e) => ['Warning', 'Evictable', `pod/${e.app}`, `内存用量超过 request ${fmtMem(plan.apps[e.app].req.mem)}：节点一紧张，它会最先被驱逐`],
      throttle: (e) => ['Warning', 'CPUThrottling', `pod/${e.app}`, `CPU 想用的超过 limit ${fmtCpu(plan.apps[e.app].lim.cpu)}，被节流，请求变慢`],
      overload: (e) => ['Warning', 'NodeOverloaded', `node/#${e.node + 1}`, '实际用量超过可分配量：超载'],
    };
    function flushEvents() {
      if (!res) return;
      const step = Math.floor(t * STEPS);
      while (shown < res.events.length && res.events[shown].step <= step) {
        const e = res.events[shown++];
        const [type, reason, obj, msg] = REASON[e.kind](e);
        log.add(type, reason, obj, msg, clockOf(e.step / STEPS));
        if (e.app) fleetEl.querySelectorAll(`.g5-pod[data-app="${e.app}"]`).forEach((p) => p.classList.add(e.kind === 'oom' ? 'oom' : 'warn'));
      }
    }
    function finish() {
      phase = 'done';
      playing = false;
      t = peakT;
      scrub.value = Math.round(t * 1000);
      renderAll();
      const issues = [...new Set(res.events.map((e) => (e.app ? `${e.app} ${REASON[e.kind](e)[1]}` : `#${e.node + 1} 超载`)))];
      if (res.placed < res.total) issues.unshift(`${res.total - res.placed} 个 Pod 没装船`);
      const goals = [
        { text: '全部装船，一天里没有 OOMKilled、节流、内存超 request、超载', ok: res.safe, note: issues.length ? issues.join('；') : null },
        {
          text: '高峰时每艘船的 CPU 和内存都在 60–80%',
          ok: res.full,
          note: res.nodes.map((n, k) => `#${k + 1} ${NODE_TYPES[n.type].name}：CPU ${pct(n.peakCpu)}，内存 ${pct(n.peakMem)}`).join('；') || '没有船',
        },
        { text: `花费不超过预算 ¥${lv.budget}`, ok: res.cheap, note: `花费 ¥${res.spend}` },
      ];
      KG.showResult({
        game: GAME,
        level: lv.id,
        stars: res.stars,
        goals,
        extra: KG.tip('参考思路', lv.debrief, res.stars === 3),
        onRetry: () => edited(),
        onNext: li + 1 < LEVELS.length ? () => load(li + 1) : null,
      });
    }
    sc.raf((dt) => {
      drawCrowd(dt);
      if (phase === 'sail' && playing) {
        t += (dt * 1000) / DAY_MS;
        if (t >= 1) {
          t = 1;
          flushEvents();
          return finish();
        }
        renderLive();
        flushEvents();
      }
    });

    function renderCtrl() {
      const left = lv.apps.reduce((n, a) => n + docked(a.id), 0);
      KG.fill(
        ctrlEl,
        phase === 'plan'
          ? [
              h('button', { class: 'btn primary', onclick: sail }, '⛵ 开船：跑一天'),
              left ? h('span', { class: 'warn-text' }, `码头上还有 ${left} 个 Pod`) : null,
              h(
                'button',
                {
                  class: 'btn ghost small',
                  onclick: () => {
                    plan = Sim.defaultPlan(lv);
                    appCards.forEach((c) => c.rescale());
                    edited();
                  },
                },
                '全部重来'
              ),
            ]
          : phase === 'sail'
          ? [
              h('button', { class: 'btn', onclick: () => ((playing = !playing), renderCtrl()) }, playing ? '⏸ 暂停' : '▶ 继续'),
              h(
                'button',
                {
                  class: 'btn ghost',
                  onclick: () => {
                    t = 1;
                    flushEvents();
                    finish();
                  },
                },
                '⏭ 直接看结果'
              ),
            ]
          : [h('button', { class: 'btn primary', onclick: () => edited() }, '✎ 回去调整'), h('button', { class: 'btn', onclick: sail }, '⛵ 再开一次'), h('span', { class: 'muted-text' }, '拖动时间看一天里的变化'), scrub]
      );
    }

    // 每帧只更新会动的部分
    function renderLive() {
      drawDay();
      drawFit(fitCpu, 'cpu');
      drawFit(fitMem, 'mem');
      appCards.forEach((c) => c.render(true));
      updateShips();
    }
    function renderAll(dragging) {
      appCards.forEach((c) => c.render(dragging));
      renderDock();
      renderFleet();
      renderCtrl();
      drawDay();
      drawFit(fitCpu, 'cpu');
      drawFit(fitMem, 'mem');
    }

    body.append(
      KG.levelBar(GAME, LEVELS, li, load),
      h(
        'section',
        { class: 'panel intro' },
        h('h2', null, `第 ${li + 1} 关 · ${lv.title}`),
        h('p', { html: lv.intro }),
        KG.goalBox(['全部装船，一天里没有事故', '高峰时每艘船的 CPU 和内存都在 60–80%', `花费不超过 ¥${lv.budget}`]),
        KG.tip(lv.tip.title, lv.tip.html)
      ),
      h(
        'div',
        { class: 'g5-layout' },
        side,
        h('div', { class: 'g5-main' }, h('div', { class: 'g5-apps' + (lv.apps.length === 1 ? ' single' : '') }, appCards.map((c) => c.card)), h('div', { class: 'toolbar sticky' }, ctrlEl), harbor, log.root)
      )
    );
    renderAll();
  }

  KG.register({
    id: GAME,
    icon: '🚢',
    glyph: 'ship',
    color: '#60a5fa',
    title: '配载',
    tagline: '定副本数和 request / limit，选船装船，让高峰时 CPU 和内存都在 60–80%',
    blurb: '让每艘船高峰时刚好装到七成',
    concepts: ['request vs limit', '用量随流量增长', '容量规划', '二维装箱', 'CPU 超卖'],
    en: {
      title: 'Stowage',
      tagline: 'Size replicas, requests and limits, then load ships so peak CPU and memory sit at 60–80%',
      blurb: 'Load every ship to about 70% at peak',
      concepts: ['request vs limit', 'usage grows with traffic', 'capacity planning', '2-D bin packing', 'CPU overcommit'],
    },
    progress: () => ({ got: LEVELS.reduce((a, l) => a + KG.getStars(GAME, l.id), 0), total: LEVELS.length * 3 }),
    mount,
  });
})();
