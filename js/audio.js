/*
 * 지뢰 던전 — 효과음
 * 녹음 파일 없이 WebAudio로 8비트 소리를 합성한다.
 * 브라우저 정책상 첫 터치/클릭 뒤에야 소리가 난다 (unlock).
 */
(function (root) {
  'use strict';

  let ctx = null;
  let out = null;
  let noiseBuf = null;
  let muted = false;

  function init() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    out = ctx.createGain();
    out.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    out.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    const c = init();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function tone(freq, dur, o) {
    if (muted || !ctx || ctx.state !== 'running') return;
    o = o || {};
    const t0 = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t0 + dur);
    const vol = o.vol || 0.12;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise(dur, o) {
    if (muted || !ctx || ctx.state !== 'running') return;
    o = o || {};
    const t0 = ctx.currentTime + (o.at || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1200, t0);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, (o.freq || 1200) * o.slide), t0 + dur);
    f.Q.value = o.q || 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  const arp = (notes, step, o) => notes.forEach((f, k) => tone(f, (o && o.len) || 0.12, Object.assign({}, o, { at: ((o && o.at) || 0) + k * step })));

  root.Sfx = {
    unlock,
    setMuted(v) {
      muted = !!v;
    },
    // 칸이 펼쳐질 때: 거리가 멀수록 음이 올라간다
    tick(d) {
      tone(420 + Math.min(d, 18) * 42, 0.045, { type: 'square', vol: 0.045 });
    },
    dig() {
      noise(0.07, { vol: 0.16, freq: 700, q: 1.2 });
      tone(220, 0.06, { type: 'triangle', vol: 0.09, slide: 0.6 });
    },
    strike() {
      noise(0.1, { vol: 0.2, freq: 2600, filter: 'highpass', slide: 0.4 });
    },
    kill(m) {
      const base = 520 + (m || 1) * 40;
      tone(base, 0.06, { vol: 0.09 });
      tone(base * 1.5, 0.1, { vol: 0.08, at: 0.05 });
    },
    coin() {
      tone(988, 0.05, { vol: 0.06, type: 'square' });
      tone(1319, 0.13, { vol: 0.06, type: 'square', at: 0.05 });
    },
    hurt(dmg) {
      tone(160, 0.28, { type: 'sawtooth', vol: 0.16, slide: 0.45 });
      noise(0.25, { vol: Math.min(0.4, 0.18 + (dmg || 1) * 0.02), freq: 500, filter: 'lowpass', slide: 0.3 });
    },
    block() {
      tone(1500, 0.07, { type: 'triangle', vol: 0.12 });
      tone(2100, 0.16, { type: 'triangle', vol: 0.08, at: 0.04 });
      noise(0.08, { vol: 0.1, freq: 5000, filter: 'highpass' });
    },
    levelup() {
      arp([523, 659, 784, 1047], 0.075, { vol: 0.09, len: 0.13 });
      tone(1568, 0.35, { type: 'triangle', vol: 0.09, at: 0.3 });
    },
    chest() {
      arp([784, 988, 1175, 1568], 0.05, { type: 'triangle', vol: 0.09, len: 0.1 });
    },
    heal() {
      arp([660, 880, 1100], 0.06, { type: 'sine', vol: 0.1, len: 0.14 });
    },
    magic() {
      arp([880, 1320, 1760, 1320, 2200], 0.04, { type: 'sine', vol: 0.06, len: 0.12 });
    },
    sweep() {
      arp([660, 880, 1175], 0.035, { type: 'triangle', vol: 0.06, len: 0.08 });
    },
    memo() {
      tone(1050, 0.035, { type: 'triangle', vol: 0.06 });
    },
    ui() {
      tone(760, 0.04, { type: 'triangle', vol: 0.07 });
    },
    deny() {
      tone(220, 0.08, { type: 'square', vol: 0.07 });
      tone(165, 0.12, { type: 'square', vol: 0.07, at: 0.07 });
    },
    boom() {
      noise(0.7, { vol: 0.45, freq: 900, filter: 'lowpass', slide: 0.15 });
      tone(90, 0.55, { type: 'sine', vol: 0.3, slide: 0.35 });
    },
    clear() {
      arp([523, 659, 784, 659, 784, 1047], 0.09, { vol: 0.09, len: 0.14 });
      tone(1047, 0.5, { type: 'triangle', vol: 0.1, at: 0.56 });
    },
    victory() {
      arp([392, 523, 659, 784, 659, 784, 1047, 1319], 0.1, { vol: 0.1, len: 0.16 });
      tone(1568, 0.9, { type: 'triangle', vol: 0.1, at: 0.82 });
    },
    bossDown() {
      noise(1.1, { vol: 0.5, freq: 1600, filter: 'lowpass', slide: 0.08 });
      tone(70, 1.0, { type: 'sine', vol: 0.35, slide: 0.5 });
      tone(140, 0.6, { type: 'sawtooth', vol: 0.12, slide: 0.3, at: 0.05 });
    },
    revive() {
      arp([392, 523, 784, 1047, 1568], 0.07, { type: 'triangle', vol: 0.1, len: 0.2 });
    },
    death() {
      arp([392, 330, 262, 196], 0.16, { type: 'square', vol: 0.09, len: 0.22 });
      noise(0.9, { vol: 0.2, freq: 300, filter: 'lowpass', at: 0.2 });
    },
    descend() {
      arp([330, 262, 196], 0.08, { type: 'triangle', vol: 0.08, len: 0.14 });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
