/* Kube 游乐场 —— 大厅：转动 7 辐舵轮选大类，大类里的游戏卡片在旁边轮动 */
(function () {
  'use strict';
  const { h, s } = KG;

  // 7 个大类，正好是 K8s 舵轮的 7 根辐条（从正上方开始顺时针）。
  // entries 是已上线的游戏（mode 指向游戏里的某个小游戏），soon 是"即将开放"的占位。
  // en 里是英文文案，KG.loc 按当前语言取。
  const CATEGORIES = [
    {
      id: 'container',
      icon: '📦',
      title: '容器',
      color: '#f472b6',
      tagline: '单个容器怎么活下去：资源、QoS、OOM、探针',
      en: { title: 'Container', tagline: 'How a single container stays alive: resources, QoS, OOM, probes' },
      entries: [{ game: 'resources' }],
      soon: [
        {
          icon: '🩺',
          title: '探针急诊室',
          tagline: '探针配错了会怎样：重启风暴、流量打到还没准备好的 Pod',
          concepts: ['livenessProbe', 'readinessProbe', 'startupProbe', 'restartPolicy'],
          en: { title: 'Probe ER', tagline: "What misconfigured probes do: restart storms, traffic sent to Pods that aren't ready" },
        },
        {
          icon: '📥',
          title: '镜像拉取',
          tagline: '镜像什么时候拉、从哪拉、拉不下来会怎样',
          concepts: ['imagePullPolicy', 'ImagePullBackOff', 'imagePullSecrets'],
          en: { title: 'Image Pulls', tagline: 'When images are pulled, from where, and what happens when a pull fails' },
        },
      ],
    },
    {
      id: 'scheduling',
      icon: '🧭',
      title: '调度',
      color: '#60a5fa',
      tagline: 'Pod 该落到哪个节点：装箱、污点、亲和、抢占',
      en: { title: 'Scheduling', tagline: 'Which node a Pod lands on: bin packing, taints, affinity, preemption' },
      entries: [{ game: 'scheduler' }],
      soon: [
        {
          icon: '🧲',
          title: '亲和与拓扑分布',
          tagline: '让 Pod 扎堆或者散开，跨可用区均匀分布',
          concepts: ['nodeAffinity', 'podAntiAffinity', 'topologySpreadConstraints'],
          en: { title: 'Affinity & Topology Spread', tagline: 'Pack Pods together or spread them evenly across zones' },
        },
        {
          icon: '⚔️',
          title: '优先级与抢占',
          tagline: '资源不够的时候，谁给谁让位',
          concepts: ['PriorityClass', 'Preemption', 'PDB'],
          en: { title: 'Priority & Preemption', tagline: 'When resources run out, who makes way for whom' },
        },
      ],
    },
    {
      id: 'workloads',
      icon: '⚙️',
      title: '工作负载',
      color: '#34d399',
      tagline: '控制器怎么维持期望状态，又怎么平稳发布',
      en: { title: 'Workloads', tagline: 'How controllers hold the desired state and roll out safely' },
      entries: [{ game: 'replicaset' }, { game: 'rollout' }],
      soon: [
        {
          icon: '🔢',
          title: 'StatefulSet 有序启停',
          tagline: '稳定的名字和存储，按序号一个一个来',
          concepts: ['StatefulSet', 'Headless Service', 'podManagementPolicy'],
          en: { title: 'StatefulSet Ordering', tagline: 'Stable names and storage, started one ordinal at a time' },
        },
        {
          icon: '⏱️',
          title: 'Job 与 CronJob',
          tagline: '跑完就结束的任务：并行、重试、定时',
          concepts: ['Job', 'backoffLimit', 'CronJob', 'concurrencyPolicy'],
          en: { title: 'Jobs & CronJobs', tagline: 'Run-to-completion tasks: parallelism, retries, schedules' },
        },
      ],
    },
    {
      id: 'networking',
      icon: '🌐',
      title: '网络',
      color: '#22d3ee',
      tagline: '流量怎么找到 Pod：Service、DNS、网络策略',
      en: { title: 'Networking', tagline: 'How traffic finds a Pod: Services, DNS, network policies' },
      entries: [{ game: 'selector' }],
      soon: [
        {
          icon: '📨',
          title: '数据包之旅',
          tagline: '跟着一个请求，从 DNS 一路走到 Pod',
          concepts: ['ClusterIP', 'kube-proxy', 'CoreDNS', 'Ingress / Gateway'],
          en: { title: "A Packet's Journey", tagline: 'Follow one request from DNS all the way to a Pod' },
        },
        {
          icon: '🧱',
          title: 'NetworkPolicy 防火墙',
          tagline: '默认全通；一旦被策略选中，就只放行允许的流量',
          concepts: ['NetworkPolicy', 'ingress / egress', 'default deny'],
          en: { title: 'NetworkPolicy Firewall', tagline: 'All traffic flows until a policy selects a Pod; then only what it allows' },
        },
      ],
    },
    {
      id: 'storage',
      icon: '💾',
      title: '存储',
      color: '#fbbf24',
      tagline: '数据放在哪里，Pod 重建以后还在不在',
      en: { title: 'Storage', tagline: 'Where data lives, and whether it survives a Pod being recreated' },
      entries: [],
      soon: [
        {
          icon: '🔗',
          title: 'PVC 配对',
          tagline: '把 PVC 配给合适的 PV，或者让 StorageClass 现造一个',
          concepts: ['PV / PVC', 'StorageClass', 'accessModes', 'reclaimPolicy'],
          en: { title: 'PVC Matchmaking', tagline: 'Bind a PVC to the right PV, or have a StorageClass provision one' },
        },
      ],
    },
    {
      id: 'security',
      icon: '🔐',
      title: '安全',
      color: '#f87171',
      tagline: '谁能对集群做什么，容器能对节点做什么',
      en: { title: 'Security', tagline: 'Who can do what to the cluster, and what a container can do to its node' },
      entries: [],
      soon: [
        {
          icon: '🚪',
          title: 'RBAC 门禁',
          tagline: '给 ServiceAccount 刚好够用的权限',
          concepts: ['Role / ClusterRole', 'RoleBinding', 'ServiceAccount'],
          en: { title: 'RBAC Gatekeeper', tagline: 'Give a ServiceAccount exactly the permissions it needs' },
        },
        {
          icon: '🛡️',
          title: 'SecurityContext 加固',
          tagline: '不用 root 运行、只读根文件系统、收回多余的 capability',
          concepts: ['runAsNonRoot', 'capabilities', 'Pod Security Admission'],
          en: { title: 'SecurityContext Hardening', tagline: 'No root, a read-only root filesystem, no extra capabilities' },
        },
      ],
    },
    {
      id: 'operator',
      icon: '🤖',
      title: 'Operator',
      color: '#a78bfa',
      tagline: '用 CRD 和控制器扩展 K8s：Informer、Reconcile、Finalizer',
      en: { title: 'Operator', tagline: 'Extend Kubernetes with CRDs and controllers: Informer, Reconcile, Finalizer' },
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
      return { href: '#/' + g.id, icon: g.icon, title: KG.loc(g, 'title'), tagline: KG.loc(g, 'tagline'), concepts: KG.loc(g, 'concepts'), color: g.color, prog: g.progress ? g.progress() : null };
    }
    const m = g.modes.find((x) => x.id === e.mode);
    const ids = m.stars || [];
    return {
      href: `#/${g.id}/${m.id}`,
      icon: m.icon,
      title: KG.loc(m, 'title'),
      tagline: KG.loc(m, 'tagline'),
      concepts: KG.loc(m, 'concepts') || [],
      color: g.color,
      prog: ids.length ? { got: ids.reduce((a, id) => a + KG.getStars(g.id, id), 0), total: ids.length * 3 } : null,
    };
  }

  function sumProgress(infos) {
    return infos.reduce((a, x) => (x && x.prog ? { got: a.got + x.prog.got, total: a.total + x.prog.total } : a), { got: 0, total: 0 });
  }

  // ---------------------------------------------------------------- 舵轮图形
  // 木制舵轮加黄铜配件。viewBox 以轮心为原点，半径 50 对应舵轮宽度的一半
  const ring = (r) => `M${r} 0 A${r} ${r} 0 1 0 ${-r} 0 A${r} ${r} 0 1 0 ${r} 0 Z`;
  // 车削把手：从轮缘外侧到末端的球形握柄（辐条朝上的局部坐标）
  const HANDLE = 'M-1.3 -34 L-1.3 -36 C-2.5 -36.8 -2.5 -38.7 -1.1 -39.4 L-1.1 -40.2 C-2.7 -40.9 -2.9 -44.9 0 -45.8 C2.9 -44.9 2.7 -40.9 1.1 -40.2 L1.1 -39.4 C2.5 -38.7 2.5 -36.8 1.3 -36 L1.3 -34 Z';

  function gradient(tag, attrs, stops) {
    return s(tag, attrs, stops.map(([offset, color]) => s('stop', { offset, 'stop-color': color })));
  }

  function wheelArt() {
    const at = (r, deg) => ({ cx: (r * Math.sin((deg * Math.PI) / 180)).toFixed(2), cy: (-r * Math.cos((deg * Math.PI) / 180)).toFixed(2) });
    const defs = s(
      'defs',
      null,
      // 辐条横截面的明暗：跟着辐条一起转，像圆木
      gradient('linearGradient', { id: 'hh-wood-spoke', gradientUnits: 'userSpaceOnUse', x1: -1.6, y1: 0, x2: 1.6, y2: 0 }, [
        [0, '#4e2a10'],
        [0.4, '#c68a4a'],
        [0.6, '#a86a31'],
        [1, '#4a270e'],
      ]),
      // 轮缘截面的明暗：沿半径变化，转动时看起来不变
      gradient('radialGradient', { id: 'hh-wood-rim', gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 35 }, [
        [0.81, '#4e2a10'],
        [0.84, '#8a5226'],
        [0.89, '#c98d4c'],
        [0.94, '#b0733a'],
        [0.97, '#7a4520'],
        [0.99, '#4a270e'],
      ]),
      gradient('radialGradient', { id: 'hh-wood-hub', gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 12.5 }, [
        [0.6, '#a86a31'],
        [0.85, '#7a4520'],
        [1, '#4a270e'],
      ])
    );
    const spokes = CATEGORIES.map((c, i) =>
      s(
        'g',
        { class: 'hh-spoke', style: '--c:' + c.color, transform: `rotate(${(i * STEP).toFixed(3)})` },
        s('rect', { class: 'hh-wood', x: -1.3, y: -34.5, width: 2.6, height: 23.5, rx: 0.6 }),
        s('path', { class: 'hh-wood', d: HANDLE }),
        s('rect', { class: 'hh-collar', x: -1.7, y: -35.3, width: 3.4, height: 1.2, rx: 0.3 }),
        s('line', { class: 'hh-inlay', x1: 0, y1: -28, x2: 0, y2: -14 })
      )
    );
    const svg = s(
      'svg',
      { class: 'hh-wheel-art', viewBox: '-50 -50 100 100', 'aria-hidden': 'true' },
      defs,
      spokes,
      s('path', { class: 'hh-rim', d: ring(34.5) + ring(28.5), 'fill-rule': 'evenodd' }),
      s('circle', { class: 'hh-grain', r: 29.8 }),
      s('circle', { class: 'hh-grain', r: 33.2 }),
      s('circle', { class: 'hh-band', r: 31.5 }),
      CATEGORIES.map((_, i) => s('circle', { class: 'hh-cap', r: 1.3, ...at(31.5, i * STEP) })),
      s('circle', { class: 'hh-hub-wood', r: 12.5 }),
      CATEGORIES.map((_, i) => s('circle', { class: 'hh-cap', r: 0.8, ...at(10.8, i * STEP + STEP / 2) }))
    );
    return { svg, spokes };
  }

  // ---------------------------------------------------------------- 卡片轮动
  // 横向 scroll-snap 行：每张卡的 --focus（居中为 1，离开一张为 0）和 --shift（带符号的偏移）
  // 跟随滚动位置，侧面的卡片转向中间、缩小、变暗
  function carousel(slides) {
    const track = h('div', { class: 'hh-track' }, slides);
    const dots = slides.map((_, i) => h('button', { class: 'hh-dot', 'aria-label': KG.t(`第 ${i + 1} 张`, `Card ${i + 1}`), onclick: () => go(i) }));
    const prev = h('button', { class: 'hh-arrow', 'aria-label': KG.t('上一张', 'Previous'), onclick: () => go(active - 1) }, '‹');
    const next = h('button', { class: 'hh-arrow', 'aria-label': KG.t('下一张', 'Next'), onclick: () => go(active + 1) }, '›');
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
          info.prog ? h('span', { class: 'hh-score' + (info.prog.got ? ' got' : '') }, `★ ${info.prog.got}/${info.prog.total}`) : h('span', { class: 'hh-score' }, KG.t('动画演示', 'Walkthrough')),
          h('span', { class: 'hh-art', 'aria-hidden': 'true' }, info.icon)
        ),
        h(
          'div',
          { class: 'hh-body' },
          h('h3', null, info.title),
          h('p', null, info.tagline),
          h('div', { class: 'hh-chips' }, info.concepts.slice(0, 4).map((c) => h('span', { class: 'hh-chip' }, c))),
          h('span', { class: 'hh-go' }, KG.t('开始 →', 'Play →'))
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
          h('span', { class: 'hh-score' }, KG.t('🔒 即将开放', '🔒 Coming soon')),
          h('span', { class: 'hh-art', 'aria-hidden': 'true' }, item.icon)
        ),
        h(
          'div',
          { class: 'hh-body' },
          h('h3', null, KG.loc(item, 'title')),
          h('p', null, KG.loc(item, 'tagline')),
          h('div', { class: 'hh-chips' }, item.concepts.slice(0, 4).map((c) => h('span', { class: 'hh-chip' }, c))),
          h('span', { class: 'hh-go' }, KG.t('建设中', 'In the works'))
        )
      )
    );
  }

  // ---------------------------------------------------------------- 大厅
  let introDone = false;

  KG.renderHub = function (app, wanted) {
    document.title = KG.siteTitle();
    document.documentElement.dataset.view = 'hub';
    const scene = KG.hubScene();
    const saved = KG.store.get('hub:cat', null);
    let cur = Math.max(0, CATEGORIES.findIndex((c) => c.id === (wanted || saved)));

    const total = sumProgress(CATEGORIES.flatMap((c) => c.entries.map(entryInfo)));

    // 舵轮
    const { svg, spokes } = wheelArt();
    const knobs = CATEGORIES.map((c, i) =>
      h(
        'button',
        { class: 'hh-knob', role: 'tab', id: 'hh-tab-' + c.id, 'aria-controls': 'hh-panel', 'aria-selected': 'false', tabindex: '-1', style: { '--c': c.color }, onclick: () => turnTo(i) },
        h('span', { class: 'hh-medal', 'aria-hidden': 'true' }, c.icon),
        h('span', { class: 'hh-nameplate' }, KG.loc(c, 'title'))
      )
    );
    const tablist = h('div', { class: 'hh-knobs', role: 'tablist', 'aria-label': KG.t('大类', 'Topics') }, knobs);
    // 轮心的黄铜盖不跟着转，高光才不会乱跑
    const hub = h('div', { class: 'hh-hub' }, h('span', { class: 'sr-only' }, KG.t('全部星星', 'Total stars')), h('span', { class: 'hh-hub-got' }, '★ ' + total.got), h('span', { class: 'hh-hub-total' }, '/ ' + total.total));
    // 指针固定在"选中"的方位（手机在正上方，宽屏在正右方，指向卡片）
    const pointer = h('div', { class: 'hh-pointer', 'aria-hidden': 'true' });
    const wheel = h('div', { class: 'hh-wheel' }, svg, hub, pointer, tablist);
    const helm = h('div', { class: 'hh-helm' }, wheel);

    const panel = h('section', { class: 'hh-panel', id: 'hh-panel', role: 'tabpanel' });
    const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });

    const root = h(
      'div',
      { class: 'hh', style: { '--cat': CATEGORIES[cur].color } },
      scene.el,
      h(
        'header',
        { class: 'hh-head' },
        h(
          'div',
          { class: 'hh-brand' },
          // 左上角的舵轮图标回到 nphunter 主页
          h('a', { class: 'hh-logo', href: 'https://nphunter.gg/', title: KG.t('返回 NPHunter 主页', 'Back to NPHunter'), 'aria-label': KG.t('返回 NPHunter 主页', 'Back to NPHunter') }, h('span', { 'aria-hidden': 'true' }, '⎈')),
          h('div', null, h('h1', null, KG.siteTitle()), h('p', null, KG.t('用小游戏理解 Kubernetes。Kubernetes 在希腊语里就是"舵手"。', 'Learn Kubernetes through mini-games. "Kubernetes" is Greek for helmsman.')))
        ),
        h(
          'div',
          { class: 'hh-tools' },
          h('p', { class: 'hh-hint' }, h('span', { class: 'hh-hint-wide' }, KG.t('拖动舵轮、滚动滚轮或按 ← → 切换大类', 'Drag the wheel, scroll on it, or press ← → to switch topics')), h('span', { class: 'hh-hint-narrow' }, KG.t('拖动舵轮切换大类', 'Drag the wheel to switch topics'))),
          h(
            'select',
            {
              class: 'hh-lang',
              'aria-label': KG.t('选择语言', 'Language'),
              onchange: (e) => {
                KG.setLang(e.target.value);
                const again = document.querySelector('.hh-lang');
                if (again) again.focus();
              },
            },
            h('option', { value: 'zh', lang: 'zh-CN', selected: KG.lang === 'zh' }, '中文'),
            h('option', { value: 'en', lang: 'en', selected: KG.lang === 'en' }, 'English')
          )
        )
      ),
      h('main', { class: 'hh-main' }, helm, panel),
      h(
        'footer',
        { class: 'hh-foot' },
        h('span', null, KG.t('进度保存在本地浏览器。', 'Progress is saved in this browser.')),
        h(
          'button',
          {
            class: 'hh-reset',
            onclick: () => {
              if (!confirm(KG.t('确定清空所有星星和进度？', 'Clear all stars and progress?'))) return;
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
          KG.t('重置进度', 'Reset progress')
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
      const games = KG.t(`${infos.length} 个游戏`, infos.length === 1 ? '1 game' : `${infos.length} games`);
      const meta = [infos.length ? games : KG.t('还没有上线的游戏', 'No games yet'), c.soon.length ? KG.t(`${c.soon.length} 个即将开放`, `${c.soon.length} coming soon`) : null, prog.total ? `★ ${prog.got} / ${prog.total}` : null].filter(Boolean);
      panel.style.setProperty('--dir', dir);
      panel.setAttribute('aria-labelledby', 'hh-tab-' + c.id);
      KG.fill(
        panel,
        h(
          'div',
          { class: 'hh-cat' },
          h('div', { class: 'hh-kicker mono' }, `${String(cur + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}` + KG.t(` · ${c.en.title}`, '')),
          h('h2', null, h('span', { class: 'hh-cat-icon', 'aria-hidden': 'true' }, c.icon), KG.loc(c, 'title')),
          h('p', { class: 'hh-cat-tag' }, KG.loc(c, 'tagline')),
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
      if (announce) status.textContent = KG.t(`${c.title}（${i + 1}/${N}）`, `${c.en.title} (${i + 1}/${N})`);
    }

    // ---------------------------------------------------------- 转动
    // 辐条 i 的角度 = i·STEP + angle（从正上方顺时针）。指针所在的方位 A 由 CSS 的 --active 决定
    // （手机 0° 正上方，宽屏 90° 正右方）；angle = A − i·STEP 时辐条 i 被选中
    const readActive = () => parseFloat(getComputedStyle(root).getPropertyValue('--active')) || 0;
    let A = readActive();
    let angle = A - cur * STEP;
    let target = angle;
    let vel = 0;
    let stiff = 150;
    let raf = 0;
    let last = 0;
    let wd = wheel.offsetWidth || 1;
    let onIdx = -1;

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
      const t = mod(Math.round((A - angle) / STEP));
      if (t !== onIdx) {
        if (onIdx >= 0) {
          knobs[onIdx].classList.remove('is-on');
          spokes[onIdx].classList.remove('on');
        }
        onIdx = t;
        knobs[t].classList.add('is-on');
        spokes[t].classList.add('on');
      }
      scene.pan(angle);
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
      const base = A - i * STEP;
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
      const i = mod(Math.round((A - projected) / STEP));
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

    // 跨过宽屏断点时指针换了方位：整个舵轮跟着转过去，选中的大类不变
    const ro = new ResizeObserver(() => {
      const a = readActive();
      if (a !== A) {
        angle += a - A;
        target += a - A;
        A = a;
      }
      wd = wheel.offsetWidth || 1;
      paint();
    });
    ro.observe(wheel);
    ro.observe(root);

    // ---------------------------------------------------------- 开场
    select(cur, 0, false);
    target = A - cur * STEP;
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
