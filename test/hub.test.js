// 大厅的大类配置：舵轮 7 根辐条对应 7 个大类，每个上线的游戏（小游戏）恰好出现在一个大类里
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const games = [];
const KG = { h() {}, s() {}, register: (g) => games.push(g), aliases: {}, games, store: { get: () => 0, set() {} }, getStars: () => 0 };
const ctx = { KG, console, performance: { now: () => 0 } };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['g1-scheduler.js', 'g2-sim.js', 'g2-resources.js', 'g3-concepts.js', 'g4-operator.js', 'hub.js']) {
  vm.runInContext(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'), ctx, { filename: f });
}
const C = KG.categories;

assert.equal(C.length, 7, 'K8s 舵轮有 7 根辐条，大类必须正好 7 个');
assert.equal(new Set(C.map((c) => c.id)).size, C.length, '大类 id 重复');
// 大厅可切换中 / 英文：每处文案都要有英文
const hasEn = (obj, name) => {
  for (const k of ['title', 'tagline']) assert.ok(obj.en && obj.en[k], `${name} 缺少英文 ${k}`);
};
for (const c of C) {
  for (const k of ['id', 'icon', 'title', 'color', 'tagline']) assert.ok(c[k], `${c.id} 缺少 ${k}`);
  hasEn(c, c.id);
  assert.ok(c.entries.length + c.soon.length > 0, `${c.id} 至少要有一张卡片`);
  for (const s of c.soon) {
    for (const k of ['icon', 'title', 'tagline']) assert.ok(s[k], `${c.id} 的占位缺少 ${k}`);
    hasEn(s, `${c.id} 的占位 ${s.title}`);
  }
}
for (const g of games) {
  hasEn(g, g.id);
  for (const m of g.modes || []) hasEn(m, `${g.id}/${m.id}`);
}

// 每个入口都指向已注册的游戏 / 小游戏；每个游戏（带小游戏的按小游戏算）恰好出现一次
const seen = new Map();
for (const c of C) {
  for (const e of c.entries) {
    const g = games.find((x) => x.id === e.game);
    assert.ok(g, `${c.id} 引用了不存在的游戏 ${e.game}`);
    if (e.mode) assert.ok(g.modes && g.modes.some((m) => m.id === e.mode), `${e.game} 没有小游戏 ${e.mode}`);
    const key = e.game + (e.mode ? '/' + e.mode : '');
    assert.ok(!seen.has(key), `${key} 同时出现在 ${seen.get(key)} 和 ${c.id}`);
    seen.set(key, c.id);
  }
}
for (const g of games) {
  const keys = g.modes ? g.modes.map((m) => g.id + '/' + m.id) : [g.id];
  for (const k of keys) assert.ok(seen.has(k), `${k} 没有放进任何大类`);
  assert.equal(KG.categoryOf(g.id), C.find((c) => c.id === seen.get(keys[0])), `${g.id} 的返回链接指向了错误的大类`);
}

// 拆分前的旧地址仍然能到达拆分后的游戏
for (const sub of [undefined, 'selector', 'controller', 'rollout']) {
  const to = KG.aliases.concepts(sub);
  assert.ok(games.some((g) => g.id === to), `#/concepts/${sub} 转到了不存在的 ${to}`);
}

console.log(C.map((c) => `${c.id}: ${c.entries.map((e) => e.mode || e.game).join(', ') || '—'} (+${c.soon.length} 即将开放)`).join('\n'));
console.log('OK');
