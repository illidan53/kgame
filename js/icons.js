/* Kube 游乐场 —— 统一的线性图标（24×24，描边）。大厅和游戏页顶栏用它代替 emoji：
   emoji 在各个系统上长得不一样，也没法跟着大类换色。 */
(function () {
  'use strict';
  const KG = (window.KG = window.KG || {});

  const ICONS = {
    // 大类
    box: '<path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z"/><path d="M3 7.5v9L12 21l9-4.5v-9"/><path d="M12 12v9"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.5" cy="13" r="1.2"/><circle cx="14.5" cy="13" r="1.2"/>',
    // 游戏
    gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="m12 16 4.5-5"/><circle cx="12" cy="16" r="1.4"/><path d="M7 16h-1M18 16h-1"/>',
    pack: '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8-10-10Z"/><circle cx="7.5" cy="8" r="1.5"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    rocket: '<path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10Z"/><circle cx="12" cy="10" r="1.8"/><path d="m9 16-2 4 3-1M15 16l2 4-3-1"/>',
    scope: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M8 10.5h5M10.5 8v5"/>',
    code: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
    cards: '<rect x="3" y="7" width="11" height="14" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12"/>',
    // 即将开放
    pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
    magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/>',
    priority: '<path d="m6 11 6-6 6 6"/><path d="m6 19 6-6 6 6"/>',
    ordered: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 5h1.5v4"/><path d="M4 9h3"/><path d="M7 19H4c0-1 3-2 3-3s-1-1.5-3-1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4 18-7Z"/>',
    wall: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 15h18M9 4v5.5M15 9.5V15M9 15v5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m16 7 3 3"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  };

  KG.ICONS = ICONS;
  // 返回一个装着 SVG 的 <span>；颜色跟随 currentColor
  KG.icon = (name, cls) => {
    const span = document.createElement('span');
    span.className = 'kg-icon' + (cls ? ' ' + cls : '');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    return span;
  };
})();
