/* Kube 游乐场 —— 公共工具：DOM 帮助函数、路由、存档、弹窗、关卡条 */
(function () {
  'use strict';
  const KG = (window.KG = window.KG || {});

  // ---------------------------------------------------------------- DOM
  const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'selected', 'min', 'max', 'step', 'open']);

  function appendKids(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false || k === true) continue;
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') {
          if (typeof v === 'string') el.setAttribute('style', v);
          else for (const sk in v) sk.startsWith('--') ? el.style.setProperty(sk, v[sk]) : (el.style[sk] = v[sk]);
        }
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (PROP_KEYS.has(k)) el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    appendKids(el, kids);
    return el;
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v);
      }
    }
    appendKids(el, kids);
    return el;
  }

  KG.h = h;
  KG.s = s;
  KG.clear = (el) => {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };
  KG.fill = (el, ...kids) => {
    KG.clear(el);
    appendKids(el, kids);
    return el;
  };

  // ---------------------------------------------------------------- 格式化
  KG.fmtMem = (mi) => {
    if (mi == null) return '—';
    if (mi >= 1024) {
      const g = mi / 1024;
      return (Number.isInteger(g) ? String(g) : g.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')) + 'Gi';
    }
    return Math.round(mi) + 'Mi';
  };
  KG.fmtCpu = (m) => (m == null ? '—' : Math.round(m) + 'm');
  KG.fmtClock = (min) => {
    const hh = Math.floor(min / 60) % 24;
    const mm = Math.floor(min % 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };
  KG.pct = (x) => (x * 100).toFixed(x >= 0.995 || x === 0 ? 0 : 1) + '%';

  // 确定性的随机数（mulberry32）
  KG.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  KG.shuffle = (arr, rnd = Math.random) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---------------------------------------------------------------- 存档
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('kg:' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('kg:' + k, JSON.stringify(v));
      } catch (e) {
        /* 隐私模式等情况下忽略 */
      }
    },
  };
  KG.store = store;
  KG.getStars = (game, level) => store.get(`stars:${game}:${level}`, 0);
  KG.setStars = (game, level, n) => {
    if (n > KG.getStars(game, level)) store.set(`stars:${game}:${level}`, n);
  };

  // ---------------------------------------------------------------- 生命周期
  // 每个关卡/模式一个 scope，切换时统一清理定时器和动画
  KG.scope = () => {
    const fns = [];
    return {
      add(f) {
        fns.push(f);
        return f;
      },
      interval(fn, ms) {
        const id = setInterval(fn, ms);
        fns.push(() => clearInterval(id));
        return id;
      },
      timeout(fn, ms) {
        const id = setTimeout(fn, ms);
        fns.push(() => clearTimeout(id));
        return id;
      },
      raf(fn) {
        let id;
        let last = performance.now();
        let alive = true;
        const tick = (now) => {
          if (!alive) return;
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          fn(dt, now);
          if (alive) id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        const stop = () => {
          alive = false;
          cancelAnimationFrame(id);
        };
        fns.push(stop);
        return stop;
      },
      dispose() {
        fns.splice(0).forEach((f) => {
          try {
            f();
          } catch (e) {
            console.error(e);
          }
        });
      },
    };
  };
  KG.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- 组件
  KG.modal = function ({ title, body, actions = [], onClose, wide }) {
    const overlay = h('div', { class: 'modal-overlay' });
    let closed = false;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    function close() {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }
    const card = h(
      'div',
      { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': '关闭' }, '✕')),
      h('div', { class: 'modal-body' }, body),
      actions.length
        ? h(
            'div',
            { class: 'modal-actions' },
            actions.map((a) =>
              h(
                'button',
                {
                  class: 'btn' + (a.primary ? ' primary' : ''),
                  onclick: () => {
                    close();
                    if (a.onClick) a.onClick();
                  },
                },
                a.label
              )
            )
          )
        : null
    );
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    const primary = card.querySelector('.modal-actions .primary') || card.querySelector('.modal-actions .btn');
    if (primary) primary.focus();
    return close;
  };

  KG.starsText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

  // goals: [{text, ok, note}]
  KG.showResult = function ({ game, level, stars, goals, summary, extra, onRetry, onNext }) {
    KG.setStars(game, level, stars);
    const body = h(
      'div',
      { class: 'result' },
      h('div', { class: 'result-stars' }, [1, 2, 3].map((i) => h('span', { class: 'star' + (i <= stars ? ' on' : '') }, '★'))),
      summary ? h('p', { class: 'result-summary' }, summary) : null,
      goals && goals.length
        ? h(
            'ul',
            { class: 'goal-list' },
            goals.map((g) =>
              h(
                'li',
                { class: g.ok ? 'ok' : 'bad' },
                h('span', { class: 'gi' }, g.ok ? '✓' : '✗'),
                h('div', null, h('div', null, g.text), g.note ? h('div', { class: 'note' }, g.note) : null)
              )
            )
          )
        : null,
      extra || null
    );
    const actions = [];
    if (onRetry) actions.push({ label: '再来一次', onClick: onRetry });
    if (onNext && stars > 0) actions.push({ label: '下一关 →', primary: true, onClick: onNext });
    if (!actions.length) actions.push({ label: '好的', primary: true });
    return KG.modal({ title: stars > 0 ? '通关！' : '还差一点', body, actions });
  };

  KG.levelBar = function (gameId, levels, current, onPick) {
    return h(
      'nav',
      { class: 'levelbar' },
      levels.map((lv, i) => {
        const st = KG.getStars(gameId, lv.id);
        return h(
          'button',
          { class: 'level-pill' + (i === current ? ' active' : ''), onclick: () => onPick(i), title: lv.title },
          h('span', { class: 'lp-num' }, i + 1),
          h('span', { class: 'lp-title' }, lv.title),
          h('span', { class: 'lp-stars' + (st ? ' got' : '') }, KG.starsText(st))
        );
      })
    );
  };

  // 模式切换（一个游戏内的多个小游戏）
  KG.modeTabs = function (gameId, modes, currentId) {
    return h(
      'nav',
      { class: 'mode-tabs' },
      modes.map((m) =>
        h(
          'a',
          { class: 'mode-tab' + (m.id === currentId ? ' active' : ''), href: `#/${gameId}/${m.id}` },
          h('span', { class: 'mt-icon' }, m.icon),
          h('span', null, m.title)
        )
      )
    );
  };

  KG.tip = (title, html, open) => h('details', { class: 'tip', open: !!open }, h('summary', null, h('span', { class: 'tip-icon' }, '💡'), title), h('div', { class: 'tip-body', html }));

  KG.goalBox = (goals) =>
    h(
      'div',
      { class: 'goal-box' },
      goals.map((g, i) => h('div', { class: 'goal-row' }, h('span', { class: 'goal-star' }, '★'.repeat(i + 1)), h('span', null, typeof g === 'string' ? g : g.text)))
    );

  KG.toast = function (msg, type = 'info', ms = 2400) {
    let host = document.querySelector('.toast-host');
    if (!host) {
      host = h('div', { class: 'toast-host', 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    const t = h('div', { class: 'toast ' + type }, msg);
    host.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    }, ms);
  };

  // kubectl get events 风格的日志
  KG.eventLog = function (title = 'kubectl get events -w') {
    const list = h('div', { class: 'log-lines' });
    const root = h('div', { class: 'log panel' }, h('div', { class: 'log-head' }, h('span', { class: 'mono' }, '$ ' + title)), list);
    return {
      root,
      clear() {
        KG.clear(list);
      },
      add(type, reason, obj, msg, time) {
        const line = h(
          'div',
          { class: 'log-line ' + (type === 'Warning' ? 'warn' : type === 'Error' ? 'err' : 'normal') },
          time != null ? h('span', { class: 'lt' }, time) : null,
          h('span', { class: 'ltype' }, type),
          h('span', { class: 'lreason' }, reason),
          obj ? h('span', { class: 'lobj' }, obj) : null,
          h('span', { class: 'lmsg' }, msg)
        );
        list.appendChild(line);
        while (list.childNodes.length > 200) list.removeChild(list.firstChild);
        list.scrollTop = list.scrollHeight;
      },
    };
  };

  KG.shake = (el) => {
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  };

  // ---------------------------------------------------------------- 路由 & 大厅
  KG.games = [];
  KG.register = (g) => KG.games.push(g);

  let cleanup = null;

  function renderHub(app) {
    document.title = 'Kube 游乐场';
    const cards = KG.games.map((g) => {
      const prog = g.progress ? g.progress() : null;
      return h(
        'a',
        { class: 'hub-card', href: '#/' + g.id, style: { '--card-accent': g.color || 'var(--accent)' } },
        h('div', { class: 'hc-top' }, h('span', { class: 'hc-icon' }, g.icon), prog ? h('span', { class: 'hc-prog' }, `★ ${prog.got}/${prog.total}`) : null),
        h('h2', null, g.title),
        h('p', { class: 'hc-tag' }, g.tagline),
        g.modes
          ? h(
              'ul',
              { class: 'hc-modes' },
              g.modes.map((m) => h('li', null, h('span', null, m.icon), m.title))
            )
          : null,
        h(
          'div',
          { class: 'hc-concepts' },
          g.concepts.map((c) => h('span', { class: 'chip' }, c))
        )
      );
    });
    app.appendChild(
      h(
        'div',
        { class: 'page hub' },
        h(
          'header',
          { class: 'hero' },
          h('div', { class: 'hero-logo', 'aria-hidden': 'true' }, '⎈'),
          h('h1', null, 'Kube 游乐场'),
          h('p', null, '用小游戏理解 Kubernetes：调度、资源、OOM、控制循环，以及 Operator。每个小游戏都对应真实的 K8s 行为，玩完看看 💡 知识点。')
        ),
        h('div', { class: 'hub-grid' }, cards),
        h(
          'footer',
          { class: 'hub-foot' },
          h('span', null, '进度保存在本地浏览器。'),
          h(
            'button',
            {
              class: 'btn ghost small',
              onclick: () => {
                if (!confirm('确定清空所有星星和进度？')) return;
                try {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith('kg:'))
                    .forEach((k) => localStorage.removeItem(k));
                } catch (e) {
                  /* ignore */
                }
                route();
              },
            },
            '重置进度'
          )
        )
      )
    );
  }

  function route() {
    const app = document.getElementById('app');
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        console.error(e);
      }
      cleanup = null;
    }
    document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
    KG.clear(app);
    const m = location.hash.match(/^#\/([\w-]+)(?:\/([\w-]+))?/);
    const game = m && KG.games.find((g) => g.id === m[1]);
    if (!game) {
      renderHub(app);
      window.scrollTo(0, 0);
      return;
    }
    document.title = game.title + ' · Kube 游乐场';
    const body = h('div', { class: 'game-body' });
    app.appendChild(
      h(
        'div',
        { class: 'page', style: { '--card-accent': game.color || 'var(--accent)' } },
        h(
          'header',
          { class: 'topbar' },
          h('a', { class: 'back', href: '#/' }, '← 大厅'),
          h('div', { class: 'tb-title' }, h('span', { class: 'tb-icon' }, game.icon), h('span', null, game.title)),
          h('div', { class: 'tb-sub' }, game.tagline)
        ),
        body
      )
    );
    cleanup = game.mount(body, m[2]) || null;
    window.scrollTo(0, 0);
  }

  KG.route = route;
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', route);
})();
