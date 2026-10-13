/*
 * 지뢰 던전 — 픽셀 스프라이트
 * 12×12 문자 그림. '.'은 투명, 나머지 글자는 각 스프라이트 팔레트의 색.
 * 부팅할 때 캔버스로 그려 data URL을 만들고 .spr-이름 클래스로 쓴다.
 */
(function (root) {
  'use strict';

  const K = '#140c1a'; // 공통 외곽선

  const DATA = {
    // ---------------------------------------------------------- 마물
    slime: {
      pal: { k: K, g: '#5fd068', G: '#2f8f45', l: '#c8f7b0', w: '#ffffff' },
      px: [
        '............',
        '............',
        '....kkkk....',
        '...kgllgk...',
        '..kglggggk..',
        '.kglggggggk.',
        '.kgwkggwkgk.',
        'kggwkggwkggk',
        'kgggggggggGk',
        'kGgggkkgggGk',
        '.kGGggggGGk.',
        '..kkkkkkkk..',
      ],
    },
    bat: {
      pal: { k: K, p: '#9b74e6', P: '#5c3f9c', b: '#6d52b0', r: '#ff4f6a', w: '#f4eefc' },
      px: [
        '............',
        '............',
        '...k....k...',
        'k..kk..kk..k',
        'kk.kbkkbk.kk',
        'kpkkbbbbkkpk',
        'kppkrbbrkppk',
        'kpppkwwkpppk',
        'kpPppkkppPpk',
        'kPkPpPPpPkPk',
        '.k.kPk.kPk.k',
        '....k...k...',
      ],
    },
    skull: {
      pal: { k: K, w: '#ece6d6', s: '#b3a891', r: '#ff4d4d' },
      px: [
        '............',
        '...kkkkkk...',
        '..kwwwwwsk..',
        '.kwwwwwwwsk.',
        '.kwkkwwkksk.',
        '.kwkrwwrksk.',
        '.kwwwkkwwsk.',
        '..kwwwwwsk..',
        '..kwkwwkwk..',
        '...kwwwsk...',
        '....kkkk....',
        '............',
      ],
    },
    ghost: {
      pal: { k: K, c: '#c4ecff', C: '#7fb2d8', p: '#ff9ec7' },
      px: [
        '....kkkk....',
        '...kcccck...',
        '..kcccccck..',
        '.kcccccccCk.',
        '.kckkcckkCk.',
        '.kckkcckkCk.',
        '.kpccccpcCk.',
        '.kccckkccCk.',
        '.kcccccccCk.',
        '.kccccccCCk.',
        '.kcckcckcck.',
        '..kk.kk.kk..',
      ],
    },
    demon: {
      pal: { k: K, r: '#e2483f', R: '#9a2830', h: '#f3e2b8', y: '#ffd84a', w: '#ffffff' },
      px: [
        '.h........h.',
        '.hh......hh.',
        '..hh....hh..',
        '..khkkkkhk..',
        '..krrrrrRk..',
        '.krrrrrrrRk.',
        '.kryyrryyRk.',
        '.krkyrrykRk.',
        '.krrrrrrrRk.',
        '..krwkkwRk..',
        '...krrRRk...',
        '....kkkk....',
      ],
    },
    lich: {
      pal: { k: K, y: '#ffcf4a', o: '#c98a1b', r: '#ff4466', w: '#e9e4f5', s: '#a99cc4', g: '#7dff9a', p: '#8a5ae0', P: '#4b2e8f' },
      px: [
        '..y..yy..y..',
        '..yy.yy.yy..',
        '..yyyyyyyy..',
        '..yoyrryoy..',
        '.kwwwwwwwsk.',
        '.kwkgwwgksk.',
        '.kwkkwwkksk.',
        '.kwwwkkwwsk.',
        '..kwkwwkwk..',
        '.pPkwwwskPp.',
        'pPPPkkkkPPPp',
        'pPpPPPPPPpPp',
      ],
    },

    // ---------------------------------------------------------- 보물 / 아이템
    chest: {
      pal: { k: K, b: '#b0703f', B: '#6e3f22', y: '#ffd25e', Y: '#c9952b' },
      px: [
        '............',
        '............',
        '...kkkkkk...',
        '..kbbbbbbk..',
        '.kbbbbbbbBk.',
        '.kyyyyyyyYk.',
        '.kbbbyybbBk.',
        '.kbbbkkbbBk.',
        '.kbbbbbbbBk.',
        '.kBBBBBBBBk.',
        '.kkkkkkkkkk.',
        '............',
      ],
    },
    potion: {
      pal: { k: K, c: '#9a6638', w: '#d8e6f2', r: '#ff4f6d', R: '#b52a4a', l: '#ffc2cf' },
      px: [
        '....kkkk....',
        '....kcck....',
        '....kwwk....',
        '....kwwk....',
        '...kwwwwk...',
        '..kwrrrrwk..',
        '.kwrrrrrrwk.',
        '.krlrrrrrRk.',
        '.krlrrrrrRk.',
        '.krrrrrrrRk.',
        '..kRrrrrRk..',
        '...kkkkkk...',
      ],
    },
    crystal: {
      pal: { k: K, b: '#59a8ff', B: '#2d5fb5', l: '#e4f3ff', m: '#9bd6ff', y: '#e0b04a', Y: '#9c7426' },
      px: [
        '............',
        '....kkkk....',
        '...kmbbbk...',
        '..kmllbbbk..',
        '..kmlbbbbk..',
        '..kbbbbbBk..',
        '..kbbbbBBk..',
        '...kbBBBk...',
        '....kkkk....',
        '...kyyyYk...',
        '..kyyyyyYk..',
        '..kkkkkkkk..',
      ],
    },
    torch: {
      pal: { k: K, r: '#ff5a2a', o: '#ffa53a', y: '#ffe27a', b: '#a0683a', d: '#5f3d24' },
      px: [
        '.....rr.....',
        '....roor....',
        '...rooyor...',
        '...royyor...',
        '...royyyr...',
        '....ryyr....',
        '....kbbk....',
        '....kbbk....',
        '....kddk....',
        '....kddk....',
        '....kddk....',
        '....kkkk....',
      ],
    },
    bomb: {
      pal: { k: K, g: '#4f5576', G: '#2a2d42', l: '#aab1da', f: '#d2ae74', y: '#ffe066', r: '#ff6a3d' },
      px: [
        '.........y..',
        '........yry.',
        '.......f.y..',
        '......f.....',
        '...kkkkkk...',
        '..kgllgggk..',
        '.kglggggggk.',
        '.kglgggggGk.',
        '.kgggggggGk.',
        '.kggggggGGk.',
        '..kgGGGGGk..',
        '...kkkkkk...',
      ],
    },
    shield: {
      pal: { k: K, s: '#cdd5e2', S: '#7d879a', r: '#d9434b', R: '#962a33' },
      px: [
        '............',
        '.kkkkkkkkkk.',
        '.ksssrrssSk.',
        '.ksssrrssSk.',
        '.krrrrrrrRk.',
        '.ksssrrssSk.',
        '.ksssrrssSk.',
        '..kssrrsSk..',
        '..kssrrsSk..',
        '...ksrrSk...',
        '....kSSk....',
        '.....kk.....',
      ],
    },
    heart: {
      pal: { k: K, r: '#ff4f64', R: '#b8293f', l: '#ffc0c8' },
      px: [
        '............',
        '............',
        '..kkk..kkk..',
        '.krrrkkrrrk.',
        '.krlrrrrrRk.',
        '.krrrrrrrRk.',
        '..krrrrrRk..',
        '...krrrRk...',
        '....krRk....',
        '.....kk.....',
        '............',
        '............',
      ],
    },
    coin: {
      pal: { k: K, y: '#ffd25e', Y: '#c48a1e', l: '#fff3b8' },
      px: [
        '............',
        '............',
        '....kkkk....',
        '...kyyyyk...',
        '..kylyyyYk..',
        '..kyyYYyYk..',
        '..kyyYYyYk..',
        '..kyyyyYYk..',
        '...kYYYYk...',
        '....kkkk....',
        '............',
        '............',
      ],
    },
    flag: {
      pal: { k: K, y: '#e0b04a', r: '#ff5a4f', R: '#b8323a' },
      px: [
        '............',
        '..kkkkkkk...',
        '..kyrrrrrk..',
        '..kyrrrrRRk.',
        '..kyrrrRRk..',
        '..kykkkkk...',
        '..kyk.......',
        '..kyk.......',
        '..kyk.......',
        '..kyk.......',
        '.kkykk......',
        '.kkkkk......',
      ],
    },
    pickaxe: {
      pal: { k: K, s: '#cfd6e3', S: '#7e889c', d: '#a0683a' },
      px: [
        '............',
        '..kkkkkkkk..',
        '.kssssssssk.',
        'ksSkkddkkSsk',
        'kSk.kddk.kSk',
        'kk..kddk..kk',
        '....kddk....',
        '....kddk....',
        '....kddk....',
        '....kddk....',
        '....kddk....',
        '....kkkk....',
      ],
    },

    // ---------------------------------------------------------- 유물
    sword: {
      pal: { k: K, w: '#eef2f8', s: '#9aa6bb', y: '#ffcf4a', d: '#7a4a2a' },
      px: [
        '.....kk.....',
        '....kwsk....',
        '....kwsk....',
        '....kwsk....',
        '....kwsk....',
        '....kwsk....',
        '....kwsk....',
        '.kkkkyykkkk.',
        '.kyyyyyyyyk.',
        '.kkkkddkkkk.',
        '....kddk....',
        '....kyyk....',
      ],
    },
    helmet: {
      pal: { k: K, s: '#c9d1de', S: '#7d879a', r: '#e04a4a' },
      px: [
        '.....rr.....',
        '....krrk....',
        '..kksssskk..',
        '.ksssssssSk.',
        '.ksssssssSk.',
        '.kkkkkkkkkk.',
        '.ksssssssSk.',
        '.kssssssSSk.',
        '.kskskskSSk.',
        '.kssssssSSk.',
        '..kkkkkkkk..',
        '............',
      ],
    },
    bigheart: {
      pal: { k: K, r: '#ff4f64', R: '#b8293f', w: '#ffffff' },
      px: [
        '............',
        '............',
        '..kkk..kkk..',
        '.krrrkkrrrk.',
        '.krrrwwrrRk.',
        '.krrwwwwrRk.',
        '..krrwwrRk..',
        '...krrrRk...',
        '....krRk....',
        '.....kk.....',
        '............',
        '............',
      ],
    },
    fang: {
      pal: { k: K, w: '#f6f1e6', s: '#c4b8a4', r: '#e0283f' },
      px: [
        '............',
        '..kkkkkkkk..',
        '..kwwwwwsk..',
        '..kwwwwwsk..',
        '..kwwwwssk..',
        '...kwwwsk...',
        '...kwwssk...',
        '....kwsk....',
        '....krrk....',
        '.....kk.....',
        '.....rr.....',
        '.....rr.....',
      ],
    },
    pouch: {
      pal: { k: K, y: '#ffd25e', Y: '#c48a1e', b: '#a8693c', B: '#6e4224', r: '#d9434b' },
      px: [
        '............',
        '....kkkk....',
        '...kyyYYk...',
        '....kbbk....',
        '...kkrrkk...',
        '..kbbbbbbk..',
        '.kbbbbbbbBk.',
        '.kbbbyybbBk.',
        '.kbbyybbbBk.',
        '.kbbbbbbBBk.',
        '..kBBBBBBk..',
        '...kkkkkk...',
      ],
    },
    eye: {
      pal: { k: K, w: '#f1ecf7', b: '#b07cff', l: '#ffffff' },
      px: [
        '............',
        '............',
        '............',
        '..kkkkkkkk..',
        '.kwwbbbbwwk.',
        'kwwblkkbbwwk',
        'kwwbbkkbbwwk',
        '.kwwbbbbwwk.',
        '..kkkkkkkk..',
        '............',
        '............',
        '............',
      ],
    },
    clover: {
      pal: { k: K, g: '#5fd068', G: '#2f8f45', l: '#c8f7b0' },
      px: [
        '............',
        '..kk....kk..',
        '.kggk..kggk.',
        '.kgggkkgggk.',
        '..kgglggGk..',
        '...kggggk...',
        '..kggggggk..',
        '.kgggkkgggk.',
        '.kggk..kggk.',
        '..kk.Gk.kk..',
        '.....kGk....',
        '......kk....',
      ],
    },
    candle: {
      pal: { k: K, o: '#ff8a2a', y: '#ffe27a', w: '#f4efe2', S: '#c9bfa6' },
      px: [
        '.....oo.....',
        '....oyyo....',
        '....oyyo....',
        '.....oo.....',
        '.....kk.....',
        '....kwwk....',
        '....kwwk....',
        '....kwSk....',
        '....kwSk....',
        '..kkkwSkkk..',
        '..kyyyyyyk..',
        '..kkkkkkkk..',
      ],
    },
    feather: {
      pal: { k: K, o: '#ffb347', r: '#ff5a3c', y: '#ffe08a' },
      px: [
        '..........kk',
        '.........kok',
        '........kork',
        '.......korrk',
        '......korrk.',
        '.....korrk..',
        '....korrk...',
        '...korrk....',
        '..kyrrk.....',
        '.kyrkk......',
        '.yk.........',
        'y...........',
      ],
    },
    book: {
      pal: { k: K, p: '#8a5ae0', P: '#5a3a9e', y: '#ffcf4a', w: '#efe6d2' },
      px: [
        '............',
        '..kkkkkkkk..',
        '.kPppppppPk.',
        '.kPpyyyypPk.',
        '.kPpyppypPk.',
        '.kPpyyyypPk.',
        '.kPppppppPk.',
        '.kPppppppPk.',
        '.kPPPPPPPPk.',
        '.kwwwwwwwwk.',
        '.kkkkkkkkkk.',
        '............',
      ],
    },
  };

  // 유물 키 → 스프라이트 (거인의 심장은 하트와 구별되는 그림을 쓴다)
  const RELIC_SPRITE = {
    sword: 'sword',
    helmet: 'helmet',
    heart: 'bigheart',
    fang: 'fang',
    pouch: 'pouch',
    eye: 'eye',
    clover: 'clover',
    candle: 'candle',
    feather: 'feather',
    book: 'book',
    pickaxe: 'pickaxe',
  };

  const cache = {};
  function url(name) {
    if (cache[name]) return cache[name];
    const s = DATA[name];
    const cv = document.createElement('canvas');
    cv.width = s.px[0].length;
    cv.height = s.px.length;
    const ctx = cv.getContext('2d');
    s.px.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        ctx.fillStyle = s.pal[ch];
        ctx.fillRect(x, y, 1, 1);
      }
    });
    return (cache[name] = cv.toDataURL());
  }

  function injectCSS() {
    const css = Object.keys(DATA)
      .map((n) => `.spr-${n}{background-image:url(${url(n)})}`)
      .join('\n');
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  // 파티클에 쓸 대표색 (외곽선 제외)
  function colors(name) {
    const s = DATA[name];
    return s ? Object.values(s.pal).filter((c) => c !== K) : ['#ffffff'];
  }

  const api = { DATA, RELIC_SPRITE, url, injectCSS, colors };
  root.Sprites = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
