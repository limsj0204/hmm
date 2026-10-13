/*
 * 지뢰 던전 — 게임 규칙
 *
 * DOM을 쓰지 않는 순수 로직이라 브라우저와 Node(밸런스 시뮬레이터) 양쪽에서 돈다.
 * 행동 함수는 상태를 바꾸고, 화면이 재생할 이벤트 배열을 돌려준다.
 *
 * 핵심 규칙
 *  - 열린 칸의 숫자 = 주변 8칸에 "살아 있는" 마물들의 레벨 합
 *  - 내 레벨 이하의 마물은 피해 없이 처치, 더 강하면 피해를 받고 처치
 *  - 레벨은 층마다 1부터. 레벨 k 이하 마물 경험치 총합의 80%를 모으면 k+1
 *  - 층의 마물을 모두 처치하면 정복 (마지막 층은 보스 처치)
 */
(function (root) {
  'use strict';

  const MEMO_Q = 9; // '?' 메모
  const BOSS_LEVEL = 6;
  // 밸런스 값 (시뮬레이터가 바꿔 가며 실험한다)
  const TUNING = { expRatio: 1.1, bossRatio: 0.9 };
  const START_HP = 10;
  const POTION_HEAL = 5;
  const REST_HEAL = 3;

  const MONSTERS = [
    null,
    { key: 'slime', name: '슬라임', short: '슬라임' },
    { key: 'bat', name: '박쥐', short: '박쥐' },
    { key: 'skull', name: '해골 병사', short: '해골' },
    { key: 'ghost', name: '망령', short: '망령' },
    { key: 'demon', name: '데몬', short: '데몬' },
    { key: 'lich', name: '심연의 리치', short: '리치' },
  ];

  const FLOORS = [
    { name: '슬라임 소굴', cols: 8, rows: 10, counts: [6, 3, 2], chests: 2 },
    { name: '박쥐 동굴', cols: 9, rows: 11, counts: [6, 4, 3, 2], chests: 2 },
    { name: '해골 납골당', cols: 9, rows: 12, counts: [6, 4, 4, 2, 2], chests: 3 },
    { name: '망령의 수로', cols: 10, rows: 13, counts: [7, 5, 5, 3, 3], chests: 3 },
    { name: '리치의 옥좌', cols: 10, rows: 14, counts: [7, 6, 5, 4, 4], chests: 3, boss: true },
  ];

  const ITEMS = {
    potion: { name: '회복 물약', short: '물약', desc: '체력을 5 회복해요.', target: false },
    crystal: { name: '수정구슬', short: '수정구슬', desc: '숨은 칸 하나의 정체를 안전하게 확인해요.', target: true },
    torch: { name: '횃불', short: '횃불', desc: '가장 약한 마물 3마리의 위치를 비춰요.', target: false },
    bomb: { name: '폭탄', short: '폭탄', desc: '3×3 범위의 마물을 레벨과 상관없이 처치해요. 보스는 버텨요.', target: true },
  };
  const ITEM_KEYS = ['potion', 'crystal', 'torch', 'bomb'];
  const SHIELD = { name: '방패', desc: '다음 피해 한 번을 막아요.' };

  const SHOP = [
    { key: 'potion', price: 14 },
    { key: 'crystal', price: 16 },
    { key: 'torch', price: 18 },
    { key: 'shield', price: 20 },
    { key: 'bomb', price: 30 },
  ];

  const RELICS = {
    sword: { name: '용사의 검', desc: '나보다 레벨이 1 높은 마물에게 받는 피해가 1로 줄어요. 보스에게는 통하지 않아요.' },
    helmet: { name: '강철 투구', desc: '받는 피해가 2 줄어요. 최소 1은 받아요.' },
    heart: { name: '거인의 심장', desc: '최대 체력이 4 늘고, 바로 4 회복해요.' },
    fang: { name: '흡혈 송곳니', desc: '마물을 3마리 처치할 때마다 체력을 1 회복해요.' },
    pouch: { name: '탐욕의 주머니', desc: '얻는 골드가 50% 늘어요.' },
    eye: { name: '예언자의 눈', desc: '층마다 가장 강한 마물 2마리의 위치가 드러나요.' },
    clover: { name: '네잎클로버', desc: '층마다 보물상자가 2개 더 숨겨져요.' },
    candle: { name: '영원의 촛불', desc: '층을 정복할 때마다 체력을 4 더 회복해요.' },
    feather: { name: '불사조 깃털', desc: '쓰러질 때 한 번, 체력 5로 되살아나요.' },
    book: { name: '현자의 책', desc: '마물을 처치할 때 경험치를 1 더 얻어요.' },
    pickaxe: { name: '광부의 곡괭이', desc: '층의 첫 발굴이 5×5로 넓어지고, 층마다 수정구슬을 1개 얻어요.' },
  };
  const RELIC_KEYS = Object.keys(RELICS);

  // ---------------------------------------------------------------- 난수
  // mulberry32. 상태가 정수 하나라 저장/복원이 쉽다.
  function rand(run) {
    let a = (run.rng = (run.rng + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(run, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(run) * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // ---------------------------------------------------------------- 격자
  const nbCache = new Map();
  function neighbors(floor, i) {
    const key = floor.cols + 'x' + floor.rows;
    let table = nbCache.get(key);
    if (!table) {
      table = [];
      for (let y = 0; y < floor.rows; y++) {
        for (let x = 0; x < floor.cols; x++) {
          const list = [];
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < floor.cols && ny >= 0 && ny < floor.rows) list.push(ny * floor.cols + nx);
            }
          }
          table.push(list);
        }
      }
      nbCache.set(key, table);
    }
    return table[i];
  }

  function aliveSum(floor, i) {
    let s = 0;
    for (const j of neighbors(floor, i)) {
      const c = floor.cells[j];
      if (c.m > 0 && !c.open) s += c.m;
    }
    return s;
  }

  function hasRelic(run, key) {
    return run.relics.indexOf(key) !== -1;
  }

  // ---------------------------------------------------------------- 런 / 층
  function newRun(seed) {
    seed = seed >>> 0 || (Math.random() * 4294967296) >>> 0 || 1;
    return {
      v: 1,
      seed,
      rng: seed | 0,
      fi: 0,
      hp: START_HP,
      maxHp: START_HP,
      gold: 0,
      shields: 0,
      items: { potion: 1, crystal: 1, torch: 0, bomb: 0 },
      relics: [],
      featherUsed: false,
      fangCount: 0,
      stats: { kills: 0, exp: 0, gold: 0, dmg: 0, chests: 0, floors: 0, time: 0 },
      dead: false,
      won: false,
      cause: null,
    };
  }

  // 레벨 k+1이 되려면 레벨 k 이하 마물 경험치 총합의 expRatio배가 필요하다.
  // 1보다 크면 한 단계 위 마물과 피해를 감수하고 싸워야 레벨이 오른다.
  // 보스 층의 마지막 단계만은 일반 마물을 거의 다 잡으면 닿도록 bossRatio로 묶는다.
  function thresholds(def) {
    const cap = def.counts.length + (def.boss ? 1 : 0);
    const total = def.counts.reduce((a, n, k) => a + n * (k + 1), 0);
    const out = [];
    let s = 0;
    for (let k = 1; k < cap; k++) {
      s += def.counts[k - 1] * k;
      let t = Math.ceil(s * TUNING.expRatio);
      if (def.boss && k === cap - 1) t = Math.ceil(total * TUNING.bossRatio);
      t = Math.min(t, total);
      if (out.length && t <= out[out.length - 1]) t = out[out.length - 1] + 1;
      out.push(t);
    }
    return out;
  }

  function startFloor(run) {
    const def = FLOORS[run.fi];
    const cells = [];
    for (let i = 0; i < def.cols * def.rows; i++) {
      cells.push({ m: 0, boss: false, chest: false, open: false, known: false, memo: 0 });
    }
    const left = [0].concat(def.counts);
    if (def.boss) left[BOSS_LEVEL] = 1;
    const floor = {
      fi: run.fi,
      cols: def.cols,
      rows: def.rows,
      cells,
      generated: false,
      level: 1,
      exp: 0,
      cap: def.counts.length + (def.boss ? 1 : 0),
      thresholds: thresholds(def),
      left,
      boss: -1,
      kills: 0,
      dmg: 0,
      cleared: false,
      camped: null,
    };
    const events = [];
    if (def.boss) {
      // 보스는 처음부터 모습을 드러낸 채 중앙 부근에 앉아 있다
      const spots = [];
      for (let y = 3; y < def.rows - 3; y++) {
        for (let x = 2; x < def.cols - 2; x++) spots.push(y * def.cols + x);
      }
      const b = spots[Math.floor(rand(run) * spots.length)];
      cells[b].m = BOSS_LEVEL;
      cells[b].boss = true;
      cells[b].known = true;
      floor.boss = b;
    }
    if (hasRelic(run, 'pickaxe')) {
      run.items.crystal++;
      events.push({ t: 'gift', key: 'crystal', from: 'pickaxe' });
    }
    return { floor, events };
  }

  function generate(run, floor, first, ev) {
    const def = FLOORS[floor.fi];
    const cells = floor.cells;
    const r = hasRelic(run, 'pickaxe') ? 2 : 1;
    const fx = first % floor.cols;
    const fy = (first / floor.cols) | 0;
    const pool = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].boss) continue;
      const x = i % floor.cols;
      const y = (i / floor.cols) | 0;
      if (Math.abs(x - fx) <= r && Math.abs(y - fy) <= r) continue;
      pool.push(i);
    }
    shuffle(run, pool);
    let k = 0;
    def.counts.forEach((n, idx) => {
      for (let j = 0; j < n; j++) cells[pool[k++]].m = idx + 1;
    });

    const safe = [];
    for (let i = 0; i < cells.length; i++) if (cells[i].m === 0 && i !== first) safe.push(i);
    shuffle(run, safe);
    const chests = def.chests + (hasRelic(run, 'clover') ? 2 : 0);
    for (let j = 0; j < chests && j < safe.length; j++) cells[safe[j]].chest = true;

    // 생성 전에 남긴 메모는 근거가 없으니 지운다
    for (const c of cells) if (!c.known) c.memo = 0;
    floor.generated = true;

    if (hasRelic(run, 'eye')) {
      const alive = [];
      cells.forEach((c, i) => {
        if (c.m > 0 && !c.boss) alive.push(i);
      });
      shuffle(run, alive).sort((a, b) => cells[b].m - cells[a].m);
      const seen = alive.slice(0, 2);
      seen.forEach((i) => {
        cells[i].known = true;
      });
      ev.push({ t: 'eye', cells: seen });
    }
  }

  // ---------------------------------------------------------------- 전투
  function damageFor(run, floor, m, boss) {
    const L = floor.level;
    if (m <= L) return 0;
    let d = Math.ceil(((m - L) * (m + 1)) / 2);
    if (boss) d *= 2;
    else if (m === L + 1 && hasRelic(run, 'sword')) d = 1;
    if (hasRelic(run, 'helmet')) d = Math.max(1, d - 2);
    return d;
  }

  function slay(run, floor, i, ev, by) {
    const c = floor.cells[i];
    const m = c.m;
    c.open = true;
    c.memo = 0;
    c.known = false;
    floor.left[m]--;
    floor.kills++;
    run.stats.kills++;
    const xp = m + (hasRelic(run, 'book') ? 1 : 0);
    floor.exp += xp;
    run.stats.exp += xp;
    const gold = gainGold(run, m);
    ev.push({ t: 'kill', i, m, xp, gold, boss: c.boss, by: by || 'hand' });

    if (hasRelic(run, 'fang')) {
      run.fangCount++;
      if (run.fangCount % 3 === 0 && run.hp < run.maxHp) {
        run.hp++;
        ev.push({ t: 'heal', amount: 1, from: 'fang', i });
      }
    }
    while (floor.level < floor.cap && floor.exp >= floor.thresholds[floor.level - 1]) {
      floor.level++;
      const heal = run.hp < run.maxHp ? 1 : 0;
      run.hp += heal;
      ev.push({ t: 'levelup', level: floor.level, heal });
    }
  }

  // 마물을 공격한다. 살아남으면 true.
  function attack(run, floor, i, ev) {
    const c = floor.cells[i];
    const m = c.m;
    let dmg = damageFor(run, floor, m, c.boss);
    ev.push({ t: 'strike', i, m, boss: c.boss });
    if (dmg > 0) {
      if (run.shields > 0) {
        run.shields--;
        ev.push({ t: 'block', i, m, dmg });
        dmg = 0;
      } else {
        run.hp -= dmg;
        floor.dmg += dmg;
        run.stats.dmg += dmg;
        ev.push({ t: 'hurt', i, m, dmg });
        if (run.hp <= 0) {
          if (hasRelic(run, 'feather') && !run.featherUsed) {
            run.featherUsed = true;
            run.hp = Math.min(5, run.maxHp);
            ev.push({ t: 'revive', i });
          } else {
            run.hp = 0;
            run.dead = true;
            run.cause = { fi: floor.fi, m, boss: c.boss };
            c.known = true;
            ev.push({ t: 'death', i, m, boss: c.boss });
            return false;
          }
        }
      }
    }
    slay(run, floor, i, ev, 'hand');
    return true;
  }

  // ---------------------------------------------------------------- 열기
  function gainGold(run, amount) {
    const g = hasRelic(run, 'pouch') ? Math.ceil(amount * 1.5) : amount;
    run.gold += g;
    run.stats.gold += g;
    return g;
  }

  function rollLoot(run, fi) {
    const r = rand(run);
    if (r < 0.45) return { kind: 'gold', amount: 6 + Math.floor(rand(run) * 5) + fi * 3 };
    if (r < 0.65) return { kind: 'item', key: 'potion' };
    if (r < 0.8) return { kind: 'item', key: 'crystal' };
    if (r < 0.9) return { kind: 'item', key: 'torch' };
    if (r < 0.95) return { kind: 'shield' };
    return { kind: 'item', key: 'bomb' };
  }

  function grantLoot(run, loot) {
    if (loot.kind === 'gold') loot.amount = gainGold(run, loot.amount);
    else if (loot.kind === 'shield') run.shields++;
    else run.items[loot.key] = (run.items[loot.key] || 0) + 1;
  }

  function openSafe(run, floor, i, d, batch, loot) {
    const c = floor.cells[i];
    c.open = true;
    c.memo = 0;
    c.known = false;
    batch.push({ i, d });
    if (c.chest) {
      c.chest = false;
      const l = rollLoot(run, floor.fi);
      grantLoot(run, l);
      run.stats.chests++;
      loot.push({ t: 'chest', i, loot: l });
    }
  }

  // seeds에서 시작해 숫자 0인 칸을 따라 퍼지며 연다. 이미 열린 seed는 확장만 한다.
  function flood(run, floor, seeds, ev) {
    const cells = floor.cells;
    const batch = [];
    const loot = [];
    const dist = new Map();
    const queue = [];
    for (const s of seeds) {
      if (dist.has(s)) continue;
      const c = cells[s];
      if (!c.open) {
        if (c.m > 0) continue;
        openSafe(run, floor, s, 0, batch, loot);
      }
      dist.set(s, 0);
      queue.push(s);
    }
    for (let h = 0; h < queue.length; h++) {
      const u = queue[h];
      if (aliveSum(floor, u) !== 0) continue;
      const du = dist.get(u);
      for (const v of neighbors(floor, u)) {
        const c = cells[v];
        if (c.open || c.m > 0) continue;
        openSafe(run, floor, v, du + 1, batch, loot);
        dist.set(v, du + 1);
        queue.push(v);
      }
    }
    if (batch.length) ev.push({ t: 'open', cells: batch });
    for (const l of loot) ev.push(l);
  }

  // 마물이 쓰러진 자리와 그 이웃 중 숫자가 0이 된 칸에서 다시 퍼진다
  function cascadeAround(run, floor, list, ev) {
    const seeds = [];
    const seen = new Set();
    for (const i of list) {
      for (const j of [i].concat(neighbors(floor, i))) {
        if (seen.has(j)) continue;
        seen.add(j);
        if (floor.cells[j].open && aliveSum(floor, j) === 0) seeds.push(j);
      }
    }
    if (seeds.length) flood(run, floor, seeds, ev);
  }

  function checkClear(run, floor, origin, ev) {
    if (floor.cleared || run.dead) return;
    const def = FLOORS[floor.fi];
    const done = def.boss ? floor.cells[floor.boss].open : floor.left.every((n) => n === 0);
    if (!done) return;
    floor.cleared = true;
    const ox = origin % floor.cols;
    const oy = (origin / floor.cols) | 0;
    const batch = [];
    const loot = [];
    const fled = [];
    floor.cells.forEach((c, i) => {
      if (c.open) return;
      if (c.m > 0) {
        c.known = true;
        c.memo = 0;
        fled.push(i);
        return;
      }
      const d = Math.max(Math.abs((i % floor.cols) - ox), Math.abs(((i / floor.cols) | 0) - oy));
      openSafe(run, floor, i, d, batch, loot);
    });
    if (batch.length) ev.push({ t: 'open', cells: batch, sweep: true });
    for (const l of loot) ev.push(l);
    run.stats.floors++;
    if (def.boss) run.won = true;
    ev.push({ t: 'clear', fi: floor.fi, won: !!def.boss, fled });
  }

  function canAct(run, floor) {
    return !!floor && !run.dead && !run.won && !floor.cleared;
  }

  // ---------------------------------------------------------------- 행동
  function reveal(run, floor, i) {
    const ev = [];
    if (!canAct(run, floor)) return ev;
    const c = floor.cells[i];
    if (!c || c.open) return ev;
    if (!floor.generated) generate(run, floor, i, ev);
    if (c.m > 0) {
      if (attack(run, floor, i, ev)) cascadeAround(run, floor, [i], ev);
    } else {
      flood(run, floor, [i], ev);
    }
    checkClear(run, floor, i, ev);
    return ev;
  }

  // 숫자 칸을 눌렀을 때
  //  - 숫자가 내 레벨 이하면 주변 숨은 칸은 전부 피해 없이 열리니 한꺼번에 연다
  //  - 아니면 주변 메모(또는 드러난 마물) 레벨 합이 숫자와 같을 때 나머지를 한 번에 연다
  function chord(run, floor, i) {
    const ev = [];
    if (!canAct(run, floor)) return ev;
    const c = floor.cells[i];
    if (!c || !c.open) return ev;
    const v = aliveSum(floor, i);
    if (v === 0) return ev;
    if (damageFor(run, floor, v, false) === 0) {
      const hidden = neighbors(floor, i).filter((j) => !floor.cells[j].open);
      ev.push({ t: 'sweep', i, cells: hidden });
      const safe = hidden.filter((j) => floor.cells[j].m === 0);
      if (safe.length) flood(run, floor, safe, ev);
      for (const j of hidden) {
        if (floor.cells[j].m > 0 && !floor.cells[j].open) {
          attack(run, floor, j, ev);
          cascadeAround(run, floor, [j], ev);
        }
      }
      checkClear(run, floor, i, ev);
      return ev;
    }
    let sum = 0;
    const unknown = [];
    for (const j of neighbors(floor, i)) {
      const n = floor.cells[j];
      if (n.open) continue;
      if (n.known) sum += n.m;
      else if (n.memo === MEMO_Q) {
        ev.push({ t: 'chord-fail', i, reason: 'q' });
        return ev;
      } else if (n.memo > 0) sum += n.memo;
      else unknown.push(j);
    }
    if (!unknown.length) {
      ev.push({ t: 'chord-fail', i, reason: 'none' });
      return ev;
    }
    if (sum !== v) {
      ev.push({ t: 'chord-fail', i, reason: 'sum', sum, v });
      return ev;
    }
    const safe = unknown.filter((j) => floor.cells[j].m === 0);
    const bad = unknown.filter((j) => floor.cells[j].m > 0);
    if (safe.length) flood(run, floor, safe, ev);
    for (const j of bad) {
      if (!attack(run, floor, j, ev)) break;
      cascadeAround(run, floor, [j], ev);
    }
    checkClear(run, floor, i, ev);
    return ev;
  }

  function setMemo(floor, i, value) {
    const c = floor.cells[i];
    if (!c || c.open || c.known) return false;
    c.memo = value;
    return true;
  }

  function fail(ev, reason) {
    ev.push({ t: 'fail', reason });
    return ev;
  }

  function useItem(run, floor, key, i) {
    const ev = [];
    if (!(run.items[key] > 0)) return fail(ev, 'empty');
    if (key === 'potion') {
      if (run.dead) return fail(ev, 'busy');
      if (run.hp >= run.maxHp) return fail(ev, 'full');
      run.items.potion--;
      const h = Math.min(POTION_HEAL, run.maxHp - run.hp);
      run.hp += h;
      ev.push({ t: 'heal', amount: h, from: 'potion' });
      return ev;
    }
    if (!canAct(run, floor)) return fail(ev, 'busy');
    if (!floor.generated) return fail(ev, 'ungenerated');

    if (key === 'crystal') {
      const c = floor.cells[i];
      if (!c || c.open || c.known) return fail(ev, 'target');
      run.items.crystal--;
      if (c.m > 0) {
        c.known = true;
        c.memo = 0;
        ev.push({ t: 'scry', i, m: c.m });
      } else {
        ev.push({ t: 'scry', i, m: 0 });
        flood(run, floor, [i], ev);
      }
      return ev;
    }

    if (key === 'torch') {
      const alive = [];
      floor.cells.forEach((c, j) => {
        if (c.m > 0 && !c.open && !c.known && !c.boss) alive.push(j);
      });
      if (!alive.length) return fail(ev, 'none');
      run.items.torch--;
      shuffle(run, alive).sort((a, b) => floor.cells[a].m - floor.cells[b].m);
      const lit = alive.slice(0, 3);
      lit.forEach((j) => {
        floor.cells[j].known = true;
        floor.cells[j].memo = 0;
      });
      ev.push({ t: 'torch', cells: lit });
      return ev;
    }

    if (key === 'bomb') {
      if (i == null || !floor.cells[i]) return fail(ev, 'target');
      const area = [i].concat(neighbors(floor, i));
      if (!area.some((j) => !floor.cells[j].open)) return fail(ev, 'target');
      run.items.bomb--;
      ev.push({ t: 'boom', i, area });
      const safe = [];
      const slain = [];
      for (const j of area) {
        const c = floor.cells[j];
        if (c.open) continue;
        if (c.boss) {
          ev.push({ t: 'immune', i: j });
          continue;
        }
        if (c.m > 0) {
          slay(run, floor, j, ev, 'bomb');
          slain.push(j);
        } else safe.push(j);
      }
      if (safe.length) flood(run, floor, safe, ev);
      if (slain.length) cascadeAround(run, floor, slain, ev);
      checkClear(run, floor, i, ev);
      return ev;
    }
    return fail(ev, 'empty');
  }

  // ---------------------------------------------------------------- 야영지
  function relicOffers(run, n) {
    const pool = RELIC_KEYS.filter((k) => !hasRelic(run, k));
    return shuffle(run, pool).slice(0, n);
  }

  function campArrive(run, floor) {
    if (floor.camped) return floor.camped;
    const want = REST_HEAL + (hasRelic(run, 'candle') ? 4 : 0);
    const heal = Math.min(want, run.maxHp - run.hp);
    run.hp += heal;
    const perfect = floor.dmg === 0;
    const bonus = gainGold(run, 10 + 5 * floor.fi + (perfect ? 15 : 0));
    floor.camped = {
      heal,
      bonus,
      perfect,
      kills: floor.kills,
      dmg: floor.dmg,
      offers: relicOffers(run, 3),
      picked: null,
    };
    return floor.camped;
  }

  function pickRelic(run, floor, key) {
    const camp = floor.camped;
    if (!camp || camp.picked || camp.offers.indexOf(key) === -1) return false;
    camp.picked = key;
    run.relics.push(key);
    if (key === 'heart') {
      run.maxHp += 4;
      run.hp = Math.min(run.maxHp, run.hp + 4);
    }
    return true;
  }

  function priceOf(key) {
    const s = SHOP.find((x) => x.key === key);
    return s ? s.price : Infinity;
  }

  function buy(run, key) {
    const price = priceOf(key);
    if (run.gold < price) return false;
    run.gold -= price;
    if (key === 'shield') run.shields++;
    else run.items[key] = (run.items[key] || 0) + 1;
    return true;
  }

  function nextFloor(run) {
    run.fi++;
    return startFloor(run);
  }

  // ---------------------------------------------------------------- 표시용
  function expInfo(floor) {
    const L = floor.level;
    const prev = L >= 2 ? floor.thresholds[L - 2] : 0;
    const next = L < floor.cap ? floor.thresholds[L - 1] : null;
    return { level: L, exp: floor.exp, prev, next, max: next === null };
  }

  function score(run) {
    return run.stats.exp * 10 + run.stats.gold * 2 + run.stats.floors * 250 + (run.won ? 1000 + run.hp * 50 : 0);
  }

  const api = {
    TUNING,
    MEMO_Q,
    BOSS_LEVEL,
    MONSTERS,
    FLOORS,
    ITEMS,
    ITEM_KEYS,
    SHIELD,
    SHOP,
    RELICS,
    RELIC_KEYS,
    POTION_HEAL,
    newRun,
    startFloor,
    nextFloor,
    neighbors,
    aliveSum,
    damageFor,
    hasRelic,
    reveal,
    chord,
    setMemo,
    useItem,
    campArrive,
    pickRelic,
    priceOf,
    buy,
    expInfo,
    score,
  };

  root.MineCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
