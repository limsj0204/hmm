#!/usr/bin/env node
/*
 * 규칙 단위 테스트: node tools/test-core.js
 */
'use strict';

const assert = require('assert');
const C = require('../js/core.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error('✗ ' + name);
    throw e;
  }
}

// 첫 칸을 파서 판을 만든 뒤 상태를 돌려준다
function dug(seed, fi) {
  const run = C.newRun(seed);
  run.fi = fi || 0;
  const { floor } = C.startFloor(run);
  const first = Math.floor(floor.rows / 2) * floor.cols + 1;
  C.reveal(run, floor, first);
  return { run, floor, first };
}

test('첫 칸 주변 3×3에는 마물이 없고 0이라 펼쳐진다', () => {
  for (let seed = 1; seed < 200; seed++) {
    const { floor, first } = dug(seed);
    assert.strictEqual(C.aliveSum(floor, first), 0);
    assert.ok(floor.cells.filter((c) => c.open).length >= 9);
  }
});

test('층마다 마물 수와 남은 수가 설정과 같다', () => {
  for (let fi = 0; fi < C.FLOORS.length; fi++) {
    const { floor } = dug(fi + 11, fi);
    const def = C.FLOORS[fi];
    def.counts.forEach((n, k) => {
      assert.strictEqual(floor.cells.filter((c) => c.m === k + 1).length, n);
      assert.strictEqual(floor.left[k + 1], n);
    });
    if (def.boss) assert.strictEqual(floor.cells.filter((c) => c.boss).length, 1);
  }
});

test('경험치 문턱은 오르기만 하고 보스 층 마지막 문턱은 닿을 수 있다', () => {
  for (let fi = 0; fi < C.FLOORS.length; fi++) {
    const { floor } = dug(5, fi);
    const total = C.FLOORS[fi].counts.reduce((a, n, k) => a + n * (k + 1), 0);
    for (let k = 1; k < floor.thresholds.length; k++) assert.ok(floor.thresholds[k] > floor.thresholds[k - 1]);
    assert.ok(floor.thresholds[floor.thresholds.length - 1] <= total);
  }
});

test('피해 공식: 내 레벨 이하는 0, 보스는 두 배, 투구와 검이 줄여 준다', () => {
  const run = C.newRun(1);
  const fl = { level: 1 };
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((m) => C.damageFor(run, fl, m, false)), [0, 2, 4, 8, 12]);
  assert.strictEqual(C.damageFor(run, { level: 5 }, 6, true), 8);
  run.relics.push('helmet');
  assert.strictEqual(C.damageFor(run, fl, 2, false), 1);
  assert.strictEqual(C.damageFor(run, fl, 5, false), 10);
  run.relics = ['sword'];
  assert.strictEqual(C.damageFor(run, fl, 2, false), 1);
  assert.strictEqual(C.damageFor(run, fl, 3, false), 4);
});

test('메모 합이 숫자와 같으면 나머지를 한 번에 열고, 다르면 거부한다', () => {
  let checked = 0;
  for (let seed = 1; seed < 400 && checked < 30; seed++) {
    const { run, floor } = dug(seed);
    // 숨은 이웃 중 마물과 안전 칸이 섞인 숫자 칸을 찾는다
    const i = floor.cells.findIndex((c, k) => {
      if (!c.open || C.aliveSum(floor, k) <= floor.level) return false;
      const hid = C.neighbors(floor, k).filter((j) => !floor.cells[j].open);
      return hid.some((j) => floor.cells[j].m === 0) && hid.some((j) => floor.cells[j].m > 0 && !floor.cells[j].known);
    });
    if (i < 0) continue;
    const hid = C.neighbors(floor, i).filter((j) => !floor.cells[j].open);
    const mons = hid.filter((j) => floor.cells[j].m > 0);
    const safe = hid.filter((j) => floor.cells[j].m === 0);
    // 틀린 메모
    C.setMemo(floor, mons[0], floor.cells[mons[0]].m === 1 ? 2 : 1);
    mons.slice(1).forEach((j) => C.setMemo(floor, j, floor.cells[j].m));
    const bad = C.chord(run, floor, i);
    assert.strictEqual(bad[0].t, 'chord-fail');
    assert.ok(safe.every((j) => !floor.cells[j].open));
    // 맞는 메모
    mons.forEach((j) => C.setMemo(floor, j, floor.cells[j].m));
    const hp = run.hp;
    const ev = C.chord(run, floor, i);
    assert.ok(ev.some((e) => e.t === 'open'));
    assert.ok(safe.every((j) => floor.cells[j].open));
    assert.ok(mons.every((j) => !floor.cells[j].open));
    assert.strictEqual(run.hp, hp);
    checked++;
  }
  assert.ok(checked >= 10, '한 번에 열기를 시험할 판이 부족함');
});

test('숫자가 내 레벨 이하면 숫자를 눌러 주변을 피해 없이 한꺼번에 연다', () => {
  let checked = 0;
  for (let seed = 1; seed < 300 && checked < 20; seed++) {
    const { run, floor } = dug(seed);
    const i = floor.cells.findIndex((c, k) => c.open && C.aliveSum(floor, k) === 1);
    if (i < 0) continue;
    const hp = run.hp;
    const ev = C.chord(run, floor, i);
    assert.strictEqual(ev[0].t, 'sweep');
    assert.strictEqual(run.hp, hp);
    C.neighbors(floor, i).forEach((j) => assert.ok(floor.cells[j].open));
    assert.strictEqual(C.aliveSum(floor, i), 0);
    checked++;
  }
  assert.ok(checked >= 10);
});

test('마물을 잡으면 이웃 숫자가 줄고, 0이 된 칸에서 다시 펼쳐진다', () => {
  for (let seed = 1; seed < 300; seed++) {
    const { run, floor } = dug(seed);
    const i = floor.cells.findIndex((c, k) => c.m === 1 && !c.open && C.neighbors(floor, k).some((j) => floor.cells[j].open));
    if (i < 0) continue;
    const opens = C.neighbors(floor, i).filter((j) => floor.cells[j].open);
    const before = opens.map((j) => C.aliveSum(floor, j));
    const ev = C.reveal(run, floor, i);
    assert.ok(ev.some((e) => e.t === 'kill'));
    opens.forEach((j, k) => assert.strictEqual(C.aliveSum(floor, j), before[k] - 1));
    floor.cells.forEach((c, k) => {
      if (c.open && C.aliveSum(floor, k) === 0) C.neighbors(floor, k).forEach((j) => assert.ok(floor.cells[j].open));
    });
    return;
  }
  throw new Error('시험할 슬라임을 못 찾음');
});

test('아이템: 수정구슬, 횃불, 폭탄, 물약', () => {
  const { run, floor } = dug(42, 2);
  run.items = { potion: 1, crystal: 1, torch: 1, bomb: 1 };
  const mon = floor.cells.findIndex((c) => c.m > 0 && !c.open && !c.known);
  let ev = C.useItem(run, floor, 'crystal', mon);
  assert.strictEqual(ev[0].t, 'scry');
  assert.ok(floor.cells[mon].known && !floor.cells[mon].open);
  assert.strictEqual(C.useItem(run, floor, 'crystal', mon)[0].reason, 'empty');

  ev = C.useItem(run, floor, 'torch');
  const lit = ev[0].cells;
  assert.strictEqual(lit.length, 3);
  const minAlive = Math.min(...floor.cells.filter((c, k) => c.m > 0 && !c.open && lit.indexOf(k) === -1 && k !== mon).map((c) => c.m));
  lit.forEach((k) => assert.ok(floor.cells[k].m <= minAlive));

  const target = floor.cells.findIndex((c, k) => C.neighbors(floor, k).filter((j) => floor.cells[j].m > 2 && !floor.cells[j].open).length >= 2);
  const area = [target].concat(C.neighbors(floor, target));
  const hp = run.hp;
  ev = C.useItem(run, floor, 'bomb', target);
  assert.strictEqual(run.hp, hp);
  area.forEach((k) => assert.ok(floor.cells[k].open, '폭탄 범위가 열리지 않음'));
  assert.ok(ev.filter((e) => e.t === 'kill').length >= 2);

  assert.strictEqual(C.useItem(run, floor, 'potion')[0].reason, 'full');
  run.hp = 3;
  ev = C.useItem(run, floor, 'potion');
  assert.strictEqual(run.hp, 3 + C.POTION_HEAL);
});

test('죽으면 더 행동할 수 없고, 불사조 깃털은 한 번 살려 준다', () => {
  const { run, floor } = dug(7, 3);
  run.hp = 1;
  run.relics.push('feather');
  const big = floor.cells.findIndex((c) => c.m === 5 && !c.open);
  let ev = C.reveal(run, floor, big);
  assert.ok(ev.some((e) => e.t === 'revive'));
  assert.strictEqual(run.dead, false);
  run.hp = 1;
  const big2 = floor.cells.findIndex((c) => c.m === 5 && !c.open);
  ev = C.reveal(run, floor, big2);
  assert.ok(ev.some((e) => e.t === 'death'));
  assert.ok(run.dead);
  const any = floor.cells.findIndex((c) => !c.open && c.m === 0);
  assert.strictEqual(C.reveal(run, floor, any).length, 0);
});

test('야영지: 휴식, 보상, 유물, 상점', () => {
  const run = C.newRun(3);
  const { floor } = C.startFloor(run);
  run.hp = 4;
  floor.cleared = true;
  const info = C.campArrive(run, floor);
  assert.strictEqual(run.hp, 7);
  assert.strictEqual(info.perfect, true);
  assert.strictEqual(run.gold, 25);
  assert.strictEqual(C.campArrive(run, floor), info, '두 번 들어와도 보상은 한 번');
  assert.strictEqual(info.offers.length, 3);
  assert.ok(C.pickRelic(run, floor, info.offers[0]));
  assert.ok(!C.pickRelic(run, floor, info.offers[1]), '유물은 하나만');
  assert.ok(C.buy(run, 'potion'));
  assert.strictEqual(run.gold, 25 - C.priceOf('potion'));
  assert.ok(!C.buy(run, 'bomb'));
  const next = C.nextFloor(run).floor;
  assert.strictEqual(next.fi, 1);
});

test('상태는 JSON으로 저장했다 되살려도 똑같이 이어진다', () => {
  const a = dug(99, 1);
  const saved = JSON.parse(JSON.stringify({ run: a.run, floor: a.floor }));
  const target = a.floor.cells.findIndex((c) => !c.open);
  const evA = C.reveal(a.run, a.floor, target);
  const evB = C.reveal(saved.run, saved.floor, target);
  assert.deepStrictEqual(evB, evA);
  assert.deepStrictEqual(saved.floor.cells, a.floor.cells);
});

console.log(`규칙 테스트 ${passed}개 통과`);
