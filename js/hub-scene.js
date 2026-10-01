/* Kube 游乐场 —— 大厅背景：一张海图。
   浅色系统是纸质航海图，深色系统是声呐屏，颜色都在 css/hub.css 的变量里。
   等深线是从一片随机海底高度场用 marching squares 提取的，所以线和线不会交叉。
   转舵时海图缓缓漂移：转一整圈舵轮，海图绕一个小椭圆走一圈，换一个大类大约移 60px。 */
(function () {
  'use strict';
  const { h } = KG;

  const W = 2400;
  const H = 1600;
  const CELL = 25; // 要能整除 W 和 H
  const LEVELS = 13;
  const DRIFT = { x: 70, y: 46 }; // 海图漂移的椭圆半径（px），css 里海图四周留出的余量要比它大

  // 海底高度场：几个隆起和洼地叠加，再加两层缓慢起伏
  function heightField() {
    const rnd = KG.rng(20261001);
    const bumps = [];
    for (let i = 0; i < 18; i++) bumps.push({ x: rnd() * W, y: rnd() * H, s: 110 + rnd() * 260, a: (rnd() < 0.35 ? -1 : 1) * (0.5 + rnd()) });
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    return (x, y) => {
      let v = 0.35 * Math.sin(x / 380 + ph[0]) * Math.cos(y / 310 + ph[1]) + 0.18 * Math.sin((x + y) / 210 + ph[2]);
      for (const b of bumps) {
        const dx = x - b.x;
        const dy = y - b.y;
        v += b.a * Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s));
      }
      return v;
    };
  }

  // marching squares：返回每一层的折线（坐标已乘上 CELL），闭合的环带 closed 标记
  function contourLines(field) {
    const nx = W / CELL;
    const ny = H / CELL;
    const v = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j <= ny; j++) {
      v.push([]);
      for (let i = 0; i <= nx; i++) {
        const z = field(i * CELL, j * CELL);
        v[j].push(z);
        lo = Math.min(lo, z);
        hi = Math.max(hi, z);
      }
    }
    // 格子的四条边：T 上、R 右、B 下、L 左。5 和 10 是鞍点，按格子中心的高低决定怎么连
    const CASES = { 1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['T', 'R']], 6: [['T', 'B']], 7: [['T', 'L']], 8: [['T', 'L']], 9: [['T', 'B']], 11: [['T', 'R']], 12: [['L', 'R']], 13: [['B', 'R']], 14: [['L', 'B']] };
    const levels = [];
    for (let k = 1; k <= LEVELS; k++) {
      const L = lo + ((hi - lo) * k) / (LEVELS + 1);
      const pts = new Map(); // 边的 id → 交点
      const links = new Map(); // 边的 id → 和它连着的边
      const edge = (i, j, e, tl, tr, br, bl) => {
        let id;
        let x;
        let y;
        if (e === 'T') (id = `h${i},${j}`), (x = i + (L - tl) / (tr - tl)), (y = j);
        else if (e === 'B') (id = `h${i},${j + 1}`), (x = i + (L - bl) / (br - bl)), (y = j + 1);
        else if (e === 'L') (id = `v${i},${j}`), (x = i), (y = j + (L - tl) / (bl - tl));
        else (id = `v${i + 1},${j}`), (x = i + 1), (y = j + (L - tr) / (br - tr));
        if (!pts.has(id)) pts.set(id, [x * CELL, y * CELL]);
        return id;
      };
      const link = (a, b) => {
        if (!links.has(a)) links.set(a, []);
        if (!links.has(b)) links.set(b, []);
        links.get(a).push(b);
        links.get(b).push(a);
      };
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const tl = v[j][i];
          const tr = v[j][i + 1];
          const br = v[j + 1][i + 1];
          const bl = v[j + 1][i];
          const c = (tl > L ? 8 : 0) | (tr > L ? 4 : 0) | (br > L ? 2 : 0) | (bl > L ? 1 : 0);
          let segs = CASES[c];
          if (c === 5 || c === 10) {
            const mid = (tl + tr + br + bl) / 4 > L;
            segs = (c === 5) === mid ? [['T', 'L'], ['B', 'R']] : [['T', 'R'], ['L', 'B']];
          }
          if (!segs) continue;
          for (const [a, b] of segs) link(edge(i, j, a, tl, tr, br, bl), edge(i, j, b, tl, tr, br, bl));
        }
      }
      // 把线段串成折线：先从只连一条的端点出发走开放的线（碰到图边的），剩下的都是环
      const used = new Set();
      const lines = [];
      const walk = (start) => {
        const line = [start];
        used.add(start);
        let cur = start;
        for (;;) {
          const next = links.get(cur).find((n) => !used.has(n));
          if (!next) break;
          used.add(next);
          line.push(next);
          cur = next;
        }
        const closed = line.length > 2 && links.get(cur).includes(start);
        lines.push({ points: line.map((id) => pts.get(id)), closed });
      };
      for (const [id, ns] of links) if (ns.length === 1 && !used.has(id)) walk(id);
      for (const id of links.keys()) if (!used.has(id)) walk(id);
      levels.push(lines.filter((l) => l.points.length > 3));
    }
    return levels;
  }

  // Chaikin 平滑一次，去掉格子的棱角
  function smooth(points, closed) {
    const n = points.length;
    const out = closed ? [] : [points[0]];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % n];
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    if (!closed) out.push(points[n - 1]);
    return out;
  }
  const pathOf = (points, closed) => 'M' + points.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + (closed ? 'Z' : '');

  // 只生成一次，之后每次进大厅直接复用
  let markup = null;
  function chartMarkup() {
    if (markup) return markup;
    const levels = contourLines(heightField());
    let out = '';
    // 经纬网
    for (let x = 200; x < W; x += 200) out += `<path class="hh-c-grid" d="M${x} 0V${H}"/>`;
    for (let y = 200; y < H; y += 200) out += `<path class="hh-c-grid" d="M0 ${y}H${W}"/>`;
    // 罗盘玫瑰和从它放射出去的恒向线
    const rx = 1720;
    const ry = 1130;
    let rhumb = '';
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      rhumb += `M${rx} ${ry}L${(rx + 3000 * Math.cos(a)).toFixed(0)} ${(ry + 3000 * Math.sin(a)).toFixed(0)}`;
    }
    out += `<path class="hh-c-rhumb" d="${rhumb}"/>`;
    // 等深线：每四层一条粗的计曲线并标深度；最高一层闭合的环当作小岛
    levels.forEach((lines, k) => {
      const index = (k + 1) % 4 === 0;
      let d = '';
      for (const l of lines) d += pathOf(smooth(l.points, l.closed), l.closed);
      if (k === levels.length - 1) {
        const islands = lines
          .filter((l) => l.closed)
          .map((l) => pathOf(smooth(l.points, true), true))
          .join('');
        if (islands) out += `<path class="hh-c-land" d="${islands}"/>`;
      }
      out += `<path class="hh-c-depth${index ? ' idx' : ''}" d="${d}"/>`;
      if (index) {
        const longest = lines.reduce((a, b) => (!a || b.points.length > a.points.length ? b : a), null);
        if (longest && longest.points.length > 20) {
          const [x, y] = longest.points[Math.floor(longest.points.length / 2)];
          out += `<text class="hh-c-label" x="${x.toFixed(0)}" y="${(y + 4).toFixed(0)}">${(LEVELS - k) * 10}</text>`;
        }
      }
    });
    out += `<g class="hh-c-rose" transform="translate(${rx} ${ry})"><circle r="74"/><circle r="58"/><path d="M0 -96 L11 0 L0 96 L-11 0Z"/><path d="M-96 0 L0 11 L96 0 L0 -11Z"/><path class="fill" d="M0 -96 L11 0 L-11 0Z"/><text y="-106">N</text></g>`;
    markup = `<svg class="hh-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${out}</svg>`;
    return markup;
  }

  KG.hubScene = function () {
    const holder = h('div', { html: chartMarkup() });
    const chart = holder.firstChild;
    const el = h('div', { class: 'hh-sky', 'aria-hidden': 'true' }, h('div', { class: 'hh-grain' }), chart, h('div', { class: 'hh-glow' }), h('div', { class: 'hh-vignette' }));
    return {
      el,
      // 转舵 = 船转向：海图沿一个小椭圆漂移，一整圈正好绕回原处
      pan(angle) {
        const r = (angle * Math.PI) / 180;
        chart.style.transform = `translate3d(${(-DRIFT.x * Math.sin(r)).toFixed(1)}px, ${(-DRIFT.y * Math.cos(r)).toFixed(1)}px, 0)`;
      },
    };
  };
})();
