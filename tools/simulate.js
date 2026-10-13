#!/usr/bin/env node
/*
 * 밸런스 시뮬레이터: 제약 풀이 봇이 게임을 여러 판 플레이하고 통계를 낸다.
 *
 *   node tools/simulate.js [판 수=300] [--no-items] [--seed=1]
 *
 * 봇은 열린 숫자 칸들의 "주변 레벨 합" 제약을 백트래킹으로 풀어
 * 칸마다 레벨 확률을 구하고, 확실히 안전하거나 피해 없는 칸부터 연다.
 * 막히면 기대 피해가 가장 작은 칸을 찍는다. 사람보다 꽤 잘하는 편이다.
 */
'use strict';

const C = require('../js/core.js');

const args = process.argv.slice(2);
const RUNS = Number(args.find((a) => /^\d+$/.test(a)) || 300);
const NO_ITEMS = args.includes('--no-items');
const HUMAN = args.includes('--human');
const SEED0 = Number((args.find((a) => a.startsWith('--seed=')) || '--seed=1').slice(7));
const NODE_LIMIT = 60000;

// 실험용: TUNE='{"expRatio":1,"counts":[[6,3,2],...]}' node tools/simulate.js
if (process.env.TUNE) {
  const t = JSON.parse(process.env.TUNE);
  if (t.expRatio) C.TUNING.expRatio = t.expRatio;
  if (t.bossRatio) C.TUNING.bossRatio = t.bossRatio;
  if (t.counts) t.counts.forEach((c, i) => c && (C.FLOORS[i].counts = c));
  if (t.sizes) t.sizes.forEach((sz, i) => sz && ((C.FLOORS[i].cols = sz[0]), (C.FLOORS[i].rows = sz[1])));
}

// ------------------------------------------------------------------ 분석
function analyze(run, floor) {
  const cells = floor.cells;
  const maxLv = floor.left.length - 1;
  const rem = floor.left.slice();
  for (const c of cells) if (c.known && !c.open && c.m > 0) rem[c.m]--;

  const hiddenIdx = [];
  for (let i = 0; i < cells.length; i++) if (!cells[i].open && !cells[i].known) hiddenIdx.push(i);
  const H = hiddenIdx.length;
  const totalRem = rem.reduce((a, b) => a + b, 0);
  const prior = new Array(maxLv + 1).fill(0);
  for (let l = 1; l <= maxLv; l++) prior[l] = H ? rem[l] / H : 0;
  prior[0] = H ? Math.max(0, 1 - totalRem / H) : 1;

  const cons = [];
  const varCons = new Map();
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].open) continue;
    let v = 0;
    const vars = [];
    for (const j of C.neighbors(floor, i)) {
      const n = cells[j];
      if (n.open) continue;
      if (n.known) v -= n.m;
      else vars.push(j);
    }
    if (!vars.length) continue;
    v += C.aliveSum(floor, i);
    const ci = cons.length;
    cons.push({ v, vars });
    for (const j of vars) {
      if (!varCons.has(j)) varCons.set(j, []);
      varCons.get(j).push(ci);
    }
  }

  // 제약을 공유하는 변수끼리 묶기
  const comp = new Map();
  const comps = [];
  for (const start of varCons.keys()) {
    if (comp.has(start)) continue;
    const list = [];
    const stack = [start];
    comp.set(start, comps.length);
    while (stack.length) {
      const u = stack.pop();
      list.push(u);
      for (const ci of varCons.get(u)) {
        for (const w of cons[ci].vars) {
          if (!comp.has(w)) {
            comp.set(w, comps.length);
            stack.push(w);
          }
        }
      }
    }
    comps.push(list);
  }

  const dist = new Map(); // 칸 -> 레벨별 확률
  let exact = true;
  for (const vars of comps) {
    const res = enumerate(vars, cons, varCons, rem, prior, maxLv);
    if (!res) {
      exact = false;
      for (const j of vars) dist.set(j, prior.slice());
      continue;
    }
    vars.forEach((j, k) => dist.set(j, res[k]));
  }

  // 경계 밖(바다) 칸
  const sea = hiddenIdx.filter((i) => !dist.has(i));
  if (sea.length) {
    const expFront = new Array(maxLv + 1).fill(0);
    for (const p of dist.values()) for (let l = 1; l <= maxLv; l++) expFront[l] += p[l];
    const ps = new Array(maxLv + 1).fill(0);
    let mon = 0;
    for (let l = 1; l <= maxLv; l++) {
      ps[l] = Math.max(0, rem[l] - expFront[l]) / sea.length;
      mon += ps[l];
    }
    if (mon > 1) for (let l = 1; l <= maxLv; l++) ps[l] /= mon;
    ps[0] = Math.max(0, 1 - Math.min(1, mon));
    for (const i of sea) dist.set(i, ps.slice());
  }
  return { dist, exact };
}

function enumerate(vars, cons, varCons, rem, prior, maxLv) {
  // 지역 번호로 바꿔 타입 배열에서 돈다
  const localC = new Map();
  const cv = [];
  const cOpen = [];
  for (const j of vars) {
    for (const ci of varCons.get(j)) {
      if (!localC.has(ci)) {
        localC.set(ci, cv.length);
        cv.push(cons[ci].v);
        cOpen.push(cons[ci].vars.length);
      }
    }
  }
  // 이미 고른 변수와 제약을 많이 공유하는 변수부터 (제약이 빨리 닫히도록)
  const order = [];
  const placed = new Set();
  const touch = new Map(vars.map((j) => [j, 0]));
  let cur = vars[0];
  while (order.length < vars.length) {
    order.push(cur);
    placed.add(cur);
    for (const ci of varCons.get(cur)) for (const w of cons[ci].vars) if (touch.has(w)) touch.set(w, touch.get(w) + 1);
    let bestW = null;
    let bestT = -1;
    for (const [w, t] of touch) {
      if (placed.has(w)) continue;
      if (t > bestT) {
        bestT = t;
        bestW = w;
      }
    }
    cur = bestW;
  }
  const vc = order.map((j) => Int32Array.from(varCons.get(j).map((ci) => localC.get(ci))));
  const sum = new Int32Array(cv.length);
  const open = Int32Array.from(cOpen);
  const used = new Int32Array(maxLv + 1);
  const acc = order.map(() => new Float64Array(maxLv + 1));
  const assign = new Int32Array(order.length);
  const domain = [];
  for (let l = 0; l <= maxLv; l++) if (l === 0 || rem[l] > 0) domain.push(l);
  const maxD = domain[domain.length - 1];
  let total = 0;
  let nodes = 0;
  let aborted = false;

  function rec(k, w) {
    if (++nodes > NODE_LIMIT) {
      aborted = true;
      return;
    }
    if (k === order.length) {
      total += w;
      for (let q = 0; q < order.length; q++) acc[q][assign[q]] += w;
      return;
    }
    const cs = vc[k];
    for (let di = 0; di < domain.length; di++) {
      const l = domain[di];
      if (l > 0 && used[l] >= rem[l]) continue;
      let good = true;
      for (let q = 0; q < cs.length; q++) {
        const c = cs[q];
        const s = sum[c] + l;
        const o = open[c] - 1;
        const left = cv[c] - s;
        if (left < 0 || left > o * maxD || (o === 0 && left !== 0)) {
          good = false;
          break;
        }
      }
      if (!good) continue;
      for (let q = 0; q < cs.length; q++) {
        sum[cs[q]] += l;
        open[cs[q]]--;
      }
      if (l > 0) used[l]++;
      assign[k] = l;
      rec(k + 1, w * (prior[l] || 1e-9));
      if (l > 0) used[l]--;
      for (let q = 0; q < cs.length; q++) {
        sum[cs[q]] -= l;
        open[cs[q]]++;
      }
      if (aborted) return;
    }
  }
  rec(0, 1);
  if (aborted || total === 0) return null;
  const out = new Map();
  order.forEach((j, q) => out.set(j, Array.from(acc[q], (x) => x / total)));
  return vars.map((j) => out.get(j));
}

// ------------------------------------------------------------------ 봇

function firstDig(run, floor) {
  const x = Math.floor(floor.cols / 2);
  const y = Math.floor(floor.rows / 2);
  let i = y * floor.cols + x;
  // 보스 옆은 피해서 판다
  while (floor.cells[i].known || C.neighbors(floor, i).some((j) => floor.cells[j].known)) i = (i + floor.cols * 3 + 1) % floor.cells.length;
  return C.reveal(run, floor, i);
}

function maxSafeLevel(run, floor) {
  let l = 0;
  while (l + 1 < floor.left.length && C.damageFor(run, floor, l + 1, false) === 0) l++;
  return l;
}

// 사람처럼 단순한 규칙만 쓰는 봇: "숫자 ≤ 내 레벨이면 주변은 안전", 한 칸 남은 제약, 부분집합 규칙
const deducedBy = new WeakMap();
function actHuman(run, floor, stat) {
  const cells = floor.cells;
  if (!floor.generated) return firstDig(run, floor);
  if (!deducedBy.has(floor)) deducedBy.set(floor, new Map());
  const deduced = deducedBy.get(floor);
  for (const k of deduced.keys()) if (cells[k].open) deduced.delete(k);
  const safeLv = maxSafeLevel(run, floor);

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.known && !c.open && C.damageFor(run, floor, c.m, c.boss) === 0) return C.reveal(run, floor, i);
  }
  for (const [i, lv] of deduced) if (lv <= safeLv) return C.reveal(run, floor, i);

  const cons = [];
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].open) continue;
    let v = C.aliveSum(floor, i);
    const vars = [];
    for (const j of C.neighbors(floor, i)) {
      const n = cells[j];
      if (n.open) continue;
      if (n.known) v -= n.m;
      else if (deduced.has(j)) v -= deduced.get(j);
      else vars.push(j);
    }
    if (vars.length) cons.push({ v, vars });
  }
  const todo = new Set();
  let learned = false;
  const consider = (v, vars) => {
    if (v <= safeLv) vars.forEach((j) => todo.add(j));
    else if (vars.length === 1 && !deduced.has(vars[0])) {
      deduced.set(vars[0], v);
      learned = true;
    }
  };
  for (const c of cons) consider(c.v, c.vars);
  if (!todo.size) {
    for (const a of cons) {
      for (const b of cons) {
        if (a === b || a.vars.length >= b.vars.length) continue;
        if (!a.vars.every((j) => b.vars.includes(j))) continue;
        consider(b.v - a.v, b.vars.filter((j) => !a.vars.includes(j)));
      }
    }
  }
  if (todo.size) {
    for (const j of todo) {
      if (floor.cleared || run.dead) break;
      if (!cells[j].open) C.reveal(run, floor, j);
    }
    return [];
  }
  if (learned) return [];

  // 레벨을 아는 마물 중 가장 싸게 이기는 싸움
  let fight = -1;
  let fightCost = Infinity;
  const costOf = (i, lv, boss) => C.damageFor(run, floor, lv, boss);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.open) continue;
    const lv = c.known ? c.m : deduced.get(i);
    if (lv == null) continue;
    const cost = costOf(i, lv, c.known && c.boss);
    if (cost < fightCost && cost < run.hp + (run.items.potion > 0 ? 5 : 0)) {
      fightCost = cost;
      fight = i;
    }
  }

  // 찍기: 주변 제약의 평균 레벨이 가장 낮은 칸
  const hidden = [];
  for (let i = 0; i < cells.length; i++) if (!cells[i].open && !cells[i].known && !deduced.has(i)) hidden.push(i);
  const doFight = () => {
    if (run.hp <= fightCost && run.items.potion > 0 && run.hp < run.maxHp) {
      stat.items++;
      return C.useItem(run, floor, 'potion');
    }
    stat.fights++;
    return C.reveal(run, floor, fight);
  };
  if (!hidden.length) {
    if (fight >= 0) return doFight();
    for (let i = 0; i < cells.length; i++) if (!cells[i].open) return C.reveal(run, floor, i);
    return [];
  }
  if (fight >= 0 && fightCost <= 3) return doFight();
  let remLv = 0;
  floor.left.forEach((n, l) => (remLv += n * l));
  for (const c of cells) if (!c.open && c.known) remLv -= c.m;
  for (const lv of deduced.values()) remLv -= lv;
  const seaDanger = remLv / hidden.length;
  const danger = new Map(hidden.map((i) => [i, seaDanger]));
  for (const c of cons) {
    const d = c.v / c.vars.length;
    for (const j of c.vars) if (danger.get(j) === seaDanger || d > danger.get(j)) danger.set(j, d);
  }
  let best = hidden[0];
  for (const i of hidden) if (danger.get(i) < danger.get(best)) best = i;

  if (!NO_ITEMS && danger.get(best) > 0.3) {
    if (run.items.torch > 0) {
      stat.items++;
      return C.useItem(run, floor, 'torch');
    }
    if (run.items.crystal > 0) {
      stat.items++;
      return C.useItem(run, floor, 'crystal', best);
    }
  }
  if (!NO_ITEMS && run.hp <= 4 && run.items.potion > 0 && run.hp < run.maxHp) {
    stat.items++;
    return C.useItem(run, floor, 'potion');
  }
  stat.guesses++;
  stat.riskyGuesses++;
  return C.reveal(run, floor, best);
}
function expectedDamage(run, floor, p) {
  let e = 0;
  let worst = 0;
  for (let l = 1; l < p.length; l++) {
    if (p[l] <= 1e-12) continue;
    const d = C.damageFor(run, floor, l, false);
    e += p[l] * d;
    if (d > worst) worst = d;
  }
  return { e, worst };
}

function act(run, floor, stat) {
  const cells = floor.cells;
  if (!floor.generated) return firstDig(run, floor);

  // 1) 드러난 마물 중 피해 없이 잡을 수 있는 것
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.known && !c.open && c.m > 0 && C.damageFor(run, floor, c.m, c.boss) === 0) {
      return C.reveal(run, floor, i);
    }
  }

  const { dist } = analyze(run, floor);
  // 2) 확실히 피해 없는 칸을 한꺼번에 연다 (안전 칸 먼저, 그다음 확정 처치).
  //    레벨은 오르기만 하니 한 번 '피해 없음'이면 계속 피해 없음이다.
  const sure = [];
  const sureKill = [];
  for (const [i, p] of dist) {
    if (expectedDamage(run, floor, p).worst !== 0) continue;
    if (p[0] > 0.999999) sure.push(i);
    else sureKill.push(i);
  }
  if (sure.length || sureKill.length) {
    for (const i of sure.concat(sureKill)) {
      if (floor.cleared || run.dead) break;
      if (!cells[i].open) C.reveal(run, floor, i);
    }
    return [];
  }

  // 3) 찍어야 한다
  let best = -1;
  let bestCost = Infinity;
  let bestInfo = null;
  for (const [i, p] of dist) {
    const info = expectedDamage(run, floor, p);
    let fatal = 0;
    for (let l = 1; l < p.length; l++) if (C.damageFor(run, floor, l, false) >= run.hp) fatal += p[l];
    const cost = info.e + fatal * 50 - p[0] * 0.05;
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
      bestInfo = { ...info, fatal, p0: p[0] };
    }
  }

  // 레벨이 확정된 마물과의 싸움이 찍기보다 싸면 싸운다
  let fight = -1;
  let fightCost = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.open) continue;
    let lv = null;
    if (c.known) lv = c.m;
    else if (dist.has(i)) {
      const p = dist.get(i);
      const l = p.findIndex((x) => x > 0.999999);
      if (l > 0) lv = l;
    }
    if (lv == null) continue;
    const cost = C.damageFor(run, floor, lv, c.known && c.boss);
    if (cost < fightCost && cost < run.hp + (run.items.potion > 0 ? 5 : 0)) {
      fightCost = cost;
      fight = i;
    }
  }
  if (fight >= 0 && (best < 0 || fightCost <= bestInfo.e + 1.5)) {
    if (run.hp <= fightCost && run.items.potion > 0 && run.hp < run.maxHp) {
      stat.items++;
      return C.useItem(run, floor, 'potion');
    }
    stat.fights++;
    return C.reveal(run, floor, fight);
  }

  // 보스만 남았거나 경계가 비면 보스에게 덤빈다
  if (best < 0) {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.known && !c.open && c.m > 0) return C.reveal(run, floor, i);
    }
    return [];
  }

  if (!NO_ITEMS) {
    if (bestInfo.e > 0.15) {
      if (run.items.torch > 0) {
        stat.items++;
        return C.useItem(run, floor, 'torch');
      }
      if (run.items.crystal > 0) {
        stat.items++;
        return C.useItem(run, floor, 'crystal', best);
      }
    }
    if (bestInfo.worst >= run.hp && run.items.potion > 0 && run.hp < run.maxHp) {
      stat.items++;
      return C.useItem(run, floor, 'potion');
    }
  }
  stat.guesses++;
  if (bestInfo.e > 0) stat.riskyGuesses++;
  return C.reveal(run, floor, best);
}

function camp(run, floor) {
  const info = C.campArrive(run, floor);
  if (info.offers.length) C.pickRelic(run, floor, info.offers[0]);
  if (NO_ITEMS) return;
  let guard = 20;
  while (guard-- > 0) {
    if (run.items.potion < 2 && C.buy(run, 'potion')) continue;
    if (run.shields < 1 && C.buy(run, 'shield')) continue;
    if (run.items.crystal < 2 && C.buy(run, 'crystal')) continue;
    break;
  }
}

// ------------------------------------------------------------------ 검증
function checkInvariants(run, floor) {
  const left = new Array(floor.left.length).fill(0);
  for (const c of floor.cells) {
    if (c.m > 0 && !c.open) left[c.m]++;
    if (c.open && c.memo) throw new Error('열린 칸에 메모가 남음');
  }
  for (let l = 1; l < left.length; l++) {
    if (left[l] !== floor.left[l]) throw new Error(`left[${l}] 불일치 ${left[l]} != ${floor.left[l]}`);
  }
  if (run.hp > run.maxHp) throw new Error('체력이 최대치를 넘음');
  if (run.hp < 0) throw new Error('체력이 음수');
  for (const k of C.ITEM_KEYS) if (run.items[k] < 0) throw new Error('아이템 음수 ' + k);
  // 0인 열린 칸 주변에 닫힌 안전 칸이 남으면 안 된다
  if (!run.dead) {
    floor.cells.forEach((c, i) => {
      if (!c.open || C.aliveSum(floor, i) !== 0) return;
      for (const j of C.neighbors(floor, i)) {
        if (!floor.cells[j].open) throw new Error(`0 칸(${i}) 옆 ${j}이 닫혀 있음`);
      }
    });
  }
}

// ------------------------------------------------------------------ 실행
function playRun(seed) {
  const run = C.newRun(seed);
  let { floor } = C.startFloor(run);
  const perFloor = [];
  for (;;) {
    const stat = { guesses: 0, riskyGuesses: 0, fights: 0, items: 0, hpStart: run.hp };
    let guard = 0;
    while (!run.dead && !floor.cleared) {
      if (++guard > 4000) throw new Error('무한 루프 seed=' + seed);
      (HUMAN ? actHuman : act)(run, floor, stat);
      checkInvariants(run, floor);
    }
    perFloor.push({ ...stat, dmg: floor.dmg, level: floor.level, hpEnd: run.hp });
    if (run.dead || run.won) break;
    camp(run, floor);
    ({ floor } = C.nextFloor(run));
  }
  return { run, perFloor };
}

const results = [];
for (let k = 0; k < RUNS; k++) results.push(playRun(SEED0 * 100003 + k * 7919 + 1));

const wins = results.filter((r) => r.run.won).length;
const deathsAt = [0, 0, 0, 0, 0];
for (const r of results) if (r.run.dead) deathsAt[r.run.fi]++;
console.log(`판 수 ${RUNS}${HUMAN ? ' · 단순 규칙 봇' : ' · 완전 풀이 봇'}${NO_ITEMS ? ' · 아이템/상점 없이' : ''}`);
console.log(`승률 ${((wins / RUNS) * 100).toFixed(1)}%`);
console.log('사망 층  ' + deathsAt.map((n, i) => `B${i + 1}:${n}`).join('  '));
for (let f = 0; f < 5; f++) {
  const fl = results.map((r) => r.perFloor[f]).filter(Boolean);
  if (!fl.length) continue;
  const avg = (key) => (fl.reduce((a, x) => a + x[key], 0) / fl.length).toFixed(2);
  console.log(
    `B${f + 1}  도달 ${fl.length}  피해 ${avg('dmg')}  싸움 ${avg('fights')}  찍기 ${avg('guesses')}  아이템 ${avg('items')}  시작HP ${avg('hpStart')}  끝HP ${avg('hpEnd')}`
  );
}
const scores = results.map((r) => C.score(r.run)).sort((a, b) => a - b);
console.log(`점수 중앙값 ${scores[scores.length >> 1]}  최고 ${scores[scores.length - 1]}`);
