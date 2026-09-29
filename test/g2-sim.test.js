const S = require('../js/g2-sim.js');
const L = Object.fromEntries(S.LEVELS.map(l => [l.id, l]));
function run(id, cfg, label) {
  const lv = L[id];
  const r = S.runAll(lv, cfg);
  const pods = Object.entries(r.R).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}: down=${v.down} avail=${(v.avail*100).toFixed(1)} oom=${v.oom} kern=${v.kernel} ev=${v.evicted} work=${v.work.toFixed(1)} thr=${v.throttled} slo=${v.sloBad}`);
  console.log(`[${id}] ${label} -> stars=${r.stars} goals=${r.results} nodeEv=${r.R._nodeEvents}\n   ` + pods.join('\n   '));
  return r;
}
for (const lv of S.LEVELS) console.log(lv.id, JSON.stringify(Object.fromEntries(Object.entries(lv.stats).map(([k,v])=>[k,{avg:v.avg,peak:v.peak}]))));
const assert = require('assert');
// m1
assert.equal(run('m1', [{req:256, lim:384}], 'preset').stars, 0);
assert.equal(run('m1', [{req:384, lim:768}], 'good').stars, 3);
run('m1', [{req:0, lim:0}], 'none');
// m2
assert.equal(run('m2', [{req:0,lim:0},{req:0,lim:0},{req:0,lim:0}], 'preset').stars, 0);
assert.equal(run('m2', [{req:1152,lim:1152},{req:576,lim:576},{req:0,lim:0}], 'qos').stars, 3);
run('m2', [{req:0,lim:0},{req:0,lim:0},{req:0,lim:512}], 'limit report');
run('m2', [{req:1152,lim:1152},{req:576,lim:576},{req:1024,lim:0}], 'report big req');
// m3
assert.equal(run('m3', [{req:0,lim:0},{req:512,lim:0},{req:1024,lim:0}], 'preset').stars, 0);
assert.equal(run('m3', [{req:672,lim:0},{req:768,lim:0},{req:512,lim:896}], 'good').stars, 3);
run('m3', [{req:672,lim:0},{req:768,lim:0},{req:512,lim:1536}], 'big limit');
run('m3', [{req:0,lim:0},{req:512,lim:0},{req:0,lim:896}], 'limit only leaky');
// c1
assert.equal(run('c1', [{req:500,lim:1000},{req:2000,lim:0}], 'preset').stars, 0);
assert.equal(run('c1', [{req:2000,lim:0},{req:1000,lim:0}], 'good').stars, 3);
run('c1', [{req:2000,lim:2000},{req:1000,lim:0}], 'api limit=req');
run('c1', [{req:2000,lim:0},{req:1000,lim:2000}], 'batch limit');
console.log('OK');
