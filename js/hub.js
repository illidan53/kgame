/* Kube 游乐场 —— 大厅：转动 7 辐舵轮选大类，大类里的游戏卡片在上方轮动 */
(function () {
  'use strict';
  const { h, s } = KG;

  // 7 个大类，正好是 K8s 舵轮的 7 根辐条（从正上方开始顺时针）。
  // entries 是已上线的游戏（mode 指向游戏里的某个小游戏），soon 是"即将开放"的占位。
  const CATEGORIES = [
    {
      id: 'container',
      icon: '📦',
      title: '容器',
      en: 'Container',
      color: '#f472b6',
      tagline: '单个容器怎么活下去：资源、QoS、OOM、探针',
      entries: [{ game: 'resources' }],
      soon: [
        { icon: '🩺', title: '探针急诊室', tagline: '探针配错了会怎样：重启风暴、流量打到还没准备好的 Pod', concepts: ['livenessProbe', 'readinessProbe', 'startupProbe', 'restartPolicy'] },
        { icon: '📥', title: '镜像拉取', tagline: '镜像什么时候拉、从哪拉、拉不下来会怎样', concepts: ['imagePullPolicy', 'ImagePullBackOff', 'imagePullSecrets'] },
      ],
    },
    {
      id: 'scheduling',
      icon: '🧭',
      title: '调度',
      en: 'Scheduling',
      color: '#60a5fa',
      tagline: 'Pod 该落到哪个节点：装箱、污点、亲和、抢占',
      entries: [{ game: 'scheduler' }],
      soon: [
        { icon: '🧲', title: '亲和与拓扑分布', tagline: '让 Pod 扎堆或者散开，跨可用区均匀分布', concepts: ['nodeAffinity', 'podAntiAffinity', 'topologySpreadConstraints'] },
        { icon: '⚔️', title: '优先级与抢占', tagline: '资源不够的时候，谁给谁让位', concepts: ['PriorityClass', 'Preemption', 'PDB'] },
      ],
    },
    {
      id: 'workloads',
      icon: '⚙️',
      title: '工作负载',
      en: 'Workloads',
      color: '#34d399',
      tagline: '控制器怎么维持期望状态，又怎么平稳发布',
      entries: [{ game: 'replicaset' }, { game: 'rollout' }],
      soon: [
        { icon: '🔢', title: 'StatefulSet 有序启停', tagline: '稳定的名字和存储，按序号一个一个来', concepts: ['StatefulSet', 'Headless Service', 'podManagementPolicy'] },
        { icon: '⏱️', title: 'Job 与 CronJob', tagline: '跑完就结束的任务：并行、重试、定时', concepts: ['Job', 'backoffLimit', 'CronJob', 'concurrencyPolicy'] },
      ],
    },
    {
      id: 'networking',
      icon: '🌐',
      title: '网络',
      en: 'Networking',
      color: '#22d3ee',
      tagline: '流量怎么找到 Pod：Service、DNS、网络策略',
      entries: [{ game: 'selector' }],
      soon: [
        { icon: '📨', title: '数据包之旅', tagline: '跟着一个请求，从 DNS 一路走到 Pod', concepts: ['ClusterIP', 'kube-proxy', 'CoreDNS', 'Ingress / Gateway'] },
        { icon: '🧱', title: 'NetworkPolicy 防火墙', tagline: '默认全通；一旦被策略选中，就只放行允许的流量', concepts: ['NetworkPolicy', 'ingress / egress', 'default deny'] },
      ],
    },
    {
      id: 'storage',
      icon: '💾',
      title: '存储',
      en: 'Storage',
      color: '#fbbf24',
      tagline: '数据放在哪里，Pod 重建以后还在不在',
      entries: [],
      soon: [{ icon: '🔗', title: 'PVC 配对', tagline: '把 PVC 配给合适的 PV，或者让 StorageClass 现造一个', concepts: ['PV / PVC', 'StorageClass', 'accessModes', 'reclaimPolicy'] }],
    },
    {
      id: 'security',
      icon: '🔐',
      title: '安全',
      en: 'Security',
      color: '#f87171',
      tagline: '谁能对集群做什么，容器能对节点做什么',
      entries: [],
      soon: [
        { icon: '🚪', title: 'RBAC 门禁', tagline: '给 ServiceAccount 刚好够用的权限', concepts: ['Role / ClusterRole', 'RoleBinding', 'ServiceAccount'] },
        { icon: '🛡️', title: 'SecurityContext 加固', tagline: '不用 root 运行、只读根文件系统、收回多余的 capability', concepts: ['runAsNonRoot', 'capabilities', 'Pod Security Admission'] },
      ],
    },
    {
      id: 'operator',
      icon: '🤖',
      title: 'Operator',
      en: 'Operator',
      color: '#a78bfa',
      tagline: '用 CRD 和控制器扩展 K8s：Informer、Reconcile、Finalizer',
      entries: [
        { game: 'operator', mode: 'anatomy' },
        { game: 'operator', mode: 'reconciler' },
        { game: 'operator', mode: 'match' },
      ],
      soon: [],
    },
  ];

  const N = CATEGORIES.length;
  const STEP = 360 / N;
  const mod = (i) => ((i % N) + N) % N;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  KG.categories = CATEGORIES;
  KG.categoryOf = (gameId) => CATEGORIES.find((c) => c.entries.some((e) => e.game === gameId)) || null;

  // ---------------------------------------------------------------- 卡片数据
  function entryInfo(e) {
    const g = KG.games.find((x) => x.id === e.game);
    if (!g) return null;
    if (!e.mode) {
      return { href: '#/' + g.id, icon: g.icon, title: g.title, tagline: g.tagline, concepts: g.concepts, color: g.color, prog: g.progress ? g.progress() : null };
    }
    const m = g.modes.find((x) => x.id === e.mode);
    const ids = m.stars || [];
    return {
      href: `#/${g.id}/${m.id}`,
      icon: m.icon,
      title: m.title,
      tagline: m.tagline,
      concepts: m.concepts || [],
      color: g.color,
      prog: ids.length ? { got: ids.reduce((a, id) => a + KG.getStars(g.id, id), 0), total: ids.length * 3 } : null,
    };
  }

  function sumProgress(infos) {
    return infos.reduce((a, x) => (x && x.prog ? { got: a.got + x.prog.got, total: a.total + x.prog.total } : a), { got: 0, total: 0 });
  }

  // ---------------------------------------------------------------- 夜空
  // 三层星星和海面反光都是平铺的 SVG 背景，固定种子，每次打开都是同一片天
  let skyArt = null;
  function sky() {
    if (skyArt) return skyArt;
    const rnd = KG.rng(20260930);
    const url = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    const tints = ['#ffffff', '#ffffff', '#ffffff', '#dce6ff', '#c9dbff', '#ffe6cf', '#e8d9ff'];
    const stars = (w, hh, count, [r0, r1], [a0, a1], halo) => {
      let out = halo ? '<defs><radialGradient id="h"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' : '';
      for (let i = 0; i < count; i++) {
        const x = (rnd() * w).toFixed(1);
        const y = (rnd() * hh).toFixed(1);
        const r = r0 + rnd() ** 2 * (r1 - r0);
        const tint = tints[Math.floor(rnd() * tints.length)];
        if (halo) out += `<circle cx="${x}" cy="${y}" r="${(r * 5).toFixed(1)}" fill="url(#h)"/>`;
        out += `<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}" fill="${tint}" opacity="${(a0 + rnd() * (a1 - a0)).toFixed(2)}"/>`;
      }
      return { url: url(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}">${out}</svg>`), w, h: hh };
    };
    // 海面：越靠近海平线，波光越细越暗
    const sea = (w, hh, count) => {
      let out = '';
      for (let i = 0; i < count; i++) {
        const t = rnd() ** 1.7;
        const len = 3 + t * 36 * (0.4 + rnd());
        const x = rnd() * (w - len);
        out += `<rect x="${x.toFixed(1)}" y="${(t * hh).toFixed(1)}" width="${len.toFixed(1)}" height="${(0.5 + t * 1.3).toFixed(2)}" rx="1" fill="#c3d4ff" opacity="${((0.08 + 0.42 * t) * (0.5 + rnd() * 0.5)).toFixed(2)}"/>`;
      }
      return { url: url(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none">${out}</svg>`), w, h: hh };
    };
    skyArt = {
      far: stars(900, 640, 230, [0.3, 0.85], [0.25, 0.7]),
      mid: stars(1100, 760, 80, [0.6, 1.3], [0.45, 0.95]),
      near: stars(1400, 900, 18, [1, 1.8], [0.75, 1], true),
      sea: sea(1400, 400, 320),
    };
    return skyArt;
  }

  // 转舵 = 船转向，天空和海面跟着横移（每度移动的像素，越近越快）
  const PAN = { far: 0.45, mid: 0.9, near: 1.6, sea: 2.4 };

  // ---------------------------------------------------------------- 舵轮图形
  // viewBox 以轮心为原点，半径 50 对应舵轮宽度的一半
  function wheelArt() {
    const heptagon = CATEGORIES.map((_, i) => {
      const a = (i * STEP * Math.PI) / 180;
      return `${(41 * Math.sin(a)).toFixed(2)},${(-41 * Math.cos(a)).toFixed(2)}`;
    }).join(' ');
    const at = (r, deg) => ({ cx: (r * Math.sin((deg * Math.PI) / 180)).toFixed(2), cy: (-r * Math.cos((deg * Math.PI) / 180)).toFixed(2) });
    const spokes = CATEGORIES.map((c, i) =>
      s('g', { class: 'hh-spoke', style: '--c:' + c.color, transform: `rotate(${(i * STEP).toFixed(3)})` }, s('line', { class: 'hh-spoke-bar', x1: 0, y1: -10, x2: 0, y2: -36 }), s('line', { class: 'hh-handle', x1: 0, y1: -35.5, x2: 0, y2: -43 }))
    );
    const svg = s(
      'svg',
      { class: 'hh-wheel-art', viewBox: '-50 -50 100 100', 'aria-hidden': 'true' },
      s('polygon', { class: 'hh-plate-bg', points: heptagon }),
      spokes,
      s('circle', { class: 'hh-rim', r: 31.5 }),
      s('circle', { class: 'hh-rim-edge', r: 33.6 }),
      s('circle', { class: 'hh-rim-edge', r: 29.4 }),
      CATEGORIES.map((_, i) => s('circle', { class: 'hh-stud', r: 0.75, ...at(31.5, i * STEP + STEP / 2) })),
      s('circle', { class: 'hh-hub-disc', r: 11 }),
      s('circle', { class: 'hh-hub-ring', r: 8.4 }),
      CATEGORIES.map((_, i) => s('circle', { class: 'hh-stud', r: 0.8, ...at(9.7, i * STEP + STEP / 2) }))
    );
    return { svg, spokes };
  }

  // ---------------------------------------------------------------- 卡片轮动
  // 横向 scroll-snap 行：每张卡的 --focus（居中为 1，离开一张为 0）和 --shift（带符号的偏移）
  // 跟随滚动位置，侧面的卡片转向中间、缩小、变暗
  function carousel(slides) {
    const track = h('div', { class: 'hh-track' }, slides);
    const dots = slides.map((_, i) => h('button', { class: 'hh-dot', 'aria-label': `第 ${i + 1} 张`, onclick: () => go(i) }));
    const prev = h('button', { class: 'hh-arrow', 'aria-label': '上一张', onclick: () => go(active - 1) }, '‹');
    const next = h('button', { class: 'hh-arrow', 'aria-label': '下一张', onclick: () => go(active + 1) }, '›');
    // 只有一张卡时也占着控制条的位置，保持各大类面板等高
    const root = h('div', { class: 'hh-carousel' }, track, h('div', { class: 'hh-ctrl' + (slides.length > 1 ? '' : ' single') }, prev, h('div', { class: 'hh-dots' }, dots), next));

    let centers = [];
    let slideW = 1;
    let active = 0;
    let target = null;
    let frame = 0;
    let settleTimer = 0;

    function measure() {
      slideW = slides[0].offsetWidth || 1;
      centers = slides.map((el) => el.offsetLeft + el.offsetWidth / 2);
    }
    function setActive(i) {
      active = i;
      slides.forEach((el, k) => el.classList.toggle('is-active', k === i));
      dots.forEach((d, k) => (k === i ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
      prev.disabled = i === 0;
      next.disabled = i === slides.length - 1;
    }
    function render() {
      frame = 0;
      const mid = track.scrollLeft + track.clientWidth / 2;
      let nearest = 0;
      slides.forEach((el, i) => {
        const off = (centers[i] - mid) / slideW;
        el.style.setProperty('--focus', Math.max(0, 1 - Math.abs(off)).toFixed(3));
        el.style.setProperty('--shift', Math.max(-1, Math.min(1, off)).toFixed(3));
        if (Math.abs(off) < Math.abs((centers[nearest] - mid) / slideW)) nearest = i;
      });
      const cur = target ?? nearest;
      if (cur !== active) setActive(cur);
    }
    function settle() {
      clearTimeout(settleTimer);
      target = null;
      render();
    }
    function go(i) {
      target = Math.max(0, Math.min(slides.length - 1, i));
      setActive(target);
      track.scrollTo({ left: centers[target] - track.clientWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 700);
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(render);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 160);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('scrollend', settle);
    // 鼠标点侧面的卡片：先把它转到中间，不直接进入；键盘回车（detail 为 0）照常进入
    track.addEventListener(
      'click',
      (e) => {
        const i = slides.indexOf(e.target.closest('.hh-slide'));
        if (e.detail === 0 || i < 0 || i === (target ?? active)) return;
        e.preventDefault();
        go(i);
      },
      true
    );
    track.addEventListener('focusin', (e) => {
      const i = slides.indexOf(e.target.closest('.hh-slide'));
      if (i >= 0 && i !== (target ?? active)) go(i);
    });
    track.addEventListener('keydown', (e) => {
      const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      go(active + dir);
      const el = slides[active];
      if (el.matches('a')) el.focus({ preventScroll: true });
    });
    const ro = new ResizeObserver(() => {
      measure();
      track.scrollLeft = centers[target ?? active] - track.clientWidth / 2;
      render();
    });

    return {
      root,
      start() {
        measure();
        setActive(0);
        track.scrollLeft = centers[0] - track.clientWidth / 2;
        render();
        ro.observe(track);
      },
      dispose() {
        ro.disconnect();
        clearTimeout(settleTimer);
        cancelAnimationFrame(frame);
      },
    };
  }

  function liveSlide(info, n, cat) {
    return h(
      'a',
      { class: 'hh-slide', href: info.href, style: { '--g': info.color || cat.color } },
      h(
        'div',
        { class: 'hh-card' },
        h(
          'div',
          { class: 'hh-screen' },
          h('span', { class: 'hh-code' }, `${cat.id}/${String(n).padStart(2, '0')}`),
          info.prog ? h('span', { class: 'hh-score' + (info.prog.got ? ' got' : '') }, `★ ${info.prog.got}/${info.prog.total}`) : h('span', { class: 'hh-score' }, '动画演示'),
          h('span', { class: 'hh-art', 'aria-hidden': 'true' }, info.icon)
        ),
        h(
          'div',
          { class: 'hh-body' },
          h('h3', null, info.title),
          h('p', null, info.tagline),
          h('div', { class: 'hh-chips' }, info.concepts.slice(0, 4).map((c) => h('span', { class: 'hh-chip' }, c))),
          h('span', { class: 'hh-go' }, '开始 →')
        )
      )
    );
  }

  function soonSlide(item, n, cat) {
    return h(
      'div',
      { class: 'hh-slide soon', style: { '--g': cat.color } },
      h(
        'div',
        { class: 'hh-card' },
        h(
          'div',
          { class: 'hh-screen' },
          h('span', { class: 'hh-code' }, `${cat.id}/${String(n).padStart(2, '0')}`),
          h('span', { class: 'hh-score' }, '🔒 即将开放'),
          h('span', { class: 'hh-art', 'aria-hidden': 'true' }, item.icon)
        ),
        h(
          'div',
          { class: 'hh-body' },
          h('h3', null, item.title),
          h('p', null, item.tagline),
          h('div', { class: 'hh-chips' }, item.concepts.slice(0, 4).map((c) => h('span', { class: 'hh-chip' }, c))),
          h('span', { class: 'hh-go' }, '建设中')
        )
      )
    );
  }

  // ---------------------------------------------------------------- 大厅
  let introDone = false;

  KG.renderHub = function (app, wanted) {
    document.title = 'Kube 游乐场';
    document.documentElement.dataset.view = 'hub';
    const art = sky();
    const saved = KG.store.get('hub:cat', null);
    let cur = Math.max(0, CATEGORIES.findIndex((c) => c.id === (wanted || saved)));

    const total = sumProgress(CATEGORIES.flatMap((c) => c.entries.map(entryInfo)));

    // 夜空、海面
    const layers = {};
    for (const k of ['far', 'mid', 'near']) {
      layers[k] = h('div', { class: 'hh-stars hh-stars-' + k, style: { backgroundImage: art[k].url, backgroundSize: `${art[k].w}px ${art[k].h}px`, right: -art[k].w + 'px' } });
    }
    layers.sea = h('div', { class: 'hh-glints', style: { backgroundImage: art.sea.url, backgroundSize: `${art.sea.w}px 100%`, right: -art.sea.w + 'px' } });
    const skyEl = h('div', { class: 'hh-sky', 'aria-hidden': 'true' }, h('div', { class: 'hh-nebula' }), layers.far, layers.mid, layers.near, h('div', { class: 'hh-meteor' }), h('div', { class: 'hh-sea' }, layers.sea));

    // 舵轮
    const { svg, spokes } = wheelArt();
    const knobs = CATEGORIES.map((c, i) =>
      h(
        'button',
        { class: 'hh-knob', role: 'tab', id: 'hh-tab-' + c.id, 'aria-controls': 'hh-panel', 'aria-selected': 'false', tabindex: '-1', style: { '--c': c.color }, onclick: () => turnTo(i) },
        h('span', { class: 'hh-medal', 'aria-hidden': 'true' }, c.icon),
        h('span', { class: 'hh-nameplate' }, c.title)
      )
    );
    const tablist = h('div', { class: 'hh-knobs', role: 'tablist', 'aria-label': '大类' }, knobs);
    const hub = h('div', { class: 'hh-hub' }, h('span', { class: 'sr-only' }, '全部星星'), h('span', { class: 'hh-hub-got' }, '★ ' + total.got), h('span', { class: 'hh-hub-total' }, '/ ' + total.total));
    const wheel = h('div', { class: 'hh-wheel' }, svg, hub, tablist);
    const helm = h('div', { class: 'hh-helm' }, wheel);

    const panel = h('section', { class: 'hh-panel', id: 'hh-panel', role: 'tabpanel' });
    const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });

    const root = h(
      'div',
      { class: 'hh', style: { '--cat': CATEGORIES[cur].color } },
      skyEl,
      h(
        'header',
        { class: 'hh-head' },
        h('div', { class: 'hh-brand' }, h('span', { class: 'hh-logo', 'aria-hidden': 'true' }, '⎈'), h('div', null, h('h1', null, 'Kube 游乐场'), h('p', null, '用小游戏理解 Kubernetes。Kubernetes 在希腊语里就是"舵手"。'))),
        h('p', { class: 'hh-hint' }, h('span', { class: 'hh-hint-wide' }, '拖动舵轮、滚动滚轮或按 ← → 切换大类'), h('span', { class: 'hh-hint-narrow' }, '左右拖动舵轮切换大类'))
      ),
      h('main', { class: 'hh-main' }, panel, helm),
      h(
        'footer',
        { class: 'hh-foot' },
        h('span', null, '进度保存在本地浏览器。'),
        h(
          'button',
          {
            class: 'hh-reset',
            onclick: () => {
              if (!confirm('确定清空所有星星和进度？')) return;
              try {
                Object.keys(localStorage)
                  .filter((k) => k.startsWith('kg:'))
                  .forEach((k) => localStorage.removeItem(k));
              } catch (e) {
                /* ignore */
              }
              KG.route();
            },
          },
          '重置进度'
        )
      ),
      status
    );
    app.appendChild(root);

    // ---------------------------------------------------------- 面板
    let deck = null;
    function renderPanel(dir) {
      const c = CATEGORIES[cur];
      const infos = c.entries.map(entryInfo).filter(Boolean);
      const prog = sumProgress(infos);
      const slides = [...infos.map((x, i) => liveSlide(x, i + 1, c)), ...c.soon.map((x, i) => soonSlide(x, infos.length + i + 1, c))];
      if (deck) deck.dispose();
      deck = carousel(slides);
      const meta = [infos.length ? `${infos.length} 个游戏` : '还没有上线的游戏', c.soon.length ? `${c.soon.length} 个即将开放` : null, prog.total ? `★ ${prog.got} / ${prog.total}` : null].filter(Boolean);
      panel.style.setProperty('--dir', dir);
      panel.setAttribute('aria-labelledby', 'hh-tab-' + c.id);
      KG.fill(
        panel,
        h(
          'div',
          { class: 'hh-cat' },
          h('div', { class: 'hh-kicker mono' }, `${String(cur + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')} · ${c.en}`),
          h('h2', null, h('span', { class: 'hh-cat-icon', 'aria-hidden': 'true' }, c.icon), c.title),
          h('p', { class: 'hh-cat-tag' }, c.tagline),
          h('p', { class: 'hh-cat-meta' }, meta.join(' · '))
        ),
        deck.root
      );
      deck.start();
    }

    function select(i, dir, announce) {
      if (i === cur && deck) return;
      cur = i;
      const c = CATEGORIES[i];
      knobs.forEach((k, j) => {
        k.setAttribute('aria-selected', String(j === i));
        k.tabIndex = j === i ? 0 : -1;
      });
      root.style.setProperty('--cat', c.color);
      KG.store.set('hub:cat', c.id);
      if (location.hash !== '#/c/' + c.id) history.replaceState(null, '', '#/c/' + c.id);
      renderPanel(dir);
      if (announce) status.textContent = `${c.title}（${i + 1}/${N}）`;
    }

    // ---------------------------------------------------------- 转动
    // 辐条 i 的角度 = i·STEP + angle（从正上方顺时针）；angle = −i·STEP 时辐条 i 在正上方
    let angle = -cur * STEP;
    let target = angle;
    let vel = 0;
    let stiff = 150;
    let raf = 0;
    let last = 0;
    let wd = wheel.offsetWidth || 1;
    let topIdx = -1;

    function paint() {
      svg.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      const R = wd * 0.46;
      const plate = wd * 0.125;
      knobs.forEach((k, i) => {
        const a = ((i * STEP + angle) * Math.PI) / 180;
        const sin = Math.sin(a);
        const cos = Math.cos(a);
        k.style.transform = `translate(${(R * sin).toFixed(1)}px, ${(-R * cos).toFixed(1)}px)`;
        k.style.setProperty('--px', (-plate * sin).toFixed(1) + 'px');
        k.style.setProperty('--py', (plate * cos).toFixed(1) + 'px');
      });
      const t = mod(Math.round(-angle / STEP));
      if (t !== topIdx) {
        if (topIdx >= 0) {
          knobs[topIdx].classList.remove('is-top');
          spokes[topIdx].classList.remove('on');
        }
        topIdx = t;
        knobs[t].classList.add('is-top');
        spokes[t].classList.add('on');
      }
      for (const k of ['far', 'mid', 'near', 'sea']) {
        const w = k === 'sea' ? art.sea.w : art[k].w;
        const x = (((-angle * PAN[k]) % w) + w) % w;
        layers[k].style.transform = `translate3d(${(x - w).toFixed(1)}px, 0, 0)`;
      }
    }

    // 弹簧：略欠阻尼，停下时有一点"咔哒"回弹
    function tick(now) {
      raf = 0;
      let dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const damp = 2 * 0.78 * Math.sqrt(stiff);
      while (dt > 0) {
        const d = Math.min(dt, 1 / 120);
        vel += (stiff * (target - angle) - damp * vel) * d;
        angle += vel * d;
        dt -= d;
      }
      if (Math.abs(target - angle) < 0.03 && Math.abs(vel) < 0.5) {
        angle = target;
        vel = 0;
      }
      paint();
      if (angle !== target || vel !== 0) raf = requestAnimationFrame(tick);
      else last = 0;
    }
    function animate() {
      if (reducedMotion()) {
        angle = target;
        vel = 0;
        paint();
        return;
      }
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    }
    function stopAnim() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }

    // 转到辐条 i：选离当前目标最近的等价角度，不绕远路
    function turnTo(i, opts = {}) {
      if (drag && drag.moved) return;
      i = mod(i);
      const base = -i * STEP;
      const from = opts.from ?? target;
      target = base + 360 * Math.round((from - base) / 360);
      stiff = 150;
      if (opts.vel != null) vel = opts.vel;
      const dir = opts.dir ?? (i === cur ? 0 : Math.sign(-(target - from)) || 1);
      select(i, dir, opts.announce);
      animate();
    }
    const step = (dir, announce = true) => turnTo(cur + dir, { dir, announce });

    // ---------------------------------------------------------- 拖动
    let drag = null;
    let suppressClick = false;
    const pointerAngle = (e) => (Math.atan2(e.clientX - drag.cx, drag.cy - e.clientY) * 180) / Math.PI;

    wheel.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = wheel.getBoundingClientRect();
      drag = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, x0: e.clientX, y0: e.clientY, moved: false, samples: [] };
      drag.last = pointerAngle(e);
    });
    wheel.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
        drag.moved = true;
        wheel.classList.add('dragging');
        stopAnim();
        vel = 0;
        try {
          wheel.setPointerCapture(e.pointerId);
        } catch (err) {
          /* 指针已经抬起 */
        }
      }
      const a = pointerAngle(e);
      angle += ((a - drag.last + 540) % 360) - 180;
      drag.last = a;
      target = angle;
      drag.samples.push({ t: e.timeStamp, a: angle });
      while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
      paint();
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      wheel.classList.remove('dragging');
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      // 停住再松手就没有惯性
      const first = d.samples[0];
      const lastS = d.samples[d.samples.length - 1];
      const dt = first && lastS.t > first.t && e.timeStamp - lastS.t < 80 ? (lastS.t - first.t) / 1000 : 0;
      const v = dt ? Math.max(-1200, Math.min(1200, (lastS.a - first.a) / dt)) : 0;
      const projected = angle + v * 0.18;
      const i = mod(Math.round(-projected / STEP));
      turnTo(i, { from: projected, vel: v, dir: Math.sign(-v) || 1, announce: true });
    };
    wheel.addEventListener('pointerup', endDrag);
    wheel.addEventListener('pointercancel', endDrag);
    wheel.addEventListener(
      'click',
      (e) => {
        if (!suppressClick) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );

    // ---------------------------------------------------------- 滚轮
    // 一次手势（包括触控板的惯性滚动）只转一格：转过之后，要安静 160ms 才接受下一格
    let wheelAcc = 0;
    let wheelLock = 0;
    helm.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) return;
        e.preventDefault();
        const now = performance.now();
        if (now < wheelLock) {
          wheelLock = now + 160;
          return;
        }
        const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        wheelAcc += d * (e.deltaMode === 1 ? 40 : 1);
        if (Math.abs(wheelAcc) >= 40) {
          step(Math.sign(wheelAcc));
          wheelAcc = 0;
          wheelLock = now + 160;
        }
      },
      { passive: false }
    );

    // ---------------------------------------------------------- 键盘
    tablist.addEventListener('keydown', (e) => {
      const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      const i = dir ? mod(cur + dir) : e.key === 'Home' ? 0 : e.key === 'End' ? N - 1 : null;
      if (i == null) return;
      e.preventDefault();
      turnTo(i);
      knobs[i].focus({ preventScroll: true });
    });
    const onKey = (e) => {
      const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable], .hh-track')) return;
      if (document.querySelector('.modal-overlay')) return;
      e.preventDefault();
      step(dir);
    };
    document.addEventListener('keydown', onKey);

    const ro = new ResizeObserver(() => {
      wd = wheel.offsetWidth || 1;
      paint();
    });
    ro.observe(wheel);

    // ---------------------------------------------------------- 开场
    select(cur, 0, false);
    target = -cur * STEP;
    if (!introDone && !reducedMotion()) {
      // 第一次打开时舵轮从左边转进来
      angle = target - 150;
      stiff = 34;
      paint();
      animate();
    } else {
      angle = target;
      paint();
    }
    introDone = true;

    return () => {
      stopAnim();
      ro.disconnect();
      if (deck) deck.dispose();
      document.removeEventListener('keydown', onKey);
      delete document.documentElement.dataset.view;
    };
  };
})();
