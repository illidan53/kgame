/* 小游戏 2：OOM 求生记 —— 设置 request / limit，撑过模拟的 24 小时 */
(function () {
  'use strict';
  const { h, s, fmtMem, fmtCpu, fmtClock } = KG;
  const Sim = window.KGSim;
  const GAME = 'resources';
  const LEVELS = Sim.LEVELS;
  const DAY = Sim.DAY;
  const DT = Sim.DT;

  const DEBRIEF = {
    m1: 'request 设在常态用量附近（约 320～550Mi），limit 设在峰值 553Mi 之上并留点余量（约 600～768Mi）。<br>limit 太低时，容器一到高峰就 OOMKilled；如果重启时高峰还没过去，它会马上再被杀，重启间隔按 10s→20s→40s… 指数退避，最长 5 分钟（模拟中按比例放大了），这就是 <code>CrashLoopBackOff</code>。',
    m2: '有两种思路：<br>① 给 api、worker 设足 request（不低于各自峰值）。它们的用量不超过 request，在驱逐排序里靠后，于是 BestEffort 的 report 先被驱逐。<br>② 给 report 设 limit（比如 512Mi）。它只会在自己的 cgroup 里 OOM 重启，节点根本不会进入 MemoryPressure。<br>生产环境里通常两者都做，再加上 <code>PriorityClass</code>。',
    m3: '给 leaky 设 limit（不超过约 900Mi）。泄漏和缓存刷新都只会让它自己 OOMKilled 然后很快重启，不会波及节点。再给 api、cache 设足 request：oom_score_adj 变低，驱逐排序也靠后。<br>limit 设得太大（比如 1.5Gi）时，leaky 的尖峰仍然可能把节点打满，触发内核 OOM Killer。',
    c1: '<b>api</b>：request 给足（≥ 2000m），保证争抢时的权重；不设 limit，或者 limit 高于突发峰值，免得被节流。<br><b>batch</b>：request 设小一点（比如 1000m），不设 limit，让它吃掉所有空闲 CPU。<br>两者的 request 加起来不能超过节点的 3800m，否则会有 Pod Pending。',
  };

  // ------------------------------------------------------------ 图表
  function makeChart(def, stats, isCpu) {
    const yMax = def.max;
    const y = (v) => 100 - (Math.min(v, yMax * 1.08) / yMax) * 92;
    const color = def.color;
    const svg = s('svg', { class: 'g2-svg', viewBox: `0 0 ${DAY} 100`, preserveAspectRatio: 'none' });
    const bands = s('g', { class: 'c-bands' });
    const ghost = s('path', { class: 'c-ghost' });
    const area = s('path', { class: 'c-area', fill: color });
    const line = s('path', { class: 'c-line', stroke: color });
    const demand = s('path', { class: 'c-demand' });
    const reqLine = s('line', { class: 'c-req', x1: 0, x2: DAY });
    const limLine = s('line', { class: 'c-lim', x1: 0, x2: DAY });
    const cursor = s('line', { class: 'c-cursor', y1: 0, y2: 100, x1: -10, x2: -10 });
    svg.append(bands, ghost, area, demand, line, reqLine, limLine, cursor);

    const markers = h('div', { class: 'c-markers' });
    const reqLabel = h('span', { class: 'c-label req' });
    const limLabel = h('span', { class: 'c-label lim' });
    const until = def.historyUntil || DAY;
    const pts = stats.pts.filter(([t, v]) => v != null && t <= until);
    ghost.setAttribute('d', linePath(pts.map(([t, v]) => ({ t, v })), y));

    const latStrip = isCpu && def.critical ? s('svg', { class: 'g2-lat', viewBox: `0 0 ${DAY} 10`, preserveAspectRatio: 'none' }) : null;

    const root = h(
      'div',
      { class: 'g2-chart' },
      h('div', { class: 'c-plot' }, svg, markers, reqLabel, limLabel),
      latStrip ? h('div', { class: 'g2-lat-wrap' }, h('span', { class: 'lat-label' }, '延迟'), latStrip) : null,
      h(
        'div',
        { class: 'c-axis' },
        ['0h', '6h', '12h', '18h', '24h'].map((x) => h('span', null, x))
      ),
      h(
        'div',
        { class: 'c-legend' },
        h('span', { class: 'lg ghost' }, def.historyUntil ? '上线 8 小时的监控' : '昨天的监控'),
        h('span', { class: 'lg use', style: { '--c': color } }, isCpu ? '实际拿到的 CPU' : '实际用量'),
        isCpu ? h('span', { class: 'lg demand' }, '需求') : null,
        h('span', { class: 'lg req' }, 'request'),
        h('span', { class: 'lg lim' }, 'limit')
      )
    );

    function setLines(req, lim, effReq) {
      const fmt = isCpu ? fmtCpu : fmtMem;
      const r = effReq;
      if (r > 0) {
        reqLine.setAttribute('y1', y(r));
        reqLine.setAttribute('y2', y(r));
        reqLine.style.display = '';
        reqLabel.style.display = '';
        reqLabel.style.top = y(r) + '%';
        reqLabel.textContent = 'request ' + fmt(r) + (req ? '' : '（=limit）');
      } else {
        reqLine.style.display = 'none';
        reqLabel.style.display = 'none';
      }
      if (lim > 0) {
        limLine.setAttribute('y1', y(lim));
        limLine.setAttribute('y2', y(lim));
        limLine.style.display = '';
        limLabel.style.display = '';
        limLabel.style.top = y(lim) + '%';
        limLabel.textContent = 'limit ' + fmt(lim);
      } else {
        limLine.style.display = 'none';
        limLabel.style.display = 'none';
      }
    }
    function setData(p, t) {
      const hist = p ? p.hist : [];
      line.setAttribute('d', linePath(hist, y));
      area.setAttribute('d', areaPath(hist, y));
      if (isCpu) {
        demand.setAttribute('d', linePath(hist.map((q) => ({ t: q.t, v: q.d })), y));
        KG.clear(bands);
        for (const q of hist) if (q.thr) bands.appendChild(s('rect', { class: 'c-thr', x: q.t, y: 0, width: DT, height: 100 }));
        if (latStrip) {
          KG.clear(latStrip);
          for (const q of hist) {
            if (q.lat == null) continue;
            latStrip.appendChild(s('rect', { x: q.t, y: 0, width: DT + 0.5, height: 10, class: q.lat > 200 ? 'lat-bad' : q.lat > 100 ? 'lat-mid' : 'lat-ok' }));
          }
        }
      } else if (p) {
        // 事件标记
        if (markers.childNodes.length !== p.marks.length) {
          KG.clear(markers);
          for (const m of p.marks) {
            markers.appendChild(
              h(
                'span',
                {
                  class: 'c-mark ' + m.kind,
                  style: { left: (m.t / DAY) * 100 + '%', top: y(m.v) + '%' },
                  title: { oom: 'OOMKilled（超过 limit）', kernel: '内核 OOM Killer', evict: '被 kubelet 驱逐' }[m.kind] + ' @ ' + fmtClock(m.t),
                },
                { oom: '💥', kernel: '☠', evict: '⛔' }[m.kind]
              )
            );
          }
        }
      }
      if (!p) KG.clear(markers);
      const x = t == null ? -10 : t;
      cursor.setAttribute('x1', x);
      cursor.setAttribute('x2', x);
    }
    return { root, setLines, setData };
  }

  function linePath(pts, y) {
    let d = '';
    let pen = false;
    for (const p of pts) {
      if (p.v == null) {
        pen = false;
        continue;
      }
      const x = p.t + DT / 2;
      d += (pen ? 'L' : 'M') + x.toFixed(1) + ',' + y(p.v).toFixed(2) + ' ';
      pen = true;
    }
    return d;
  }
  function areaPath(pts, y) {
    let d = '';
    let seg = [];
    const flush = () => {
      if (!seg.length) return;
      const x0 = seg[0].t;
      const x1 = seg[seg.length - 1].t + DT;
      d += `M${x0},100 L${x0},${y(seg[0].v).toFixed(2)} `;
      for (const p of seg) d += `L${(p.t + DT / 2).toFixed(1)},${y(p.v).toFixed(2)} `;
      d += `L${x1},${y(seg[seg.length - 1].v).toFixed(2)} L${x1},100 Z `;
      seg = [];
    };
    for (const p of pts) {
      if (p.v == null) flush();
      else seg.push(p);
    }
    flush();
    return d;
  }

  // ------------------------------------------------------------ 关卡
  function mount(body) {
    let sc = null;
    let idx = Math.min(KG.store.get('g2:last', 0), LEVELS.length - 1);
    function load(i) {
      if (sc) sc.dispose();
      sc = KG.scope();
      idx = i;
      KG.store.set('g2:last', i);
      KG.clear(body);
      playLevel(body, i, sc, load);
    }
    load(idx);
    return () => sc && sc.dispose();
  }

  function playLevel(body, li, sc, load) {
    const lv = LEVELS[li];
    const isCpu = lv.kind === 'cpu';
    const fmt = isCpu ? fmtCpu : fmtMem;
    const stepSize = isCpu ? 100 : 32;
    let cfg = lv.pods.map((p) => ({ ...p.preset }));
    let sim = null;
    let phase = 'config'; // config | running | done
    let playing = false;
    let speed = 1;
    let evIdx = 0;
    let acc = 0;

    const log = KG.eventLog(isCpu ? 'kubectl get events -w  # CPU' : 'kubectl get events -w');
    const clockEl = h('span', { class: 'g2-clock mono' }, '00:00');
    const progEl = h('div', { class: 'g2-prog-fill' });
    const ctrlEl = h('div', { class: 'row gap wrap' });
    const nodeEl = h('div', { class: 'panel g2-node' });

    // ---------------- Pod 卡片
    const cards = lv.pods.map((def, i) => {
      const chart = makeChart(def, lv.stats[def.name], isCpu);
      const qosEl = h('span', { class: 'badge' });
      const statusEl = h('span', { class: 'badge' });
      const statsEl = h('div', { class: 'g2-stats mono' });
      const reqVal = h('span', { class: 'sv mono' });
      const limVal = h('span', { class: 'sv mono' });
      const reqIn = h('input', { type: 'range', min: 0, max: def.max, step: stepSize, 'aria-label': def.name + ' request' });
      const limIn = h('input', { type: 'range', min: 0, max: def.max, step: stepSize, 'aria-label': def.name + ' limit' });
      reqIn.addEventListener('input', () => {
        const c = cfg[i];
        c.req = +reqIn.value;
        if (c.lim && c.req > c.lim) c.lim = c.req;
        onCfg();
      });
      limIn.addEventListener('input', () => {
        const c = cfg[i];
        c.lim = +limIn.value;
        if (c.lim && c.req > c.lim) c.req = c.lim;
        onCfg();
      });
      const root = h(
        'div',
        { class: 'panel g2-pod', style: { '--pc': def.color } },
        h(
          'div',
          { class: 'g2-pod-head' },
          h('span', { class: 'dot' }),
          h('b', { class: 'mono' }, def.name),
          h('span', { class: 'mini-badge ' + (def.critical ? 'crit' : 'muted') }, def.critical ? '关键服务' : '可牺牲'),
          h('span', { class: 'spacer' }),
          qosEl,
          statusEl
        ),
        h('div', { class: 'g2-desc' }, def.desc),
        h(
          'div',
          { class: 'g2-sliders' },
          h('label', { class: 'g2-slider' }, h('span', { class: 'sl req' }, 'request'), reqIn, reqVal),
          h('label', { class: 'g2-slider' }, h('span', { class: 'sl lim' }, 'limit'), limIn, limVal)
        ),
        chart.root,
        statsEl
      );
      function updateCfg() {
        const c = cfg[i];
        reqIn.value = c.req;
        limIn.value = c.lim;
        const disabled = phase !== 'config';
        reqIn.disabled = disabled;
        limIn.disabled = disabled;
        reqVal.textContent = c.req ? fmt(c.req) : c.lim ? '未设置（=limit）' : '未设置';
        limVal.textContent = c.lim ? fmt(c.lim) : '不限制';
        const q = Sim.qosOf(c.req, c.lim);
        qosEl.textContent = q;
        qosEl.className = 'badge qos-' + q.toLowerCase();
        chart.setLines(c.req, c.lim, Sim.effReq(c));
      }
      function updateSim() {
        const p = sim ? sim.pods[i] : null;
        chart.setData(p, sim && phase !== 'config' ? sim.t : null);
        if (!p) {
          statusEl.textContent = '待运行';
          statusEl.className = 'badge muted';
          KG.clear(statsEl);
          return;
        }
        let st = p.status;
        let cls = 'ok';
        if (p.pending) {
          st = 'Pending';
          cls = 'muted';
        } else if (isCpu) {
          const last = p.hist[p.hist.length - 1];
          if (last && last.thr) {
            st = 'Throttled';
            cls = 'warn';
          }
        } else if (st === 'Restarting') {
          st = p.restarts >= 2 ? 'CrashLoopBackOff' : 'OOMKilled';
          cls = 'bad';
        } else if (st === 'Evicted') cls = 'warn';
        else if (st === 'Waiting') {
          st = '未开始';
          cls = 'muted';
        } else if (st === 'Completed') cls = 'muted';
        statusEl.textContent = st;
        statusEl.className = 'badge ' + cls;
        if (isCpu) {
          KG.fill(
            statsEl,
            h('span', null, `拿到 ${(p.usage / 1000).toFixed(2)} 核 / 需求 ${(p.demand / 1000).toFixed(2)} 核`),
            def.critical ? h('span', { class: p.lat > 200 ? 'bad-text' : '' }, `延迟 ${Math.round(p.lat)}ms`) : null,
            h('span', null, `节流 ${p.throttled} 分钟`),
            h('span', null, `完成 ${p.work.toFixed(1)} 核·时`)
          );
        } else {
          const avail = p.pending ? 0 : p.active ? 1 - p.down / p.active : 1;
          KG.fill(
            statsEl,
            h('span', null, `当前 ${fmtMem(p.usage)}`),
            h('span', null, `可用率 ${KG.pct(avail)}`),
            h('span', { class: p.oom ? 'bad-text' : '' }, `💥 OOMKilled ${p.oom}`),
            h('span', { class: p.kernel ? 'bad-text' : '' }, `☠ 内核 OOM ${p.kernel}`),
            h('span', { class: p.evicted ? 'bad-text' : '' }, `⛔ 驱逐 ${p.evicted}`),
            h('span', null, `重启 ${p.restarts}`)
          );
        }
      }
      return { root, updateCfg, updateSim };
    });

    // ---------------- 节点面板
    function nodeBar(segs, scaleMax, marks, extraCls) {
      return h(
        'div',
        { class: 'nbar ' + (extraCls || '') },
        h(
          'div',
          { class: 'nbar-fill' },
          segs.map((x) => h('div', { class: 'seg', style: { width: (Math.max(0, x.v) / scaleMax) * 100 + '%', background: x.color }, title: x.title }))
        ),
        marks.map((m) => h('div', { class: 'nbar-zone ' + m.cls, style: { left: (m.from / scaleMax) * 100 + '%', width: ((m.to - m.from) / scaleMax) * 100 + '%' }, title: m.title }))
      );
    }
    function updateNode() {
      const C = Sim.normConfig(lv, cfg);
      if (isCpu) {
        const cap = lv.node.cpu;
        const reqSegs = lv.pods.map((p) => ({ v: C[p.name].effReq, color: p.color, title: `${p.name} request ${fmtCpu(C[p.name].effReq)}` }));
        const over = C._sumReq > cap;
        const live = sim && phase !== 'config' ? sim.pods.map((p) => ({ v: p.usage, color: p.def.color, title: `${p.name} ${fmtCpu(p.usage)}` })) : null;
        KG.fill(
          nodeEl,
          h('div', { class: 'panel-title' }, `node-1 · CPU allocatable ${cap}m`),
          h('div', { class: 'nrow' }, h('span', { class: 'nlabel' }, 'requests 总和'), nodeBar(reqSegs, cap * 1.1, [{ from: cap, to: cap * 1.1, cls: 'overflow', title: '超出 allocatable' }], over ? 'over' : ''), h('span', { class: 'nval mono' + (over ? ' bad-text' : '') }, `${fmtCpu(C._sumReq)} / ${fmtCpu(cap)}${over ? '（放不下，将有 Pod Pending）' : ''}`)),
          live
            ? h('div', { class: 'nrow' }, h('span', { class: 'nlabel' }, '实时 CPU'), nodeBar(live, cap * 1.1, [{ from: cap, to: cap * 1.1, cls: 'overflow' }]), h('span', { class: 'nval mono' }, `${fmtCpu(live.reduce((a, x) => a + x.v, 0))} / ${fmtCpu(cap)}`))
            : h('div', { class: 'nrow hint' }, 'CPU 是可压缩资源：节点再忙也只是"分得少、跑得慢"，不会杀进程。')
        );
        return;
      }
      const nd = lv.node;
      const cap = nd.capacity;
      const alloc = cap - nd.systemReserved - nd.evictionThreshold;
      const zones = [
        { from: alloc, to: alloc + nd.evictionThreshold, cls: 'thr', title: `驱逐阈值 ${nd.evictionThreshold}Mi` },
        { from: alloc + nd.evictionThreshold, to: cap, cls: 'sys', title: `系统预留 ${nd.systemReserved}Mi` },
      ];
      const reqSegs = lv.pods.map((p) => ({ v: C[p.name].effReq, color: p.color, title: `${p.name} request ${fmtMem(C[p.name].effReq)}` }));
      const over = C._sumReq > alloc;
      const noLimit = lv.pods.some((p) => !C[p.name].lim);
      const sumLim = lv.pods.reduce((a, p) => a + (C[p.name].lim || 0), 0);
      const pressure = sim && phase !== 'config' && sim.t - DT < sim.pressureUntil && sim.t > 0;
      const live = sim && phase !== 'config' ? sim.pods.map((p) => ({ v: p.usage, color: p.def.color, title: `${p.name} ${fmtMem(p.usage)}` })) : null;
      const liveTotal = live ? live.reduce((a, x) => a + x.v, 0) : 0;
      KG.fill(
        nodeEl,
        h(
          'div',
          { class: 'panel-title row gap wrap' },
          h('span', null, `node-1 · 内存 ${fmtMem(cap)} = allocatable ${fmtMem(alloc)} + 驱逐阈值 ${nd.evictionThreshold}Mi + 系统预留 ${nd.systemReserved}Mi`),
          pressure ? h('span', { class: 'badge bad' }, 'MemoryPressure') : null
        ),
        h(
          'div',
          { class: 'nrow' },
          h('span', { class: 'nlabel' }, 'requests', h('small', null, '调度器视角')),
          nodeBar(reqSegs, cap, zones, over ? 'over' : ''),
          h('span', { class: 'nval mono' + (over ? ' bad-text' : '') }, `${fmtMem(C._sumReq)} / ${fmtMem(alloc)}${over ? ' 放不下！' : ''}`)
        ),
        h(
          'div',
          { class: 'nrow' },
          h('span', { class: 'nlabel' }, 'limits', h('small', null, '超卖程度')),
          h(
            'span',
            { class: 'nval wide' },
            noLimit
              ? h('span', { class: 'warn-text' }, '有 Pod 没设 limit，理论上它能吃光整台节点的内存')
              : h('span', { class: sumLim > alloc ? 'warn-text' : '' }, `limits 总和 ${fmtMem(sumLim)}，是 allocatable 的 ${Math.round((sumLim / alloc) * 100)}%${sumLim > alloc ? '（超卖：大家同时冲高峰时会挤爆）' : ''}`)
          )
        ),
        live
          ? h(
              'div',
              { class: 'nrow' },
              h('span', { class: 'nlabel' }, '实时用量'),
              nodeBar(live, cap, zones),
              h('span', { class: 'nval mono' + (liveTotal > alloc ? ' bad-text' : '') }, `${fmtMem(liveTotal)} / ${fmtMem(alloc)}`)
            )
          : null
      );
    }

    // ---------------- 控制
    function onCfg() {
      cards.forEach((c) => c.updateCfg());
      updateNode();
    }
    function flushEvents() {
      if (!sim) return;
      while (evIdx < sim.events.length) {
        const e = sim.events[evIdx++];
        log.add(e.type, e.reason, e.obj, e.msg, fmtClock(e.t));
      }
    }
    function updateAll() {
      cards.forEach((c) => {
        c.updateCfg();
        c.updateSim();
      });
      updateNode();
      flushEvents();
      const t = sim && phase !== 'config' ? sim.t : 0;
      clockEl.textContent = t >= DAY ? '24:00' : fmtClock(t);
      progEl.style.width = (t / DAY) * 100 + '%';
      renderCtrl();
    }
    function start() {
      sim = Sim.createSim(lv, cfg);
      phase = 'running';
      playing = true;
      evIdx = 0;
      acc = 0;
      log.clear();
      log.add('Normal', 'Info', null, `配置已提交：${lv.pods.map((p, i) => `${p.name}(${Sim.qosOf(cfg[i].req, cfg[i].lim)})`).join('，')}，开始模拟 24 小时`, '00:00');
      updateAll();
    }
    function finish() {
      phase = 'done';
      playing = false;
      updateAll();
      const res = Sim.summarize(lv, sim, cfg);
      const goals = lv.goals.map((g, k) => ({ text: g.text, ok: res.results[k], note: g.note ? g.note(res.R, res.C, lv) : null }));
      const rows = lv.pods.map((p) => {
        const r = res.R[p.name];
        return isCpu
          ? h('tr', null, h('td', { class: 'mono' }, p.name), h('td', null, r.pending ? 'Pending' : `${r.work.toFixed(1)} 核·时`), h('td', null, `${r.throttled} 分钟`), h('td', null, p.critical ? `${r.sloBad} 分钟` : '—'))
          : h('tr', null, h('td', { class: 'mono' }, p.name), h('td', null, r.pending ? 'Pending' : KG.pct(r.avail)), h('td', null, r.oom), h('td', null, r.kernel), h('td', null, r.evicted));
      });
      const table = h(
        'table',
        { class: 'mini-table' },
        h('thead', null, isCpu ? h('tr', null, h('th', null, 'Pod'), h('th', null, '完成量'), h('th', null, '被节流'), h('th', null, '延迟超标')) : h('tr', null, h('th', null, 'Pod'), h('th', null, '可用率'), h('th', null, 'OOMKilled'), h('th', null, '内核 OOM'), h('th', null, '驱逐'))),
        h('tbody', null, rows)
      );
      KG.showResult({
        game: GAME,
        level: lv.id,
        stars: res.stars,
        goals,
        extra: h('div', null, table, KG.tip('参考思路', DEBRIEF[lv.id], res.stars === 3)),
        onRetry: backToConfig,
        onNext: li + 1 < LEVELS.length ? () => load(li + 1) : null,
      });
    }
    function backToConfig() {
      phase = 'config';
      playing = false;
      updateAll();
    }
    function skip() {
      if (!sim) start();
      while (!sim.done) sim.step();
      finish();
    }
    let ctrlSig = '';
    function renderCtrl() {
      // 只在状态变化时重建按钮，避免模拟刷新时吞掉点击
      const sig = [phase, playing, speed].join('|');
      if (sig === ctrlSig) return;
      ctrlSig = sig;
      const speedBtns = [1, 2, 4].map((k) => h('button', { class: 'btn small' + (speed === k ? ' active' : ''), onclick: () => ((speed = k), renderCtrl()) }, k + '×'));
      KG.fill(
        ctrlEl,
        phase === 'config' ? h('button', { class: 'btn primary', onclick: start }, '▶ 开始模拟 24 小时') : null,
        phase === 'running' ? h('button', { class: 'btn', onclick: () => ((playing = !playing), renderCtrl()) }, playing ? '⏸ 暂停' : '▶ 继续') : null,
        phase === 'running' ? h('button', { class: 'btn ghost', onclick: skip }, '⏭ 直接看结果') : null,
        phase !== 'config' ? h('button', { class: 'btn', onclick: backToConfig }, '✎ 修改配置') : null,
        phase === 'config'
          ? h(
              'button',
              {
                class: 'btn ghost',
                onclick: () => {
                  cfg = lv.pods.map((p) => ({ ...p.preset }));
                  sim = null;
                  onCfg();
                  updateAll();
                },
              },
              '↺ 恢复初始配置'
            )
          : null,
        h('span', { class: 'spacer' }),
        h('span', { class: 'muted-text' }, '速度'),
        speedBtns
      );
    }

    sc.interval(() => {
      if (phase !== 'running' || !playing || !sim) return;
      acc += speed * 0.5; // 1× ≈ 每秒 10 步（5 分钟/步），一天约 29 秒
      let n = Math.floor(acc);
      acc -= n;
      if (!n) return;
      while (n-- > 0 && !sim.done) sim.step();
      updateAll();
      if (sim.done) finish();
    }, 50);

    body.append(
      KG.levelBar(GAME, LEVELS, li, load),
      h('section', { class: 'panel intro' }, h('h2', null, `第 ${li + 1} 关 · ${lv.title}`), h('p', { html: lv.intro }), KG.goalBox(lv.goals), KG.tip(lv.tip.title, lv.tip.html)),
      nodeEl,
      h('div', { class: 'toolbar sticky' }, h('div', { class: 'g2-time' }, '⏱ ', clockEl, h('div', { class: 'g2-prog' }, progEl)), ctrlEl),
      h('div', { class: 'g2-pods' + (lv.pods.length === 1 ? ' single' : '') }, cards.map((c) => c.root)),
      log.root
    );
    onCfg();
    updateAll();
  }

  KG.register({
    id: GAME,
    icon: '💥',
    color: '#f472b6',
    title: 'OOM 求生记',
    tagline: '调 request / limit，让服务撑过一整天',
    concepts: ['request vs limit', 'QoS 等级', 'OOMKilled', 'CrashLoopBackOff', 'kubelet 驱逐', '内核 OOM Killer', 'CPU 节流'],
    progress: () => ({ got: LEVELS.reduce((a, l) => a + KG.getStars(GAME, l.id), 0), total: LEVELS.length * 3 }),
    mount,
  });
})();
