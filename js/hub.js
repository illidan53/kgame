/* Kube 游乐场 —— 大厅：转动 7 辐黏土舵轮选大类，大类里的游戏像一手牌一样在旁边展开 */
(function () {
  'use strict';
  const { h, s } = KG;

  // 7 个大类，正好是 K8s 舵轮的 7 根辐条（从正上方开始顺时针）。
  // entries 是已上线的游戏（mode 指向游戏里的某个小游戏），soon 是"即将开放"的占位。
  // glyph 是 js/icons.js 里的图标名；en 里是英文文案，KG.loc 按当前语言取。
  const CATEGORIES = [
    {
      id: 'container',
      glyph: 'box',
      title: '容器',
      color: '#f472b6',
      tagline: '单个容器怎么活下去：资源、QoS、OOM、探针',
      en: { title: 'Container', tagline: 'How a single container stays alive: resources, QoS, OOM, probes' },
      entries: [{ game: 'resources' }],
      soon: [
        { glyph: 'pulse', title: '探针急诊室', tagline: '探针配错了会怎样：重启风暴、流量打到还没准备好的 Pod', en: { title: 'Probe ER', tagline: "What misconfigured probes do: restart storms, traffic sent to Pods that aren't ready" } },
        { glyph: 'download', title: '镜像拉取', tagline: '镜像什么时候拉、从哪拉、拉不下来会怎样', en: { title: 'Image Pulls', tagline: 'When images are pulled, from where, and what happens when a pull fails' } },
      ],
    },
    {
      id: 'scheduling',
      glyph: 'compass',
      title: '调度',
      color: '#60a5fa',
      tagline: 'Pod 该落到哪个节点：装箱、污点、亲和、抢占',
      en: { title: 'Scheduling', tagline: 'Which node a Pod lands on: bin packing, taints, affinity, preemption' },
      entries: [{ game: 'scheduler' }],
      soon: [
        { glyph: 'magnet', title: '亲和与拓扑分布', tagline: '让 Pod 扎堆或者散开，跨可用区均匀分布', en: { title: 'Affinity & Topology Spread', tagline: 'Pack Pods together or spread them evenly across zones' } },
        { glyph: 'priority', title: '优先级与抢占', tagline: '资源不够的时候，谁给谁让位', en: { title: 'Priority & Preemption', tagline: 'When resources run out, who makes way for whom' } },
      ],
    },
    {
      id: 'workloads',
      glyph: 'gear',
      title: '工作负载',
      color: '#34d399',
      tagline: '控制器怎么维持期望状态，又怎么平稳发布',
      en: { title: 'Workloads', tagline: 'How controllers hold the desired state and roll out safely' },
      entries: [{ game: 'replicaset' }, { game: 'rollout' }],
      soon: [
        { glyph: 'ordered', title: 'StatefulSet 有序启停', tagline: '稳定的名字和存储，按序号一个一个来', en: { title: 'StatefulSet Ordering', tagline: 'Stable names and storage, started one ordinal at a time' } },
        { glyph: 'clock', title: 'Job 与 CronJob', tagline: '跑完就结束的任务：并行、重试、定时', en: { title: 'Jobs & CronJobs', tagline: 'Run-to-completion tasks: parallelism, retries, schedules' } },
      ],
    },
    {
      id: 'networking',
      glyph: 'globe',
      title: '网络',
      color: '#22d3ee',
      tagline: '流量怎么找到 Pod：Service、DNS、网络策略',
      en: { title: 'Networking', tagline: 'How traffic finds a Pod: Services, DNS, network policies' },
      entries: [{ game: 'selector' }],
      soon: [
        { glyph: 'send', title: '数据包之旅', tagline: '跟着一个请求，从 DNS 一路走到 Pod', en: { title: "A Packet's Journey", tagline: 'Follow one request from DNS all the way to a Pod' } },
        { glyph: 'wall', title: 'NetworkPolicy 防火墙', tagline: '默认全通；一旦被策略选中，就只放行允许的流量', en: { title: 'NetworkPolicy Firewall', tagline: 'All traffic flows until a policy selects a Pod; then only what it allows' } },
      ],
    },
    {
      id: 'storage',
      glyph: 'db',
      title: '存储',
      color: '#fbbf24',
      tagline: '数据放在哪里，Pod 重建以后还在不在',
      en: { title: 'Storage', tagline: 'Where data lives, and whether it survives a Pod being recreated' },
      entries: [],
      soon: [{ glyph: 'link', title: 'PVC 配对', tagline: '把 PVC 配给合适的 PV，或者让 StorageClass 现造一个', en: { title: 'PVC Matchmaking', tagline: 'Bind a PVC to the right PV, or have a StorageClass provision one' } }],
    },
    {
      id: 'security',
      glyph: 'shield',
      title: '安全',
      color: '#f87171',
      tagline: '谁能对集群做什么，容器能对节点做什么',
      en: { title: 'Security', tagline: 'Who can do what to the cluster, and what a container can do to its node' },
      entries: [],
      soon: [
        { glyph: 'key', title: 'RBAC 门禁', tagline: '给 ServiceAccount 刚好够用的权限', en: { title: 'RBAC Gatekeeper', tagline: 'Give a ServiceAccount exactly the permissions it needs' } },
        { glyph: 'lock', title: 'SecurityContext 加固', tagline: '不用 root 运行、只读根文件系统、收回多余的 capability', en: { title: 'SecurityContext Hardening', tagline: 'No root, a read-only root filesystem, no extra capabilities' } },
      ],
    },
    {
      id: 'operator',
      glyph: 'bot',
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
    const m = e.mode ? g.modes.find((x) => x.id === e.mode) : null;
    const src = m || g;
    let prog = null;
    if (m) {
      const ids = m.stars || [];
      if (ids.length) prog = { got: ids.reduce((a, id) => a + KG.getStars(g.id, id), 0), total: ids.length * 3 };
    } else if (g.progress) prog = g.progress();
    return { href: m ? `#/${g.id}/${m.id}` : '#/' + g.id, glyph: src.glyph, title: KG.loc(src, 'title'), blurb: KG.loc(src, 'blurb'), prog };
  }

  function sumProgress(infos) {
    return infos.reduce((a, x) => (x && x.prog ? { got: a.got + x.prog.got, total: a.total + x.prog.total } : a), { got: 0, total: 0 });
  }

  // ---------------------------------------------------------------- 舵轮图形
  // 黏土质感：几何形状跟着转，光影不转——高光永远在左上、阴影永远在右下，转起来才像实物。
  // 颜色全部由当前大类色 --cat 推出来（见 css 的 --clay-*），换大类时整只舵轮跟着换色。
  // 分三层：转动层（辐条、轮毂法兰、螺栓）、静止层（轮缘和它的高光阴影）、HTML 的轮心盖和把手球。
  // viewBox 以轮心为原点，半径 50 对应舵轮宽度的一半。
  const LIGHT = [-0.6, -0.8]; // 光从左上来
  const arc = (r, a0, a1) => {
    const p = (a) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
    return `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`;
  };

  function wheelArt() {
    const hl = [];
    const spokes = CATEGORIES.map((_, i) => {
      const left = s('line', { class: 'hh-sp-hl', x1: -1.25, y1: -14, x2: -1.25, y2: -38 });
      const right = s('line', { class: 'hh-sp-hl', x1: 1.25, y1: -14, x2: 1.25, y2: -38 });
      hl.push([left, right]);
      return s('g', { transform: `rotate(${(i * STEP).toFixed(3)})` }, s('line', { class: 'hh-sp', x1: 0, y1: -11, x2: 0, y2: -41 }), left, right);
    });
    const bolts = CATEGORIES.map((_, i) => {
      const a = ((i + 0.5) * STEP * Math.PI) / 180;
      return s('circle', { class: 'hh-bolt', r: 1.05, cx: (15.3 * Math.sin(a)).toFixed(2), cy: (-15.3 * Math.cos(a)).toFixed(2) });
    });
    const spin = s('svg', { class: 'hh-wheel-spin', viewBox: '-50 -50 100 100', 'aria-hidden': 'true' }, spokes, s('circle', { class: 'hh-flange', r: 17.5 }), bolts);
    // 轮缘是一根圆管：沿半径方向的渐变就是截面的明暗，转动时看起来不变
    const rim = s(
      'svg',
      { class: 'hh-wheel-rim', viewBox: '-50 -50 100 100', 'aria-hidden': 'true' },
      s(
        'defs',
        null,
        s(
          'radialGradient',
          { id: 'hh-rim-g', gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 39 },
          [
            ['0.72', 's0'],
            ['0.79', 's1'],
            ['0.86', 's2'],
            ['0.93', 's3'],
            ['1', 's0'],
          ].map(([offset, cls]) => s('stop', { offset, class: cls }))
        ),
        s('filter', { id: 'hh-soft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, s('feGaussianBlur', { stdDeviation: 0.7 }))
      ),
      s('circle', { class: 'hh-rim', r: 34 }),
      s('path', { class: 'hh-rim-light', d: arc(36.2, -2.7, -1.1), filter: 'url(#hh-soft)' }),
      s('path', { class: 'hh-rim-shade', d: arc(31.3, 0.5, 2.1), filter: 'url(#hh-soft)' })
    );
    return { spin, rim, hl };
  }

  // 左上角的小舵轮，链接回 nphunter 主页
  function logoMark() {
    const spokes = Array.from({ length: 7 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 7;
      return `M${(3.2 * Math.sin(a)).toFixed(2)} ${(-3.2 * Math.cos(a)).toFixed(2)}L${(10.5 * Math.sin(a)).toFixed(2)} ${(-10.5 * Math.cos(a)).toFixed(2)}`;
    }).join('');
    return h('span', {
      class: 'hh-logo-mark',
      'aria-hidden': 'true',
      html: `<svg viewBox="-12 -12 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle r="7"/><circle r="2.4"/><path d="${spokes}"/></svg>`,
    });
  }

  // ---------------------------------------------------------------- 卡牌
  // 正面只有插画、标题、三颗星；点一下翻面才看到一句话简介和"开始"。未上线的游戏是背面朝上的牌。
  const starRow = (prog) => {
    const n = prog && prog.total ? Math.floor((3 * prog.got) / prog.total) : 0;
    return h('span', { class: 'kc-stars', 'aria-hidden': 'true' }, '★'.repeat(n), h('i', null, '★'.repeat(3 - n)));
  };

  function liveCard(info) {
    const progText = info.prog ? KG.t(`${info.prog.got} / ${info.prog.total} 星`, `${info.prog.got} of ${info.prog.total} stars`) : KG.t('动画演示', 'Walkthrough');
    const front = h(
      'button',
      { class: 'kc-face kc-front', 'aria-label': info.title + KG.t('，', ', ') + progText, 'aria-expanded': 'false' },
      h('span', { class: 'kc-inner' }, h('span', { class: 'kc-art' }, KG.icon(info.glyph), h('span', { class: 'kc-sheen' })), h('span', { class: 'kc-title' }, info.title), info.prog ? starRow(info.prog) : h('span', { class: 'kc-demo' }, KG.t('演示', 'Demo')))
    );
    const back = h(
      'a',
      { class: 'kc-face kc-back', href: info.href, tabindex: '-1', 'aria-hidden': 'true' },
      h(
        'span',
        { class: 'kc-inner' },
        h('span', { class: 'kc-title' }, info.title),
        h('span', { class: 'kc-blurb' }, info.blurb),
        h('span', { class: 'kc-count' }, info.prog ? `★ ${info.prog.got} / ${info.prog.total}` : progText),
        h('span', { class: 'kc-go' }, KG.t('开始', 'Play'), ' →')
      )
    );
    return h('div', { class: 'kc' }, h('div', { class: 'kc-flip' }, front, back));
  }

  function soonCard(item) {
    const title = KG.loc(item, 'title');
    return h(
      'div',
      { class: 'kc soon', role: 'img', 'aria-label': KG.t(`即将开放：${title}`, `Coming soon: ${title}`) },
      h('div', { class: 'kc-flip' }, h('div', { class: 'kc-face' }, h('span', { class: 'kc-inner' }, h('span', { class: 'kc-q' }, '?'), h('span', { class: 'kc-soon' }, KG.t('即将开放', 'Coming soon')), h('span', { class: 'kc-soon-title' }, title))))
    );
  }

  // 一手牌：扇形摆开，悬停抬起并跟着指针微微倾斜，点击翻面
  function deck(cat, from) {
    const infos = cat.entries.map(entryInfo).filter(Boolean);
    const cards = [...infos.map(liveCard), ...cat.soon.map(soonCard)];
    const el = h('div', { class: 'hh-deck' }, cards);
    let open = null;

    function layout() {
      const n = cards.length;
      const kw = cards[0].offsetWidth || 1;
      const mid = (n - 1) / 2;
      // 牌之间压住约五分之一，看起来是一手牌而不是一排卡片
      // 两侧各留约 28px，倾斜后的牌角也不出屏
      const gap = n > 1 ? Math.min(kw * 0.8, (el.clientWidth - kw - 56) / (n - 1)) : 0;
      const tilt = Math.min(7, 20 / n);
      cards.forEach((card, i) => {
        const k = i - mid;
        card.style.setProperty('--x', (k * gap).toFixed(1) + 'px');
        card.style.setProperty('--y', (k * k * 6).toFixed(1) + 'px');
        card.style.setProperty('--r', (k * tilt).toFixed(2) + 'deg');
        card.style.zIndex = String(i + 1);
      });
    }
    function flip(card, on) {
      const front = card.querySelector('.kc-front');
      const back = card.querySelector('.kc-back');
      if (!front) return;
      card.classList.toggle('flipped', on);
      front.setAttribute('aria-expanded', String(on));
      front.tabIndex = on ? -1 : 0;
      back.tabIndex = on ? 0 : -1;
      back.setAttribute('aria-hidden', String(!on));
      if (on) front.setAttribute('aria-hidden', 'true');
      else front.removeAttribute('aria-hidden');
    }
    function close(focusFront) {
      if (!open) return;
      const card = open;
      open = null;
      flip(card, false);
      if (focusFront) card.querySelector('.kc-front').focus({ preventScroll: true });
    }

    cards.forEach((card) => {
      const front = card.querySelector('.kc-front');
      if (front) {
        front.addEventListener('click', () => {
          if (open && open !== card) close(false);
          open = card;
          flip(card, true);
          card.querySelector('.kc-back').focus({ preventScroll: true });
        });
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && open === card) {
            e.stopPropagation();
            close(true);
          }
        });
      }
      card.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ry', (x * 16).toFixed(1) + 'deg');
        card.style.setProperty('--rx', (-y * 12).toFixed(1) + 'deg');
        card.style.setProperty('--sx', (100 - (x + 0.5) * 100).toFixed(0) + '%');
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
      });
    });
    // 点牌以外的地方，翻开的牌合上
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.kc')) close(false);
    });

    const ro = new ResizeObserver(layout);
    return {
      el,
      start() {
        layout();
        ro.observe(el);
        // 发牌：从舵轮那一侧一张张飞进来
        if (reducedMotion()) return;
        const [dx, dy] = from === 'left' ? [-260, 40] : [0, 220];
        cards.forEach((card, i) =>
          card.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(${from === 'left' ? -24 : 0}deg) scale(0.6)`, opacity: 0 }, { opacity: 1, offset: 0.4 }, {}], {
            duration: 520,
            delay: i * 45,
            easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
            fill: 'backwards',
          })
        );
      },
      dispose() {
        ro.disconnect();
      },
    };
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
    const { spin, rim, hl } = wheelArt();
    const knobs = CATEGORIES.map((c, i) =>
      h(
        'button',
        { class: 'hh-knob', role: 'tab', id: 'hh-tab-' + c.id, 'aria-controls': 'hh-panel', 'aria-selected': 'false', tabindex: '-1', style: { '--c': c.color }, onclick: () => turnTo(i) },
        h('span', { class: 'hh-ball' }, KG.icon(c.glyph)),
        h('span', { class: 'hh-nameplate' }, KG.loc(c, 'title'))
      )
    );
    const tablist = h('div', { class: 'hh-knobs', role: 'tablist', 'aria-label': KG.t('大类', 'Topics') }, knobs);
    const hub = h('div', { class: 'hh-hub' }, h('span', { class: 'sr-only' }, KG.t('全部星星', 'Total stars')), h('span', { class: 'hh-hub-got' }, '★ ' + total.got), h('span', { class: 'hh-hub-total' }, '/ ' + total.total));
    // 指针固定在"选中"的方位（手机在正上方，宽屏在正右方，指向卡牌）
    const pointer = h('div', { class: 'hh-pointer', 'aria-hidden': 'true' });
    // 换大类时从轮心发出一圈声呐波
    const ping = h('div', { class: 'hh-ping', 'aria-hidden': 'true' });
    const wheel = h('div', { class: 'hh-wheel' }, h('div', { class: 'hh-sonar', 'aria-hidden': 'true' }), ping, spin, rim, hub, pointer, tablist);
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
          h('a', { class: 'hh-logo', href: 'https://nphunter.gg/', title: KG.t('返回 NPHunter 主页', 'Back to NPHunter'), 'aria-label': KG.t('返回 NPHunter 主页', 'Back to NPHunter') }, logoMark()),
          h('div', null, h('h1', null, h('span', { class: 'hh-kube' }, 'Kube'), ' ', KG.t('游乐场', 'Playground')), h('p', null, KG.t('用小游戏理解 Kubernetes', 'Learn Kubernetes by playing')))
        ),
        h(
          'div',
          { class: 'hh-tools' },
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

    // ---------------------------------------------------------- 面板：大类名 + 星数 + 一手牌
    let hand = null;
    function renderPanel(dir) {
      const c = CATEGORIES[cur];
      const prog = sumProgress(c.entries.map(entryInfo).filter(Boolean));
      if (hand) hand.dispose();
      hand = deck(c, A === 90 ? 'left' : 'below');
      panel.style.setProperty('--dir', dir);
      panel.setAttribute('aria-labelledby', 'hh-tab-' + c.id);
      KG.fill(
        panel,
        h(
          'div',
          { class: 'hh-cat' },
          h('h2', null, h('span', { class: 'hh-cat-icon' }, KG.icon(c.glyph)), KG.loc(c, 'title')),
          prog.total ? h('span', { class: 'hh-cat-stars', title: KG.t('本类星数', 'Stars in this topic') }, `★ ${prog.got} / ${prog.total}`) : null,
          h('p', { class: 'sr-only' }, KG.loc(c, 'tagline'))
        ),
        hand.el
      );
      hand.start();
    }

    let pinged = false;
    function select(i, dir, announce) {
      if (i === cur && hand) return;
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
      if (pinged) {
        ping.classList.remove('go');
        void ping.offsetWidth;
        ping.classList.add('go');
      }
      pinged = true;
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
      spin.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      const R = wd * 0.46;
      const plate = wd * 0.125;
      knobs.forEach((k, i) => {
        const a = ((i * STEP + angle) * Math.PI) / 180;
        const sin = Math.sin(a);
        const cos = Math.cos(a);
        k.style.transform = `translate(${(R * sin).toFixed(1)}px, ${(-R * cos).toFixed(1)}px)`;
        k.style.setProperty('--px', (-plate * sin).toFixed(1) + 'px');
        k.style.setProperty('--py', (plate * cos).toFixed(1) + 'px');
        // 辐条朝光的那一侧亮：右侧法线是 (cos, sin)
        const lit = cos * LIGHT[0] + sin * LIGHT[1];
        hl[i][1].style.opacity = Math.max(0, lit).toFixed(2);
        hl[i][0].style.opacity = Math.max(0, -lit).toFixed(2);
      });
      const t = mod(Math.round((A - angle) / STEP));
      if (t !== onIdx) {
        if (onIdx >= 0) knobs[onIdx].classList.remove('is-on');
        onIdx = t;
        knobs[t].classList.add('is-on');
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
      if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable]')) return;
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
      // 第一次打开时舵轮转进来
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
      if (hand) hand.dispose();
      document.removeEventListener('keydown', onKey);
      delete document.documentElement.dataset.view;
    };
  };
})();
