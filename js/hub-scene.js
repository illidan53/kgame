/* Kube 游乐场 —— 大厅背景：海天、云、远处的岛和灯塔、帆船、浪、海面反光、海鸥。
   转舵就是船在转向：scene.pan(舵轮角度) 让各层按远近不同的速度横移。
   颜色都走 CSS 变量，白天和黄昏两套配色在 css/hub.css 里。 */
(function () {
  'use strict';
  const { h, s } = KG;
  const MAX_W = 3840; // 支持的最大视口宽度

  // 远景（太阳、岛、灯塔、帆船）和云转一整圈舵轮正好绕一整圈，所以周期 = 360° × 每度像素。
  // 周期要比常见屏幕宽，否则同一屏里会看到两个太阳
  const FAR = { f: 8, height: 200 };
  const CLOUD = { f: 9, height: 220 };
  FAR.period = 360 * FAR.f;
  CLOUD.period = 360 * CLOUD.f;
  // 浪：由远到近，越近浪越高、横移越快；band 是浪头那一条的高度，下面是纯色海水
  const WAVES = [
    { W: 360, L: 180, a: 3, band: 12, top: '5%', f: 1.2, drift: 26, bob: 3.1 },
    { W: 520, L: 260, a: 5, band: 18, top: '20%', f: 2, drift: 20, bob: 3.7 },
    { W: 720, L: 360, a: 8, band: 26, top: '40%', f: 3, drift: 15, bob: 4.3 },
    { W: 960, L: 480, a: 12, band: 36, top: '64%', f: 4.2, drift: 11, bob: 5.1 },
  ];

  const copiesFor = (period, extra) => Math.ceil(MAX_W / period) + extra;

  function sun() {
    return s(
      'g',
      { class: 'hh-sun' },
      s('circle', { class: 'hh-sun-glow', r: 120, opacity: 0.22 }),
      s('circle', { class: 'hh-sun-glow', r: 62, opacity: 0.4 }),
      s('circle', { class: 'hh-sun-disc', r: 26 })
    );
  }

  function lighthouse() {
    return s(
      'g',
      { class: 'hh-lighthouse' },
      s('path', { class: 'hh-island', d: 'M1010 200 C1040 184 1080 176 1110 178 C1150 180 1180 190 1232 200 Z' }),
      s('path', { class: 'hh-rock', d: 'M1150 200 C1158 192 1170 190 1180 196 L1186 200 Z' }),
      s('circle', { class: 'hh-lamp', cx: 1102, cy: 132, r: 12 }),
      s('path', { class: 'hh-lh-tower', d: 'M1094 178 L1097 140 L1107 140 L1110 178 Z' }),
      s('path', { class: 'hh-lh-band', d: 'M1096.2 156 L1096.7 150 L1107.3 150 L1107.8 156 Z M1095.2 170 L1095.7 164 L1108.3 164 L1108.8 170 Z' }),
      s('rect', { class: 'hh-lh-tower', x: 1095, y: 136, width: 14, height: 4 }),
      s('rect', { class: 'hh-lh-room', x: 1098, y: 128, width: 8, height: 8 }),
      s('path', { class: 'hh-lh-roof', d: 'M1096 128 L1102 121 L1108 128 Z' })
    );
  }

  // 外层定位，内层摇晃（CSS 动画的 transform 会盖掉同一元素上的 transform 属性）
  function boat(x, k) {
    return s(
      'g',
      { transform: `translate(${x} 200) scale(${k}) translate(-382 -200)` },
      s(
        'g',
        { class: 'hh-boat' },
        s('path', { class: 'hh-hull', d: 'M366 196 L398 196 L393 201 L371 201 Z' }),
        s('line', { class: 'hh-mast', x1: 382, y1: 196, x2: 382, y2: 169 }),
        s('path', { class: 'hh-sail', d: 'M383 171 L383 194 L397 194 Z' }),
        s('path', { class: 'hh-sail', d: 'M381 175 L381 194 L369 194 Z', opacity: 0.85 })
      )
    );
  }

  // 一段远景：太阳、远山、灯塔岛、小岛、两条帆船
  function farCopy(x) {
    return s(
      'g',
      { transform: `translate(${x} 0)` },
      sun(),
      s('path', { class: 'hh-island-far', d: 'M560 200 C600 188 640 176 700 180 C760 184 800 170 860 186 C880 192 890 198 904 200 Z' }),
      s('path', { class: 'hh-island-far', d: 'M1290 200 C1310 194 1330 190 1352 192 C1372 194 1384 198 1392 200 Z' }),
      s('path', { class: 'hh-island-far', d: 'M1600 200 C1640 186 1680 168 1730 160 C1770 154 1800 170 1840 176 C1880 182 1910 164 1950 170 C1990 176 2030 192 2060 200 Z' }),
      s('path', { class: 'hh-island', d: 'M2440 200 C2470 190 2500 184 2530 185 C2570 186 2600 194 2620 200 Z' }),
      s('path', { class: 'hh-rock', d: 'M2600 200 C2606 194 2616 193 2624 197 L2628 200 Z' }),
      lighthouse(),
      boat(382, 1),
      boat(2240, 0.7)
    );
  }

  const CLOUDS = [
    [120, 70, 1.1],
    [520, 34, 0.8],
    [860, 112, 1.3],
    [1270, 52, 0.9],
    [1650, 92, 1.15],
    [2020, 40, 0.85],
    [2380, 104, 1.2],
    [2760, 60, 1],
    [3080, 96, 0.9],
  ];
  function cloud(x, y, k) {
    return s(
      'g',
      { class: 'hh-cloud', transform: `translate(${x} ${y}) scale(${k})` },
      s('ellipse', { class: 'hh-cloud-shade', cx: 0, cy: 5, rx: 62, ry: 15 }),
      s('ellipse', { cx: 0, cy: -1, rx: 60, ry: 15 }),
      s('circle', { cx: -30, cy: -12, r: 20 }),
      s('circle', { cx: 0, cy: -22, r: 28 }),
      s('circle', { cx: 30, cy: -10, r: 20 }),
      s('circle', { cx: -52, cy: -3, r: 12 }),
      s('circle', { cx: 52, cy: -2, r: 14 })
    );
  }

  // 太阳正下方的一条波光，越往近处越宽；和远景同周期，跟着太阳走
  function glitter(copies) {
    const rnd = KG.rng(20261001);
    const P = FAR.period;
    const groups = [s('g', { class: 'hh-glint-a' }), s('g', { class: 'hh-glint-b' })];
    for (let c = 0; c < copies; c++) {
      for (let i = 0; i < 90; i++) {
        const t = rnd() ** 1.3;
        const spread = 16 + t * 150;
        const len = 3 + t * 24 * (0.5 + rnd());
        const x = c * P + 260 + (rnd() * 2 - 1) * spread * Math.sqrt(rnd()) - len / 2;
        const y = (t * 100).toFixed(2);
        groups[i % 2].appendChild(
          s('line', { x1: x.toFixed(1), y1: y, x2: (x + len).toFixed(1), y2: y, 'stroke-width': (1 + t * 1.6).toFixed(2), opacity: (0.3 + rnd() * 0.6).toFixed(2), 'vector-effect': 'non-scaling-stroke' })
        );
      }
    }
    return s('svg', { class: 'hh-glitter-svg', width: copies * P, height: '100%', viewBox: `0 0 ${copies * P} 100`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, groups);
  }

  function wave(cfg) {
    const copies = copiesFor(cfg.W, 2);
    const total = copies * cfg.W;
    const m = cfg.a + 2;
    let d = `M0 ${m} Q${cfg.L / 4} ${m - 2 * cfg.a} ${cfg.L / 2} ${m}`;
    for (let x = cfg.L; x <= total; x += cfg.L / 2) d += ` T${x} ${m}`;
    const svg = s(
      'svg',
      { width: total, height: cfg.band, viewBox: `0 0 ${total} ${cfg.band}`, 'aria-hidden': 'true' },
      s('path', { class: 'hh-wave-body', d: `${d} L${total} ${cfg.band} L0 ${cfg.band} Z` }),
      s('path', { class: 'hh-wave-foam', d })
    );
    const pan = h('div', { class: 'hh-wave-pan' }, svg);
    const el = h('div', { class: 'hh-wave', style: { top: cfg.top, '--band': cfg.band + 'px', '--tile': cfg.W + 'px', '--drift': cfg.drift + 's', '--bob': cfg.bob + 's' } }, pan);
    return { el, pan, f: cfg.f, period: cfg.W };
  }

  function gull(cls) {
    return h('span', { class: 'hh-gull ' + cls, html: '<svg viewBox="0 0 22 8" width="22" height="8"><path d="M1 6 Q6 0 11 5 Q16 0 21 6"/></svg>' });
  }

  KG.hubScene = function () {
    const farCopies = copiesFor(FAR.period, 1);
    const far = s(
      'svg',
      { class: 'hh-far', width: farCopies * FAR.period, height: FAR.height, viewBox: `0 0 ${farCopies * FAR.period} ${FAR.height}`, 'aria-hidden': 'true' },
      Array.from({ length: farCopies }, (_, c) => farCopy(c * FAR.period))
    );
    const cloudCopies = copiesFor(CLOUD.period, 1);
    const clouds = s(
      'svg',
      { class: 'hh-clouds', width: cloudCopies * CLOUD.period, height: CLOUD.height, viewBox: `0 0 ${cloudCopies * CLOUD.period} ${CLOUD.height}`, 'aria-hidden': 'true' },
      Array.from({ length: cloudCopies }, (_, c) => CLOUDS.map(([x, y, k]) => cloud(c * CLOUD.period + x, y, k)))
    );
    const glint = h('div', { class: 'hh-glitter' }, glitter(farCopies));
    const waves = WAVES.map(wave);

    const el = h(
      'div',
      { class: 'hh-sky', 'aria-hidden': 'true' },
      h('div', { class: 'hh-clouds-wrap' }, clouds),
      h('div', { class: 'hh-far-wrap' }, far),
      h('div', { class: 'hh-sea' }, waves.map((w) => w.el), glint),
      h('div', { class: 'hh-haze' }),
      gull('g1'),
      gull('g2')
    );

    const layers = [
      { el: clouds, f: CLOUD.f, period: CLOUD.period },
      { el: far, f: FAR.f, period: FAR.period },
      { el: glint, f: FAR.f, period: FAR.period },
      ...waves.map((w) => ({ el: w.pan, f: w.f, period: w.period })),
    ];

    return {
      el,
      // 顺时针转舵（角度变大）= 船向右转，景物向左移
      pan(angle) {
        for (const L of layers) {
          const x = (((-angle * L.f) % L.period) + L.period) % L.period;
          L.el.style.transform = `translate3d(${(x - L.period).toFixed(1)}px, 0, 0)`;
        }
      },
    };
  };
})();
