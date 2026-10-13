/*
 * 지뢰 던전 — 화면, 입력, 연출
 * 규칙은 core.js가 맡고, 여기서는 core가 돌려준 이벤트를 시간 순서대로 보여 준다.
 */
(function () {
  'use strict';

  const C = window.MineCore;
  const SP = window.Sprites;
  const Sfx = window.Sfx;

  const SAVE_KEY = 'mine-dungeon:run';
  const BEST_KEY = 'mine-dungeon:best';
  const SET_KEY = 'mine-dungeon:settings';
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const LONG_PRESS_MS = 380;

  // ------------------------------------------------------------------ 저장소
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* 저장할 수 없는 환경이면 그냥 넘어간다 */
      }
    },
    del(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* 위와 같음 */
      }
    },
  };
  const settings = Object.assign({ muted: false, vibrate: true, helpSeen: false, tips: {} }, store.get(SET_KEY, {}));
  if (!settings.tips || typeof settings.tips !== 'object') settings.tips = {};
  const saveSettings = () => store.set(SET_KEY, settings);
  Sfx.setMuted(settings.muted);

  // ------------------------------------------------------------------ DOM
  const $ = (id) => document.getElementById(id);
  const dom = {
    title: $('title'),
    game: $('game'),
    board: $('board'),
    wrap: $('board-wrap'),
    fx: $('fx'),
    toast: $('toast'),
    floorTag: $('h-floor'),
    floorName: $('h-floor-name'),
    relics: $('h-relics'),
    gold: $('h-gold'),
    menu: $('h-menu'),
    hp: $('h-hp'),
    hpText: $('h-hp-text'),
    shield: $('h-shield'),
    shieldN: $('h-shield-n'),
    xp: $('h-xp'),
    lv: $('h-lv'),
    xpText: $('h-xp-text'),
    chips: $('h-chips'),
    items: $('items'),
    modeDig: $('m-dig'),
    modeMemo: $('m-memo'),
    belt: $('belt'),
    targetBar: $('target-bar'),
    targetIcon: $('target-icon'),
    targetText: $('target-text'),
    targetCancel: $('target-cancel'),
    picker: $('picker'),
    sheet: $('sheet'),
    panel: $('sheet-panel'),
    flash: $('flash'),
    canvas: $('particles'),
    tNew: $('t-new'),
    tContinue: $('t-continue'),
    tContinueInfo: $('t-continue-info'),
    tHelp: $('t-help'),
    tBest: $('t-best'),
    tSound: $('t-sound'),
    roster: $('roster'),
    embers: $('embers'),
  };

  // ------------------------------------------------------------------ 상태
  let run = null;
  let floor = null;
  let screen = 'title';
  let shown = []; // 화면에 열린 모습으로 보이는지 (연출 지연 때문에 core와 잠깐 다를 수 있다)
  let cellEls = [];
  const fxCls = new Map(); // 칸에 잠깐 붙는 연출 클래스 (flip, ready, hint)
  const ANIM_CLASS = { flipIn: 'flip', ready: 'ready', hint: 'hint', lit: 'lit' };
  const TOAST_STRIP = 40; // 판 위쪽에 알림이 뜰 자리
  let mode = 'dig';
  let armed = null; // 대상 칸이 필요한 아이템
  let confirmIdx = -1;
  let confirmTimer = 0;
  let cursor = -1;
  let locked = false;
  let pickerIdx = -1;
  let press = null;
  let sheetClosable = false;
  let sheetOnClose = null;
  let saveTimer = 0;
  let toastTimer = 0;
  const timers = new Set();

  function later(ms, fn) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, Math.max(0, ms));
    timers.add(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.clear();
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const monKey = (m) => C.MONSTERS[m].key;
  const monName = (m) => C.MONSTERS[m].name;
  const spr = (name, extra) => `<span class="sp spr-${name}${extra ? ' ' + extra : ''}"></span>`;
  function fmtTime(sec) {
    sec = Math.max(0, sec | 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }
  // 받침에 따라 '로/으로'
  function ro(word) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    if (code < 0 || code > 11171) return '로';
    const jong = code % 28;
    return jong === 0 || jong === 8 ? '로' : '으로';
  }
  // 받침에 따라 '을/를'
  function eul(word) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    if (code < 0 || code > 11171) return '을';
    return code % 28 === 0 ? '를' : '을';
  }
  function buzz(pattern) {
    if (!settings.vibrate || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* 진동을 막는 환경 */
    }
  }

  // ------------------------------------------------------------------ 질감
  function makeTextures() {
    const b = document.createElement('canvas');
    b.width = 128;
    b.height = 64;
    const g = b.getContext('2d');
    g.fillStyle = '#0d0912';
    g.fillRect(0, 0, 128, 64);
    const tones = ['#191220', '#1b1423', '#17111e', '#1d1626', '#1a1321'];
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 16 : 0;
      for (let x = -32; x < 160; x += 32) {
        g.fillStyle = tones[(Math.random() * tones.length) | 0];
        g.fillRect(x + off + 1, row * 16 + 1, 30, 14);
        g.fillStyle = 'rgba(255,255,255,0.025)';
        g.fillRect(x + off + 1, row * 16 + 1, 30, 1);
      }
    }
    for (let k = 0; k < 520; k++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.22)';
      g.fillRect((Math.random() * 128) | 0, (Math.random() * 64) | 0, 1, 1);
    }
    document.body.style.setProperty('--bricks', `url(${b.toDataURL()})`);

    const s = document.createElement('canvas');
    s.width = 64;
    s.height = 64;
    const h = s.getContext('2d');
    for (let k = 0; k < 460; k++) {
      h.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.13)';
      h.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, Math.random() < 0.2 ? 2 : 1, 1);
    }
    document.documentElement.style.setProperty('--grain', `url(${s.toDataURL()})`);
  }

  // ------------------------------------------------------------------ 파티클
  const Particles = (() => {
    const cv = dom.canvas;
    const ctx = cv.getContext('2d');
    let list = [];
    let raf = 0;
    let last = 0;
    let W = 0;
    let H = 0;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function add(p) {
      list.push(p);
      if (!raf) raf = requestAnimationFrame(step);
    }
    function step(ts) {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      ctx.clearRect(0, 0, W, H);
      for (let k = list.length - 1; k >= 0; k--) {
        const p = list[k];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(k, 1);
          continue;
        }
        p.vy += p.g * dt;
        const drag = Math.pow(p.drag, dt * 60);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = Math.min(1, p.life / p.fade);
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x - p.s / 2), Math.round(p.y - p.s / 2), p.s, p.s);
      }
      ctx.globalAlpha = 1;
      if (list.length) raf = requestAnimationFrame(step);
      else {
        raf = 0;
        last = 0;
        ctx.clearRect(0, 0, W, H);
      }
    }
    function burst(x, y, colors, n, o) {
      o = o || {};
      if (REDUCED) n = Math.ceil(n / 5);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (o.speed || 170) * (0.3 + Math.random() * 0.9);
        add({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (o.lift == null ? 70 : o.lift),
          g: o.g == null ? 460 : o.g,
          drag: o.drag || 0.985,
          life: (o.life || 0.75) * (0.55 + Math.random() * 0.6),
          fade: 0.35,
          s: (o.size || 3) + (Math.random() < 0.3 ? 1 : 0),
          c: colors[(Math.random() * colors.length) | 0],
        });
      }
    }
    function confetti() {
      const colors = ['#ffd25e', '#ff7a3d', '#63c7ff', '#6fdc7a', '#b07cff', '#ff4f64', '#efe4cc'];
      const n = REDUCED ? 30 : 180;
      for (let k = 0; k < n; k++) {
        add({
          x: Math.random() * W,
          y: -10 - Math.random() * H * 0.5,
          vx: (Math.random() - 0.5) * 70,
          vy: 50 + Math.random() * 120,
          g: 50,
          drag: 0.995,
          life: 3 + Math.random() * 2,
          fade: 0.8,
          s: 4 + ((Math.random() * 3) | 0),
          c: colors[(Math.random() * colors.length) | 0],
        });
      }
    }
    return { resize, burst, confetti };
  })();

  // ------------------------------------------------------------------ 판 만들기
  function buildBoard() {
    dom.board.textContent = '';
    dom.board.style.setProperty('--cols', floor.cols);
    cellEls = new Array(floor.cells.length);
    fxCls.clear();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < floor.cells.length; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      d.style.setProperty('--tx', ((i * 37) % 64) + 'px');
      d.style.setProperty('--ty', ((i * 23) % 64) + 'px');
      const sp = document.createElement('span');
      sp.className = 'sp';
      const nm = document.createElement('b');
      nm.className = 'nm';
      d.append(sp, nm);
      frag.appendChild(d);
      cellEls[i] = d;
    }
    dom.board.appendChild(frag);
    dom.board.classList.remove('enter');
    void dom.board.offsetWidth;
    if (!REDUCED) dom.board.classList.add('enter');
    layoutBoard();
    renderAll();
  }

  // 판 크기는 판 자리(wrap)가 아니라 화면에서 HUD와 벨트를 뺀 높이로 정한다.
  // wrap 크기에 기대면 좁은 화면에서 판 크기와 wrap 크기가 서로를 흔든다.
  function layoutBoard() {
    if (!floor || screen !== 'game') return;
    const W = dom.wrap.clientWidth;
    const H = dom.game.clientHeight - dom.game.querySelector('.hud').offsetHeight - dom.belt.offsetHeight - TOAST_STRIP;
    if (!W || !dom.game.clientHeight) return;
    const pad = 14;
    const fitW = (gap) => Math.floor((W - pad - gap * (floor.cols - 1)) / floor.cols);
    const fitH = (gap) => Math.floor((H - pad - gap * (floor.rows - 1)) / floor.rows);
    let gap = 3;
    let cell = Math.min(fitW(gap), fitH(gap));
    if (cell < 36) {
      gap = 2;
      cell = Math.min(fitW(gap), fitH(gap));
    }
    // 가로로 눕힌 폰처럼 높이가 모자라면, 칸을 누를 만한 크기로 두고 화면을 스크롤한다
    const cramped = cell < 24;
    if (cramped) cell = Math.min(fitW(gap), 32);
    dom.game.classList.toggle('cramped', cramped);
    cell = clamp(cell, 18, 56);
    dom.wrap.style.setProperty('--cell', cell + 'px');
    dom.wrap.style.setProperty('--gap', gap + 'px');
    dom.wrap.style.setProperty('--spr', Math.round(cell * 0.78) + 'px');
  }

  // 합이 커질수록 차가운 색에서 뜨거운 색으로
  const NUM_COLORS = ['', '#8fb7ff', '#78d8a6', '#c4df6c', '#f3d365', '#f6b257', '#f48f52', '#ee6e57', '#ea566e', '#dd5196', '#c95bcb', '#ad69f2', '#9580ff'];
  const numColor = (v) => NUM_COLORS[Math.min(v, NUM_COLORS.length - 1)];

  function renderCell(i) {
    const c = floor.cells[i];
    const d = cellEls[i];
    if (!d) return;
    const sp = d.firstChild;
    const nm = d.lastChild;
    let cls = 'cell';
    let sprite = '';
    let txt = '';
    if (c.open && shown[i]) {
      cls += ' open';
      if (c.m > 0) cls += ' slain';
      const v = C.aliveSum(floor, i);
      if (v > 0) {
        txt = String(v);
        d.style.setProperty('--nc', numColor(v));
        if (v >= 10) cls += ' n2';
      }
    } else {
      cls += ' hidden';
      if (c.known && c.m > 0) {
        cls += ' known';
        sprite = monKey(c.m);
        if (c.boss) cls += ' boss';
        if (floor.cleared) cls += ' fled';
        else cls += C.damageFor(run, floor, c.m, c.boss) === 0 ? ' ok' : ' danger';
      } else if (c.memo && !c.open) {
        cls += ' memo';
        if (c.memo === C.MEMO_Q) {
          cls += ' q';
          txt = '?';
        } else {
          sprite = monKey(c.memo);
          txt = String(c.memo);
          if (C.damageFor(run, floor, c.memo, false) === 0) cls += ' memo-ok';
        }
      }
    }
    const extra = fxCls.get(i);
    if (extra) for (const x of extra) cls += ' ' + x;
    if (i === cursor) cls += ' cur';
    if (i === confirmIdx) cls += ' confirm';
    if (i === pickerIdx) cls += ' picking';
    if (d.className !== cls) d.className = cls;
    const spCls = sprite ? 'sp spr-' + sprite : 'sp';
    if (sp.className !== spCls) sp.className = spCls;
    if (nm.textContent !== txt) nm.textContent = txt;
  }

  function renderAll() {
    if (!floor) return;
    for (let i = 0; i < floor.cells.length; i++) renderCell(i);
  }

  // ------------------------------------------------------------------ HUD
  function renderHud() {
    if (!run || !floor) return;
    const def = C.FLOORS[floor.fi];
    dom.floorTag.textContent = 'B' + (floor.fi + 1);
    dom.floorName.textContent = def.name;
    dom.gold.textContent = run.gold;
    dom.hp.querySelector('.bar i').style.setProperty('--p', clamp(run.hp / run.maxHp, 0, 1));
    dom.hpText.textContent = `${run.hp}/${run.maxHp}`;
    dom.hp.classList.toggle('low', run.hp > 0 && run.hp <= Math.max(3, Math.floor(run.maxHp * 0.3)));
    dom.shield.hidden = run.shields <= 0;
    dom.shieldN.textContent = run.shields;

    const x = C.expInfo(floor);
    dom.lv.textContent = x.level;
    const bar = dom.xp.querySelector('.bar i');
    if (x.max) {
      bar.style.setProperty('--p', 1);
      dom.xpText.textContent = 'MAX';
    } else {
      bar.style.setProperty('--p', clamp((x.exp - x.prev) / (x.next - x.prev), 0, 1));
      dom.xpText.textContent = `${x.exp}/${x.next}`;
    }

    const relicHtml = run.relics.map((k) => spr(SP.RELIC_SPRITE[k])).join('');
    if (dom.relics.dataset.sig !== run.relics.join()) {
      dom.relics.innerHTML = relicHtml;
      dom.relics.dataset.sig = run.relics.join();
    }
    renderChips();
  }

  function renderChips() {
    const def = C.FLOORS[floor.fi];
    const levels = def.counts.length + (def.boss ? 1 : 0);
    if (dom.chips.childElementCount !== levels || dom.chips.dataset.fi !== String(floor.fi)) {
      dom.chips.dataset.fi = floor.fi;
      let html = '';
      for (let lv = 1; lv <= levels; lv++) {
        html += `<div class="chip" data-lv="${lv}">${spr(monKey(lv))}<b class="cnt"></b><span class="tag"><span class="long"></span><span class="short"></span></span></div>`;
      }
      dom.chips.innerHTML = html;
      dom.chips.classList.toggle('many', levels >= 5);
    }
    for (let lv = 1; lv <= levels; lv++) {
      const chip = dom.chips.children[lv - 1];
      const boss = lv === C.BOSS_LEVEL;
      const left = floor.left[lv] || 0;
      const dmg = C.damageFor(run, floor, lv, boss);
      const cls = 'chip' + (left === 0 ? ' done' : dmg === 0 ? ' safe' : ' risky') + (boss ? ' boss' : '') + (chip.classList.contains('pulse') ? ' pulse' : '');
      if (chip.className !== cls) chip.className = cls;
      chip.querySelector('.cnt').textContent = '×' + left;
      chip.querySelector('.long').textContent = left === 0 ? '전멸' : dmg === 0 ? '안전' : '피해 ' + dmg;
      chip.querySelector('.short').textContent = left === 0 ? '전멸' : dmg === 0 ? '안전' : '-' + dmg;
      chip.title = `LV${lv} ${monName(lv)} · 남은 수 ${left} · ${dmg ? '받을 피해 ' + dmg : '피해 없이 처치'}`;
    }
  }

  function renderBelt() {
    if (!run) return;
    for (const b of dom.items.querySelectorAll('[data-item]')) {
      const key = b.dataset.item;
      const n = run.items[key] || 0;
      b.querySelector('.cnt').textContent = n;
      b.disabled = n <= 0;
      b.classList.toggle('armed', armed === key);
    }
    dom.modeDig.setAttribute('aria-pressed', String(mode === 'dig'));
    dom.modeMemo.setAttribute('aria-pressed', String(mode === 'memo'));
  }

  function pulseCell(i, cls) {
    const el = cellEls[i];
    if (!el) return;
    let set = fxCls.get(i);
    if (!set) fxCls.set(i, (set = new Set()));
    if (set.has(cls)) {
      el.classList.remove(cls);
      void el.offsetWidth;
    }
    set.add(cls);
    el.classList.add(cls);
  }

  function bump(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // ------------------------------------------------------------------ 연출 도우미
  function cellRect(i) {
    return cellEls[i] ? cellEls[i].getBoundingClientRect() : null;
  }
  function local(i) {
    const r = cellRect(i);
    if (!r) return null;
    const w = dom.fx.getBoundingClientRect();
    return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
  }
  function autoRemove(node, ms) {
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), ms);
  }
  function floater(i, text, cls, dy) {
    const p = local(i);
    if (!p) return;
    const f = document.createElement('div');
    f.className = 'floater ' + (cls || '');
    f.textContent = text;
    f.style.left = p.x + 'px';
    f.style.top = p.y - (dy || 0) + 'px';
    dom.fx.appendChild(f);
    autoRemove(f, 1600);
  }
  function spritePop(i, key, cls) {
    const p = local(i);
    if (!p) return;
    const f = document.createElement('div');
    f.className = `pop spr-${key} ${cls || ''}`;
    f.style.left = p.x + 'px';
    f.style.top = p.y + 'px';
    dom.fx.appendChild(f);
    autoRemove(f, 2000);
  }
  function slashAt(i) {
    const p = local(i);
    if (!p) return;
    const f = document.createElement('div');
    f.className = 'slash';
    f.style.left = p.x + 'px';
    f.style.top = p.y + 'px';
    dom.fx.appendChild(f);
    autoRemove(f, 600);
  }
  function burstAt(i, colors, n, o) {
    const r = cellRect(i);
    if (!r) return;
    Particles.burst(r.left + r.width / 2, r.top + r.height / 2, colors, n, o);
  }
  function burstEl(el, colors, n, o) {
    const r = el.getBoundingClientRect();
    Particles.burst(r.left + r.width / 2, r.top + r.height / 2, colors, n, o);
  }
  function banner(big, small, cls) {
    dom.fx.querySelectorAll('.banner').forEach((b) => b.remove());
    const b = document.createElement('div');
    b.className = 'banner ' + (cls || '');
    b.innerHTML = `<div class="big"></div>${small ? '<div class="small"></div>' : ''}`;
    b.firstChild.textContent = big;
    if (small) b.lastChild.textContent = small;
    dom.fx.appendChild(b);
    autoRemove(b, 3000);
  }
  function shake(amp) {
    if (REDUCED) return;
    dom.game.style.setProperty('--amp', amp + 'px');
    bump(dom.game, 'shake');
    later(450, () => dom.game.classList.remove('shake'));
  }
  function flash(kind) {
    dom.flash.className = 'screen-flash';
    void dom.flash.offsetWidth;
    dom.flash.className = 'screen-flash ' + kind;
  }
  function toast(msg, kind, ms) {
    dom.toast.textContent = msg;
    dom.toast.className = 'toast on' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('on'), ms || 2600);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    dom.toast.classList.remove('on');
  }
  function tip(key, msg, delay) {
    if (settings.tips[key]) return;
    settings.tips[key] = 1;
    saveSettings();
    later(delay == null ? 450 : delay, () => toast(msg, 'tip', 5200));
  }

  // ------------------------------------------------------------------ 이벤트 재생
  function play(events) {
    let t = 0;
    const at = {};
    let opened = false;
    for (const e of events) {
      switch (e.t) {
        case 'open': {
          let maxD = 0;
          for (const c of e.cells) if (c.d > maxD) maxD = c.d;
          const step = REDUCED ? 0 : e.sweep ? clamp(900 / (maxD + 1), 18, 60) : clamp(520 / (maxD + 1), 14, 34);
          const base = t;
          for (const c of e.cells) {
            const when = base + c.d * step;
            at[c.i] = when;
            later(when, () => showCell(c.i));
          }
          for (let d = 0; d <= Math.min(maxD, 16); d++) later(base + d * step, () => Sfx.tick(d));
          if (!e.sweep) opened = true;
          t = base + Math.min(240, (maxD + 1) * step * 0.5);
          break;
        }
        case 'chest':
          later((at[e.i] != null ? at[e.i] : t) + 140, () => fxChest(e));
          break;
        case 'strike':
          later(t, () => fxStrike(e));
          t += e.boss ? 240 : 100;
          break;
        case 'block':
          later(t, () => fxBlock(e));
          t += 160;
          break;
        case 'hurt':
          later(t, () => fxHurt(e));
          t += 220;
          break;
        case 'revive':
          later(t, () => fxRevive(e));
          t += 520;
          break;
        case 'kill':
          later(t, () => fxKill(e));
          t += e.boss ? 750 : 130;
          break;
        case 'heal':
          later(t, () => fxHeal(e));
          break;
        case 'levelup':
          later(t + 60, () => fxLevelUp(e));
          t += 380;
          break;
        case 'death':
          locked = true;
          later(t, () => fxDeath(e));
          break;
        case 'clear':
          locked = true;
          later(t + 320, () => fxClear(e));
          break;
        case 'scry':
          later(t, () => fxScry(e));
          t += 140;
          break;
        case 'torch':
          later(t, () => fxLight(e.cells, 'torch'));
          break;
        case 'eye':
          later(t + 260, () => fxLight(e.cells, 'eye'));
          break;
        case 'boom':
          later(t, () => fxBoom(e));
          t += 260;
          break;
        case 'immune':
          later(t + 80, () => floater(e.i, '꿈쩍도 안 해요', 'info'));
          break;
        case 'gift':
          later(t + 1300, () => toast(`${C.RELICS[e.from].name} 덕분에 ${C.ITEMS[e.key].name}${eul(C.ITEMS[e.key].name)} 하나 얻었어요.`));
          break;
        case 'chord-fail':
          fxChordFail(e);
          break;
        case 'sweep':
          fxSweep(e);
          t += 60;
          break;
        case 'fail':
          fxFail(e);
          break;
        default:
          break;
      }
    }
    if (opened) Sfx.dig();
  }

  function showCell(i) {
    if (!floor || !cellEls[i]) return;
    shown[i] = true;
    renderCell(i);
    if (!REDUCED) pulseCell(i, 'flip');
  }

  function fxStrike(e) {
    Sfx.strike();
    slashAt(e.i);
  }

  function fxKill(e) {
    shown[e.i] = true;
    renderCell(e.i);
    const key = monKey(e.m);
    spritePop(e.i, key, e.boss ? 'boss' : '');
    burstAt(e.i, SP.colors(key), e.boss ? 120 : 14 + e.m * 5, e.boss ? { speed: 320, life: 1.3 } : null);
    if (e.boss) {
      flash('white');
      shake(16);
      Sfx.bossDown();
      buzz([60, 40, 200]);
    } else if (e.by === 'bomb') {
      Sfx.kill(e.m);
    } else {
      Sfx.kill(e.m);
    }
    floater(e.i, `+${e.xp} EXP`, 'xp');
    later(150, () => {
      floater(e.i, `+${e.gold}G`, 'gold', 16);
      Sfx.coin();
      bump(dom.gold.parentElement, 'bump');
    });
    renderHud();
    const chip = dom.chips.children[e.m - 1];
    if (chip && floor.left[e.m] === 0) bump(chip, 'pulse');
  }

  function fxHurt(e) {
    spritePop(e.i, monKey(e.m), 'lunge');
    Sfx.hurt(e.dmg);
    shake(Math.min(14, 4 + e.dmg));
    flash('hurt');
    floater(e.i, `-${e.dmg}`, 'dmg', 6);
    buzz([30, 40, 70]);
    bump(dom.hp, 'hit');
    burstEl(dom.hp.querySelector('.sp'), ['#ff4f64', '#b8293f', '#ffc0c8'], 10, { speed: 120 });
    renderHud();
    tip('hurt', '나보다 강한 마물은 피해를 줘요. 위쪽 마물 칩에서 레벨별 피해를 확인하세요.', 700);
  }

  function fxBlock(e) {
    spritePop(e.i, monKey(e.m), 'lunge');
    Sfx.block();
    floater(e.i, '방패로 막음!', 'block', 6);
    burstAt(e.i, ['#cdd5e2', '#ffffff', '#7d879a'], 18, { speed: 200 });
    renderHud();
  }

  function fxRevive() {
    Sfx.revive();
    flash('gold');
    banner('REVIVE', '불사조 깃털이 타올랐어요', 'floor');
    burstEl(dom.hp, ['#ffb347', '#ff5a3c', '#ffe08a'], 50, { speed: 260 });
    renderHud();
  }

  function fxHeal(e) {
    Sfx.heal();
    const icon = dom.hp.querySelector('.sp');
    burstEl(icon, ['#6fdc7a', '#c8f7b0', '#ffffff'], 12, { speed: 110, g: -60, lift: 40 });
    bump(dom.hp, 'bump');
    if (e.from === 'fang' && e.i != null) floater(e.i, '+1 HP', 'heal', 30);
    renderHud();
  }

  function fxLevelUp(e) {
    Sfx.levelup();
    flash('gold');
    banner('LEVEL UP!', `LV ${e.level}`, '');
    bump(dom.xp, 'up');
    burstEl(dom.lv, ['#ffd25e', '#fff3b8', '#63c7ff'], 30, { speed: 210 });
    if (e.heal) later(200, () => fxHeal({ amount: e.heal, from: 'level' }));
    renderAll();
    renderHud();
    // 이제 안전해진 메모/드러난 마물을 짚어 준다
    floor.cells.forEach((c, i) => {
      if (c.open) return;
      const lv = c.known ? c.m : c.memo > 0 && c.memo !== C.MEMO_Q ? c.memo : 0;
      if (lv && !c.boss && C.damageFor(run, floor, lv, false) === 0) pulseCell(i, 'ready');
    });
    tip('levelup', `이제 LV${e.level} 이하 마물은 피해 없이 잡아요. 숫자가 ${e.level} 이하인 칸 주변도 모두 안전해요.`, 1300);
  }

  const LOOT_COLORS = { gold: ['#ffd25e', '#fff3b8', '#c48a1e'], potion: ['#ff4f6d', '#ffc2cf', '#d8e6f2'], crystal: ['#59a8ff', '#e4f3ff', '#9bd6ff'], torch: ['#ff5a2a', '#ffa53a', '#ffe27a'], bomb: ['#aab1da', '#ffe066', '#ff6a3d'], shield: ['#cdd5e2', '#ffffff', '#d9434b'] };
  function lootName(l) {
    if (l.kind === 'gold') return `${l.amount}G`;
    if (l.kind === 'shield') return C.SHIELD.name;
    return C.ITEMS[l.key].name;
  }
  function fxChest(e) {
    Sfx.chest();
    spritePop(e.i, 'chest', '');
    const key = e.loot.kind === 'item' ? e.loot.key : e.loot.kind;
    burstAt(e.i, LOOT_COLORS[key] || LOOT_COLORS.gold, 26, { speed: 190 });
    floater(e.i, e.loot.kind === 'gold' ? `+${e.loot.amount}G` : lootName(e.loot), e.loot.kind === 'gold' ? 'gold' : 'info', 14);
    if (e.loot.kind !== 'gold') toast(`보물상자에서 ${lootName(e.loot)}${eul(lootName(e.loot))} 찾았어요.`);
    if (e.loot.kind === 'item') bump(dom.items.querySelector(`[data-item="${e.loot.key}"]`), 'got');
    renderHud();
    renderBelt();
  }

  function fxScry(e) {
    Sfx.magic();
    burstAt(e.i, ['#59a8ff', '#e4f3ff', '#9bd6ff'], 24, { speed: 150, g: -40 });
    if (e.m) {
      floater(e.i, `LV${e.m} ${monName(e.m)}`, 'info', 4);
      renderCell(e.i);
    } else floater(e.i, '안전한 칸', 'info', 4);
  }

  function fxLight(list, kind) {
    Sfx.magic();
    const colors = kind === 'torch' ? ['#ff5a2a', '#ffa53a', '#ffe27a'] : ['#b07cff', '#f1ecf7', '#ffffff'];
    list.forEach((i, k) =>
      later(k * 120, () => {
        burstAt(i, colors, 18, { speed: 140, g: -50 });
        renderCell(i);
        pulseCell(i, 'lit');
      })
    );
    if (kind === 'torch') toast(`횃불이 가장 약한 마물 ${list.length}마리를 비췄어요.`);
    else toast(`예언자의 눈: 가장 강한 마물 ${list.length}마리가 보여요.`);
  }

  function fxBoom(e) {
    Sfx.boom();
    shake(12);
    flash('boom');
    buzz([50, 30, 80]);
    e.area.forEach((i) => burstAt(i, ['#ff7a3d', '#ffd25e', '#4f5576', '#aab1da'], 12, { speed: 240 }));
  }

  function fxDeath(e) {
    store.del(SAVE_KEY);
    dom.game.classList.add('dying');
    Sfx.death();
    buzz([80, 60, 200]);
    spritePop(e.i, monKey(e.m), 'killer');
    renderAll();
    renderHud();
    later(1900, () => showEnd(false));
  }

  function fxClear(e) {
    renderAll();
    renderHud();
    if (e.won) {
      store.del(SAVE_KEY);
      Sfx.victory();
      Particles.confetti();
      banner('VICTORY!', '심연의 리치를 쓰러뜨렸어요', 'win long');
      later(2600, () => showEnd(true));
    } else {
      Sfx.clear();
      if (!REDUCED) Particles.confetti();
      banner(`B${e.fi + 1} CLEAR`, `${C.FLOORS[e.fi].name} 정복!`, 'long');
      later(2000, () => openCamp());
    }
  }

  function fxSweep(e) {
    Sfx.sweep();
    burstAt(e.i, ['#ffd25e', '#fff3b8', '#f2a646'], 14, { speed: 150, g: 0, lift: 0 });
    e.cells.forEach((j) => pulseCell(j, 'hint'));
    tip('sweep', '숫자가 내 레벨 이하일 때는 그 숫자를 눌러 주변을 한 번에 열 수 있어요.', 900);
  }

  function fxChordFail(e) {
    C.neighbors(floor, e.i).forEach((j) => {
      if (!floor.cells[j].open) pulseCell(j, 'hint');
    });
    if (e.reason === 'sum') {
      Sfx.deny();
      toast(`주변 메모의 합(${e.sum})이 숫자(${e.v})와 달라요.`, 'warn');
    } else if (e.reason === 'q') {
      Sfx.deny();
      toast("'?' 메모가 있으면 한 번에 열 수 없어요.", 'warn');
    }
  }

  const FAIL_TEXT = {
    empty: '그 아이템이 없어요.',
    full: '체력이 이미 가득해요.',
    ungenerated: '먼저 칸을 하나 파 보세요.',
    target: '숨은 칸을 골라 주세요.',
    none: '비출 마물이 남지 않았어요.',
    busy: '지금은 쓸 수 없어요.',
  };
  function fxFail(e) {
    Sfx.deny();
    toast(FAIL_TEXT[e.reason] || '지금은 할 수 없어요.', 'warn');
  }

  // ------------------------------------------------------------------ 행동
  function act(events) {
    if (!events || !events.length) return;
    play(events);
    renderAll();
    renderHud();
    renderBelt();
    if (run.dead || run.won) store.del(SAVE_KEY);
    else saveSoon();
    onboarding(events);
  }

  function onboarding(events) {
    if (!floor || run.dead || floor.cleared) return;
    if (events.some((e) => e.t === 'open') && floor.fi === 0) {
      tip('sum', '숫자는 주변 8칸에 숨은 마물 레벨의 합이에요. 숫자가 내 레벨 이하면 주변이 모두 안전하니, 그 숫자를 눌러 한 번에 열어 보세요.', 700);
    }
    if (events.some((e) => e.t === 'kill')) {
      // 피해 없이 잡을 마물이 남지 않았는데 아직 레벨을 더 올려야 할 때
      const x = C.expInfo(floor);
      if (!x.max) {
        let safeLeft = 0;
        for (let lv = 1; lv < floor.left.length; lv++) if (C.damageFor(run, floor, lv, lv === C.BOSS_LEVEL) === 0) safeLeft += floor.left[lv];
        if (safeLeft === 0) tip('fight', '피해 없이 잡을 마물이 남지 않았어요. 레벨을 올리려면 한 단계 강한 마물과 싸워야 해요.', 1200);
      }
    }
  }

  function tap(i) {
    if (locked || !floor || !run || run.dead || floor.cleared) return;
    const c = floor.cells[i];
    if (!c) return;
    if (armed) {
      useArmed(i);
      return;
    }
    if (c.open) {
      if (shown[i]) act(C.chord(run, floor, i));
      return;
    }
    if (mode === 'memo' && !c.known) {
      openPicker(i);
      return;
    }
    const lv = c.known ? c.m : c.memo > 0 && c.memo !== C.MEMO_Q ? c.memo : 0;
    const risk = lv ? C.damageFor(run, floor, lv, c.known && c.boss) : 0;
    const unsure = !c.known && c.memo === C.MEMO_Q;
    if ((risk > 0 || unsure) && confirmIdx !== i) {
      askConfirm(i, lv, risk, c);
      return;
    }
    clearConfirm();
    act(C.reveal(run, floor, i));
  }

  function askConfirm(i, lv, risk, c) {
    clearConfirm();
    confirmIdx = i;
    renderCell(i);
    Sfx.memo();
    if (lv) {
      const who = `LV${lv} ${monName(lv)}`;
      const sure = c.known ? '' : '(메모) ';
      const deadly = risk >= run.hp && !(run.shields > 0);
      toast(`${sure}${who} · 받을 피해 ${risk}${deadly ? ', 쓰러질 수 있어요!' : '.'} 한 번 더 누르면 공격해요.`, 'warn', 2600);
    } else {
      toast('확신이 없는 칸이에요. 한 번 더 누르면 열어요.', 'warn', 2600);
    }
    confirmTimer = setTimeout(clearConfirm, 2600);
  }
  function clearConfirm() {
    clearTimeout(confirmTimer);
    if (confirmIdx < 0) return;
    const i = confirmIdx;
    confirmIdx = -1;
    if (floor && cellEls[i]) renderCell(i);
  }

  // ------------------------------------------------------------------ 메모
  function openPicker(i) {
    const c = floor.cells[i];
    if (!c || c.open) return;
    if (c.known) {
      const d = C.damageFor(run, floor, c.m, c.boss);
      toast(`LV${c.m} ${monName(c.m)} · ${d ? '받을 피해 ' + d : '피해 없이 처치할 수 있어요'}`);
      return;
    }
    clearConfirm();
    closePicker();
    pickerIdx = i;
    const maxLv = C.FLOORS[floor.fi].counts.length;
    let html = '';
    for (let lv = 1; lv <= maxLv; lv++) {
      html += `<button type="button" data-v="${lv}" class="${c.memo === lv ? 'on' : ''}" aria-label="LV${lv} ${monName(lv)}">${spr(monKey(lv))}${lv}</button>`;
    }
    html += `<button type="button" data-v="${C.MEMO_Q}" class="q${c.memo === C.MEMO_Q ? ' on' : ''}" aria-label="확실하지 않음">?</button>`;
    html += `<button type="button" data-v="0" class="x" aria-label="메모 지우기">✕</button>`;
    dom.picker.innerHTML = html;
    dom.picker.hidden = false;
    const r = cellEls[i].getBoundingClientRect();
    const pw = dom.picker.offsetWidth;
    const ph = dom.picker.offsetHeight;
    const x = clamp(r.left + r.width / 2 - pw / 2, 8, window.innerWidth - pw - 8);
    let y = r.top - ph - 10;
    if (y < 8) y = r.bottom + 10;
    dom.picker.style.left = x + 'px';
    dom.picker.style.top = y + 'px';
    renderCell(i);
    Sfx.memo();
    buzz(12);
  }
  function closePicker() {
    if (pickerIdx < 0) return;
    const i = pickerIdx;
    pickerIdx = -1;
    dom.picker.hidden = true;
    dom.picker.innerHTML = '';
    if (floor && cellEls[i]) renderCell(i);
  }
  function setMemo(i, v) {
    if (!floor || floor.cleared || run.dead) return;
    const c = floor.cells[i];
    if (!c || c.open || c.known) return;
    if (v === c.memo) v = 0;
    C.setMemo(floor, i, v);
    renderCell(i);
    Sfx.memo();
    saveSoon();
    if (v && v !== C.MEMO_Q) tip('memo', '숫자 칸을 누르면, 주변 메모 합이 숫자와 같을 때 나머지 칸을 한 번에 열어요.', 300);
  }

  // ------------------------------------------------------------------ 아이템
  function setArmed(key) {
    armed = key;
    clearConfirm();
    closePicker();
    dom.board.classList.toggle('targeting', !!key);
    dom.belt.classList.toggle('targeting', !!key);
    dom.targetBar.hidden = !key;
    if (key) {
      dom.targetIcon.className = 'sp spr-' + key;
      dom.targetText.textContent = key === 'crystal' ? '정체를 확인할 숨은 칸을 누르세요.' : '폭탄을 던질 곳을 누르세요. 3×3이 터져요.';
    }
    renderBelt();
  }
  function useArmed(i) {
    const key = armed;
    const ev = C.useItem(run, floor, key, i);
    if (ev.length === 1 && ev[0].t === 'fail') {
      fxFail(ev[0]);
      if (ev[0].reason !== 'target') setArmed(null);
      return;
    }
    setArmed(null);
    act(ev);
  }

  // ------------------------------------------------------------------ 커서 (키보드)
  function setCursor(i) {
    if (i === cursor) return;
    const old = cursor;
    cursor = i;
    if (floor && old >= 0 && cellEls[old]) renderCell(old);
    if (floor && i >= 0 && cellEls[i]) renderCell(i);
  }
  function moveCursor(key) {
    if (!floor) return;
    if (cursor < 0) {
      setCursor(Math.floor(floor.rows / 2) * floor.cols + Math.floor(floor.cols / 2));
      return;
    }
    let x = cursor % floor.cols;
    let y = Math.floor(cursor / floor.cols);
    if (key === 'ArrowLeft') x = Math.max(0, x - 1);
    if (key === 'ArrowRight') x = Math.min(floor.cols - 1, x + 1);
    if (key === 'ArrowUp') y = Math.max(0, y - 1);
    if (key === 'ArrowDown') y = Math.min(floor.rows - 1, y + 1);
    setCursor(y * floor.cols + x);
  }

  // ------------------------------------------------------------------ 입력
  function cellIndex(target) {
    const el = target && target.closest ? target.closest('.cell') : null;
    return el && dom.board.contains(el) ? +el.dataset.i : -1;
  }
  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press = null;
  }

  dom.board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    Sfx.unlock();
    const i = cellIndex(e.target);
    if (i < 0) return;
    cancelPress();
    const p = { i, x: e.clientX, y: e.clientY, id: e.pointerId, fired: false, timer: 0 };
    p.timer = setTimeout(() => {
      if (press !== p) return;
      p.fired = true;
      if (!locked && floor && !floor.cleared && !run.dead && !armed) openPicker(p.i);
    }, LONG_PRESS_MS);
    press = p;
  });
  dom.board.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const i = cellIndex(e.target);
      if (i >= 0) setCursor(i);
    }
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) cancelPress();
  });
  dom.board.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    cancelPress();
    if (!p.fired) tap(p.i);
  });
  dom.board.addEventListener('pointercancel', cancelPress);
  dom.board.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') {
      cancelPress();
      setCursor(-1);
    }
  });
  dom.board.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const i = cellIndex(e.target);
    if (i < 0 || (press && press.fired) || pickerIdx === i) return;
    if (locked || !floor || floor.cleared || run.dead) return;
    if (armed) {
      setArmed(null);
      return;
    }
    openPicker(i);
  });
  dom.board.addEventListener('animationend', (e) => {
    const cls = ANIM_CLASS[e.animationName];
    const el = e.target;
    if (!cls || !el.classList || !el.classList.contains('cell')) return;
    const i = +el.dataset.i;
    const set = fxCls.get(i);
    if (set) {
      set.delete(cls);
      if (!set.size) fxCls.delete(i);
    }
    el.classList.remove(cls);
  });

  // 메모 창 밖을 누르면 닫는다 (그 누름은 판에 전달하지 않는다)
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (pickerIdx < 0 || dom.picker.contains(e.target)) return;
      closePicker();
      if (dom.board.contains(e.target)) e.stopPropagation();
    },
    true
  );
  dom.picker.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || pickerIdx < 0) return;
    const i = pickerIdx;
    closePicker();
    setMemo(i, +b.dataset.v);
  });

  dom.items.addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]');
    if (!b || !run || !floor || locked) return;
    Sfx.unlock();
    const key = b.dataset.item;
    if (armed === key) {
      setArmed(null);
      Sfx.ui();
      return;
    }
    if (C.ITEMS[key].target) {
      if (!(run.items[key] > 0)) return;
      if (floor.cleared || run.dead) return;
      if (!floor.generated) {
        fxFail({ reason: 'ungenerated' });
        return;
      }
      setArmed(key);
      Sfx.ui();
      return;
    }
    setArmed(null);
    act(C.useItem(run, floor, key));
  });
  // 팁은 눌러서 바로 닫을 수 있다 (경고 문구는 아래 칸을 다시 눌러야 하니 터치를 통과시킨다)
  dom.toast.addEventListener('click', () => {
    if (dom.toast.classList.contains('tip')) hideToast();
  });
  dom.targetCancel.addEventListener('click', () => {
    setArmed(null);
    Sfx.ui();
  });

  function setMode(m) {
    mode = m;
    closePicker();
    renderBelt();
    Sfx.ui();
    if (m === 'memo') tip('memo-mode', '메모 모드에서는 칸을 누르면 예상 레벨을 적어요. 길게 눌러도 메모할 수 있어요.', 100);
  }
  dom.modeDig.addEventListener('click', () => setMode('dig'));
  dom.modeMemo.addEventListener('click', () => setMode('memo'));
  dom.menu.addEventListener('click', () => {
    Sfx.unlock();
    openMenu();
  });
  dom.relics.addEventListener('click', () => openMenu());

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') {
      if (pickerIdx >= 0) closePicker();
      else if (armed) setArmed(null);
      else if (!dom.sheet.hidden) {
        if (sheetClosable) closeSheet();
      } else if (screen === 'game' && !locked) openMenu();
      return;
    }
    if (screen !== 'game' || !dom.sheet.hidden || !floor) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (k.indexOf('Arrow') === 0) {
      e.preventDefault();
      closePicker();
      moveCursor(k);
      return;
    }
    if (k === 'm' || k === 'M') {
      setMode(mode === 'dig' ? 'memo' : 'dig');
      return;
    }
    const target = pickerIdx >= 0 ? pickerIdx : cursor;
    if (target < 0) return;
    if (k === 'Enter' || k === ' ') {
      if (e.target && e.target.tagName === 'BUTTON' && e.target !== dom.board) return;
      e.preventDefault();
      Sfx.unlock();
      closePicker();
      tap(target);
      return;
    }
    const maxLv = C.FLOORS[floor.fi].counts.length;
    if (/^[1-6]$/.test(k) && +k <= maxLv) {
      closePicker();
      setMemo(target, +k);
    } else if (k === '0' || k === 'Backspace' || k === 'Delete') {
      closePicker();
      setMemo(target, 0);
    } else if (k === '?' || k === '/' || k === 'q' || k === 'Q') {
      closePicker();
      setMemo(target, C.MEMO_Q);
    }
  });

  // ------------------------------------------------------------------ 시트
  function openSheet(html, opts) {
    opts = opts || {};
    closePicker();
    hideToast();
    const keepScroll = opts.keepScroll ? dom.panel.scrollTop : 0;
    dom.panel.innerHTML = html;
    dom.sheet.hidden = false;
    sheetClosable = !!opts.closable;
    sheetOnClose = opts.onClose || null;
    dom.panel.scrollTop = keepScroll;
    if (!opts.keepScroll) {
      dom.panel.style.animation = 'none';
      void dom.panel.offsetWidth;
      dom.panel.style.animation = '';
      const first = dom.panel.querySelector('[data-focus]') || dom.panel.querySelector('button:not([disabled])');
      if (first) first.focus({ preventScroll: true });
    }
  }
  function closeSheet() {
    if (dom.sheet.hidden) return;
    dom.sheet.hidden = true;
    dom.panel.innerHTML = '';
    const cb = sheetOnClose;
    sheetOnClose = null;
    if (cb) cb();
  }
  dom.sheet.addEventListener('click', (e) => {
    if (e.target === dom.sheet) {
      if (sheetClosable) closeSheet();
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    Sfx.unlock();
    onSheetAction(b.dataset.act, b);
  });

  function onSheetAction(act, b) {
    switch (act) {
      case 'close':
      case 'resume':
        Sfx.ui();
        closeSheet();
        break;
      case 'help':
        Sfx.ui();
        openHelp(screen === 'game' ? openMenu : null);
        break;
      case 'sound':
        settings.muted = !settings.muted;
        Sfx.setMuted(settings.muted);
        saveSettings();
        Sfx.ui();
        openMenu(true);
        break;
      case 'vibrate':
        settings.vibrate = !settings.vibrate;
        saveSettings();
        buzz(30);
        Sfx.ui();
        openMenu(true);
        break;
      case 'quit':
        Sfx.ui();
        b.parentElement.innerHTML =
          '<p>지금 포기하면 이번 모험은 기록에 남지 않아요.</p><button type="button" class="btn bad" data-act="quit-yes">포기하기</button><button type="button" class="btn ghost" data-act="resume">계속 싸우기</button>';
        break;
      case 'quit-yes':
        store.del(SAVE_KEY);
        run = null;
        floor = null;
        closeSheet();
        showTitle();
        break;
      case 'relic':
        if (C.pickRelic(run, floor, b.dataset.key)) {
          Sfx.chest();
          burstEl(b, SP.colors(SP.RELIC_SPRITE[b.dataset.key]), 30, { speed: 200 });
          saveNow();
          renderHud();
          renderCamp(true);
        }
        break;
      case 'buy':
        if (C.buy(run, b.dataset.key)) {
          Sfx.coin();
          burstEl(b, ['#ffd25e', '#fff3b8'], 12, { speed: 140 });
          saveNow();
          renderHud();
          renderBelt();
          renderCamp(true);
        } else Sfx.deny();
        break;
      case 'drink': {
        const ev = C.useItem(run, floor, 'potion');
        if (ev.length && ev[0].t === 'heal') {
          Sfx.heal();
          saveNow();
          renderHud();
          renderBelt();
          renderCamp(true);
        }
        break;
      }
      case 'descend':
        descend();
        break;
      case 'again':
        closeSheet();
        newGame();
        break;
      case 'title':
        closeSheet();
        run = null;
        floor = null;
        showTitle();
        break;
      default:
        break;
    }
  }

  function openMenu(keepScroll) {
    if (!run || !floor || locked) return;
    clearConfirm();
    setArmed(null);
    const relics = run.relics
      .map((k) => {
        const spent = k === 'feather' && run.featherUsed ? ' (이미 썼어요)' : '';
        return `<li>${spr(SP.RELIC_SPRITE[k])}<div><b>${C.RELICS[k].name}${spent}</b><p>${C.RELICS[k].desc}</p></div></li>`;
      })
      .join('');
    openSheet(
      `<p class="eyebrow">B${floor.fi + 1} · ${fmtTime(run.stats.time)}</p>
      <h2>잠시 쉬는 중</h2>
      <div class="menu-list">
        <button type="button" class="btn primary" data-act="resume" data-focus>계속하기</button>
        <button type="button" class="btn" data-act="help">플레이 방법</button>
        <div class="toggles">
          <button type="button" class="toggle" data-act="sound" aria-pressed="${!settings.muted}">효과음<b>${settings.muted ? '꺼짐' : '켜짐'}</b></button>
          <button type="button" class="toggle" data-act="vibrate" aria-pressed="${settings.vibrate}">진동<b>${settings.vibrate ? '켜짐' : '꺼짐'}</b></button>
        </div>
      </div>
      <h3>가진 유물</h3>
      ${relics ? `<ul class="relic-list">${relics}</ul>` : '<p class="muted">아직 없어요. 층을 정복하면 야영지에서 하나씩 고를 수 있어요.</p>'}
      <div class="danger-zone"><button type="button" class="btn ghost" data-act="quit">모험 포기</button></div>`,
      { closable: true, keepScroll }
    );
  }

  function openHelp(onClose) {
    const L = floor && run && !floor.cleared ? floor.level : 1;
    const fakeRun = run || { relics: [] };
    const fakeFloor = { level: L };
    const beasts = [1, 2, 3, 4, 5, 6]
      .map((m) => {
        const d = C.damageFor(fakeRun, fakeFloor, m, m === C.BOSS_LEVEL);
        return `<div class="beast">${spr(monKey(m))}<span><small>LV${m}</small>${monName(m)}</span><b class="${d ? 'risky' : 'safe'}">${d ? '피해 ' + d : '안전'}</b></div>`;
      })
      .join('');
    const demo =
      '<div class="demo-board">' +
      [1, 0, 3, 0, 4, 0, 0, 0, 0]
        .map((v, k) =>
          k === 4
            ? `<div class="cell open"><b class="nm" style="--nc:${numColor(4)}">4</b></div>`
            : v
              ? `<div class="cell hidden known"><span class="sp spr-${monKey(v)}"></span><b class="nm"></b></div>`
              : '<div class="cell hidden"><span class="sp"></span><b class="nm"></b></div>'
        )
        .join('') +
      '</div>';
    openSheet(
      `<p class="eyebrow">HOW TO PLAY</p>
      <h2>플레이 방법</h2>
      <ol class="rules">
        <li><span class="no">1</span><div><b>숫자는 주변 마물 레벨의 합</b>
          <p>열린 칸의 숫자는 둘러싼 8칸에 숨은 마물들의 레벨을 더한 값이에요. 마물이 쓰러지면 숫자도 줄어요.</p>
          <div class="demo">${demo}<span class="demo-cap">슬라임 <em>1</em> + 해골 병사 <em>3</em> = <em>4</em></span></div></div></li>
        <li><span class="no">2</span><div><b>내 레벨 이하면 안전</b>
          <p>내 레벨 이하의 마물은 피해 없이 처치해요. 그래서 숫자가 내 레벨 이하인 칸 주변은 전부 안전해요. 그런 숫자를 누르면 주변을 한 번에 열어요.</p></div></li>
        <li><span class="no">3</span><div><b>사냥해서 강해지기</b>
          <p>처치하면 경험치와 골드를 얻어요. 레벨을 올리려면 가끔 한 단계 강한 마물과 피해를 감수하고 싸워야 해요. 레벨은 층마다 1부터 다시 시작해요.</p></div></li>
        <li><span class="no">4</span><div><b>메모하고 한 번에 열기</b>
          <p>숨은 칸을 길게 누르거나(우클릭) 메모 모드에서 눌러 예상 레벨을 적어요. 내 레벨보다 큰 숫자라도, 주변 메모 합이 숫자와 같으면 숫자를 눌러 나머지 칸을 한 번에 열 수 있어요.</p></div></li>
        <li><span class="no">5</span><div><b>다섯 층 아래까지</b>
          <p>층의 마물을 모두 쓰러뜨리면 야영지에서 유물을 고르고 아이템을 사요. B5 리치의 옥좌에서 심연의 리치를 쓰러뜨리면 승리예요.</p></div></li>
      </ol>
      <h3>마물과 피해 · 지금 LV${L} 기준</h3>
      <div class="bestiary">${beasts}</div>
      <h3>키보드</h3>
      <p class="keys"><kbd>←↑↓→</kbd> 이동 · <kbd>SPACE</kbd> 열기 · <kbd>1</kbd>–<kbd>5</kbd> 메모 · <kbd>?</kbd> 모르겠음 · <kbd>0</kbd> 지우기 · <kbd>M</kbd> 모드 · <kbd>ESC</kbd> 메뉴</p>
      <button type="button" class="btn primary wide" data-act="close" data-focus>알겠어요</button>`,
      { closable: true, onClose }
    );
  }

  function openCamp() {
    if (!run || !floor) return;
    C.campArrive(run, floor);
    saveNow();
    renderHud();
    renderBelt();
    renderCamp(false);
  }

  function renderCamp(keepScroll) {
    const info = floor.camped;
    const fi = floor.fi;
    const next = C.FLOORS[fi + 1];
    const offers = info.offers
      .map(
        (k) =>
          `<button type="button" class="relic-card${info.picked === k ? ' picked' : ''}" data-act="relic" data-key="${k}"${info.picked ? ' disabled' : ''}>${spr(SP.RELIC_SPRITE[k])}<b>${C.RELICS[k].name}</b><p>${C.RELICS[k].desc}</p></button>`
      )
      .join('');
    const wares = C.SHOP.map((w) => {
      const meta = w.key === 'shield' ? C.SHIELD : C.ITEMS[w.key];
      const have = w.key === 'shield' ? run.shields : run.items[w.key] || 0;
      return `<div class="ware">${spr(w.key)}<div><b>${meta.name}<small>보유 ${have}</small></b><p>${meta.desc}</p></div><button type="button" class="buy" data-act="buy" data-key="${w.key}"${run.gold < w.price ? ' disabled' : ''} aria-label="${meta.name} ${w.price}골드에 사기">${spr('coin')}${w.price}</button></div>`;
    }).join('');
    const potions = run.items.potion || 0;
    const drink = potions > 0 && run.hp < run.maxHp ? `<button type="button" class="btn wide" data-act="drink" style="margin-top:10px">회복 물약 마시기 · 남은 물약 ${potions}</button>` : '';
    const hpP = clamp(run.hp / run.maxHp, 0, 1);
    openSheet(
      `<p class="eyebrow">B${fi + 1} CLEAR</p>
      <h2>야영지</h2>
      <p class="lead">${C.FLOORS[fi].name}의 마물을 모두 쓰러뜨렸어요. 모닥불 앞에서 숨을 고르세요.</p>
      <div class="camp-sum">
        <span>처치<b>${info.kills}</b></span>
        <span>받은 피해<b>${info.dmg}</b></span>
        ${info.grow ? `<span>단련<b>최대 체력 +${info.grow}</b></span>` : ''}
        <span>휴식<b>${info.heal ? `+${info.heal} HP` : '체력 가득'}</b></span>
        <span>정복 보상<b>+${info.bonus}G</b>${info.perfect ? '<em>무피해 보너스</em>' : ''}</span>
      </div>
      <div class="vitals">
        <div class="meter hp">${spr('heart')}<div class="bar"><i style="--p:${hpP}"></i></div><b>${run.hp}/${run.maxHp}</b>${run.shields ? `<span class="shield-badge">${spr('shield')}<b>${run.shields}</b></span>` : ''}</div>
        <span class="gold">${spr('coin')}<b>${run.gold}</b></span>
      </div>
      ${drink}
      <h3>유물 하나를 고르세요</h3>
      <div class="relics">${offers}</div>
      <h3>떠돌이 상인</h3>
      <div class="shop">${wares}</div>
      <button type="button" class="btn primary wide" data-act="descend"${info.picked ? '' : ' disabled'}>${info.picked ? `B${fi + 2} ${next.name}${ro(next.name)} 내려가기` : '유물을 먼저 골라 주세요'}</button>`,
      { closable: false, keepScroll }
    );
  }

  function descend() {
    if (!run || !floor || !floor.camped || !floor.camped.picked) return;
    closeSheet();
    Sfx.descend();
    const { floor: f, events } = C.nextFloor(run);
    enterFloor(f, events);
  }

  function showEnd(won) {
    if (!run) return;
    const sc = C.score(run);
    const best = store.get(BEST_KEY, null);
    const isBest = !best || sc > best.score;
    if (isBest) store.set(BEST_KEY, { score: sc, floor: run.fi + 1, won, at: Date.now() });
    store.del(SAVE_KEY);
    const cause = run.cause
      ? `B${run.cause.fi + 1} ${C.FLOORS[run.cause.fi].name}에서 LV${run.cause.m} ${monName(run.cause.m)}에게 쓰러졌어요.`
      : '';
    openSheet(
      `<p class="eyebrow">${won ? 'VICTORY' : 'GAME OVER'}</p>
      <h2>${won ? '던전 정복!' : '쓰러졌어요'}</h2>
      <p class="lead">${won ? '심연의 리치가 무너지고, 다섯 층의 던전이 조용해졌어요.' : cause}</p>
      <div class="score"><span>점수</span><b>${sc.toLocaleString()}</b>${isBest ? '<em>최고 기록!</em>' : `<small>최고 ${best.score.toLocaleString()}</small>`}</div>
      <div class="stats">
        <div class="stat"><b>B${run.fi + 1}</b><small>도달한 층</small></div>
        <div class="stat"><b>${run.stats.kills}</b><small>처치한 마물</small></div>
        <div class="stat"><b>${run.stats.gold}</b><small>모은 골드</small></div>
        <div class="stat"><b>${run.stats.dmg}</b><small>받은 피해</small></div>
        <div class="stat"><b>${run.stats.chests}</b><small>연 보물상자</small></div>
        <div class="stat"><b>${fmtTime(run.stats.time)}</b><small>플레이 시간</small></div>
      </div>
      <div class="end-actions">
        <button type="button" class="btn primary" data-act="again" data-focus>다시 도전</button>
        <button type="button" class="btn ghost" data-act="title">타이틀로</button>
      </div>`,
      { closable: false }
    );
  }

  // ------------------------------------------------------------------ 흐름
  function showScreen(name) {
    screen = name;
    dom.title.hidden = name !== 'title';
    dom.game.hidden = name !== 'game';
  }

  function showTitle() {
    clearTimers();
    closePicker();
    hideToast();
    setArmed(null);
    locked = false;
    showScreen('title');
    const s = loadSave();
    dom.tContinue.hidden = !s;
    if (s) dom.tContinueInfo.textContent = `B${s.run.fi + 1} ${C.FLOORS[s.run.fi].name} · HP ${s.run.hp}/${s.run.maxHp}`;
    const best = store.get(BEST_KEY, null);
    dom.tBest.textContent = best
      ? `최고 기록 ${best.score.toLocaleString()}점 · ${best.won ? '던전 정복' : 'B' + best.floor + '까지 도달'}`
      : '아직 기록이 없어요. 첫 모험을 떠나 보세요.';
    renderSoundPill();
  }

  function renderSoundPill() {
    dom.tSound.textContent = settings.muted ? '효과음 꺼짐' : '효과음 켜짐';
    dom.tSound.setAttribute('aria-pressed', String(!settings.muted));
  }

  function newGame() {
    clearTimers();
    run = C.newRun();
    const { floor: f, events } = C.startFloor(run);
    enterFloor(f, events);
    if (!settings.helpSeen) {
      settings.helpSeen = true;
      saveSettings();
      later(500, () => openHelp());
    }
  }

  function enterFloor(f, events) {
    clearTimers();
    floor = f;
    shown = floor.cells.map((c) => c.open);
    mode = 'dig';
    cursor = -1;
    confirmIdx = -1;
    locked = false;
    setArmed(null);
    closePicker();
    hideToast();
    showScreen('game');
    dom.game.classList.remove('dying', 'shake');
    dom.fx.textContent = '';
    buildBoard();
    renderHud();
    renderBelt();
    const def = C.FLOORS[floor.fi];
    if (!floor.cleared) {
      banner(`B${floor.fi + 1}`, def.name, 'floor');
      if (def.boss && !floor.generated) later(1500, () => toast('LV6이 되면 리치를 피해 없이 쓰러뜨릴 수 있어요.', 'tip', 4800));
    }
    if (events && events.length) play(events);
    saveNow();
  }

  function loadSave() {
    const s = store.get(SAVE_KEY, null);
    return validSave(s) ? s : null;
  }
  function validSave(s) {
    try {
      return !!(
        s &&
        s.v === 1 &&
        s.run &&
        s.floor &&
        C.FLOORS[s.run.fi] &&
        s.run.fi === s.floor.fi &&
        Array.isArray(s.floor.cells) &&
        s.floor.cells.length === s.floor.cols * s.floor.rows &&
        !s.run.dead &&
        !s.run.won
      );
    } catch {
      return false;
    }
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (!run || !floor || run.dead || run.won) return;
    store.set(SAVE_KEY, { v: 1, run, floor });
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  function resume(s) {
    run = s.run;
    enterFloor(s.floor, null);
    if (floor.cleared) later(300, () => openCamp());
  }

  // ------------------------------------------------------------------ 타이틀 장식
  function buildRoster() {
    dom.roster.innerHTML = [1, 2, 3, 4, 5, 6]
      .map(
        (m) =>
          `<li style="--k:${m}">${spr(monKey(m), m === C.BOSS_LEVEL ? 'boss-sp' : '')}<b>${m === C.BOSS_LEVEL ? 'BOSS' : 'LV' + m}</b><small>${C.MONSTERS[m].short}</small></li>`
      )
      .join('');
  }
  function buildEmbers() {
    if (REDUCED) return;
    let html = '';
    for (let k = 0; k < 18; k++) {
      const left = (Math.random() * 100).toFixed(1);
      const dur = (6 + Math.random() * 8).toFixed(1);
      const delay = (-Math.random() * 12).toFixed(1);
      const dx = ((Math.random() - 0.5) * 120).toFixed(0);
      html += `<i class="ember" style="left:${left}%;animation-duration:${dur}s;animation-delay:${delay}s;--dx:${dx}px"></i>`;
    }
    dom.embers.innerHTML = html;
  }

  dom.tNew.addEventListener('click', () => {
    Sfx.unlock();
    Sfx.descend();
    newGame();
  });
  dom.tContinue.addEventListener('click', () => {
    Sfx.unlock();
    const s = loadSave();
    if (s) resume(s);
    else showTitle();
  });
  dom.tHelp.addEventListener('click', () => {
    Sfx.unlock();
    Sfx.ui();
    openHelp();
  });
  dom.tSound.addEventListener('click', () => {
    Sfx.unlock();
    settings.muted = !settings.muted;
    Sfx.setMuted(settings.muted);
    saveSettings();
    renderSoundPill();
    Sfx.ui();
  });

  // ------------------------------------------------------------------ 시작
  setInterval(() => {
    if (screen === 'game' && run && floor && !floor.cleared && !run.dead && !document.hidden && dom.sheet.hidden) {
      run.stats.time++;
      if (run.stats.time % 15 === 0) saveSoon();
    }
  }, 1000);

  window.addEventListener('resize', () => {
    Particles.resize();
    layoutBoard();
    closePicker();
  });
  if (window.ResizeObserver) new ResizeObserver(() => layoutBoard()).observe(dom.wrap);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveNow();
  });
  window.addEventListener('pagehide', saveNow);

  function boot(data) {
    SP.injectCSS();
    makeTextures();
    buildRoster();
    buildEmbers();
    Particles.resize();
    const s = data && data.save && validSave(data.save) ? data.save : null;
    if (s) resume(s);
    else showTitle();
  }

  // 아티팩트 뷰어가 새 버전을 밀어 넣을 때 진행 중인 판을 넘겨준다
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    hot.snapshot(() => (run && floor && !run.dead && !run.won ? { save: { v: 1, run, floor } } : {}));
  }
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot((hot && hot.data) || {});

  // 테스트와 디버깅용 손잡이
  window.__mineDungeon = {
    get run() {
      return run;
    },
    get floor() {
      return floor;
    },
    tap,
    openCamp,
    newGame,
  };
})();
