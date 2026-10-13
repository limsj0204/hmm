#!/usr/bin/env node
/*
 * 브라우저 자동 플레이 테스트 (Playwright 필요)
 *
 *   node tools/playtest.js [출력 폴더=playtest-out] [--desktop]
 *
 * 진짜 화면을 눌러 가며 한 판을 끝까지 돌린다: 타이틀 → 다섯 층 → 야영지 → 보스 → 승리.
 * 봇은 정답(마물 위치)을 훔쳐보며 약한 마물부터 잡으니 규칙이 아니라 화면 흐름을 검사한다.
 * 콘솔 오류가 하나라도 나면 실패로 끝난다.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || 'playtest-out');
const DESKTOP = process.argv.includes('--desktop');
const FONTS = process.argv.includes('--fonts'); // 구글 폰트까지 불러와 실제 모습으로 찍는다 (네트워크 필요)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, () => ok(server)));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = `http://localhost:${server.address().port}/`;
  const proxy = FONTS && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '<-loopback>,localhost,127.0.0.1' } : undefined;
  const browser = await chromium.launch(proxy ? { proxy } : {});
  const page = await browser.newPage(
    DESKTOP ? { viewport: { width: 1280, height: 860 } } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
  });
  if (!FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

  const shot = async (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const wait = (ms) => page.waitForTimeout(ms);

  await page.goto(base);
  await wait(500);
  if (FONTS) await page.evaluate(() => document.fonts.ready);
  if (FONTS) console.log('불러온 폰트:', await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i).join(', ')));
  await shot('01-title');

  await page.click('#t-new');
  await wait(900);
  await shot('02-help');
  await page.click('[data-act="close"]');
  await wait(300);

  // 판의 한 칸을 진짜 포인터로 누른다
  async function tapCell(i) {
    const box = await page.locator(`#board .cell[data-i="${i}"]`).boundingBox();
    if (!box) throw new Error('칸을 찾을 수 없음 ' + i);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  // 정답을 보고 다음 수를 고른다: 열린 칸 옆의 안전 칸 → 피해 없는 마물 → 가장 약한 마물
  const pickMove = () =>
    page.evaluate(() => {
      const g = window.__mineDungeon;
      const f = g.floor;
      const r = g.run;
      if (!f || f.cleared || r.dead) return null;
      const C = window.MineCore;
      if (!f.generated) return { i: Math.floor(f.rows / 2) * f.cols + 1, kind: 'first' };
      let best = null;
      let bestScore = Infinity;
      f.cells.forEach((c, i) => {
        if (c.open) return;
        let score;
        if (c.m === 0) score = C.neighbors(f, i).some((j) => f.cells[j].open) ? 0 : 50;
        else {
          const d = C.damageFor(r, f, c.m, c.boss);
          score = d === 0 ? 1 : 100 + d;
        }
        if (score < bestScore) {
          bestScore = score;
          best = { i, kind: score <= 1 ? 'free' : 'fight', dmg: score - 100 };
        }
      });
      return best;
    });

  let floorShots = 0;
  let memoShot = false;
  let midShot = false;
  for (let guard = 0; guard < 3000; guard++) {
    const state = await page.evaluate(() => {
      const g = window.__mineDungeon;
      return {
        fi: g.floor ? g.floor.fi : -1,
        cleared: g.floor ? g.floor.cleared : false,
        dead: g.run ? g.run.dead : false,
        won: g.run ? g.run.won : false,
        hp: g.run ? g.run.hp : 0,
        potions: g.run ? g.run.items.potion : 0,
        sheet: !document.getElementById('sheet').hidden,
        camp: !!document.querySelector('[data-act="descend"]'),
        end: !!document.querySelector('[data-act="again"]'),
      };
    });
    if (state.end) break;
    if (state.camp) {
      if (floorShots === state.fi) {
        await shot(`04-camp-B${state.fi + 1}`);
        floorShots++;
      }
      await page.click('.relic-card:not([disabled])');
      await wait(200);
      for (let k = 0; k < 3; k++) {
        const buy = page.locator('[data-act="buy"][data-key="potion"]:not([disabled])');
        if (await buy.count()) {
          await buy.click();
          await wait(80);
        }
      }
      await page.click('[data-act="descend"]');
      await wait(900);
      continue;
    }
    if (state.sheet || state.cleared || state.dead) {
      await wait(250);
      continue;
    }
    const mv = await pickMove();
    if (!mv) {
      await wait(200);
      continue;
    }
    // 위험한 싸움 전에 물약. 물약도 없으면 체력을 채운다 (규칙이 아니라 화면 흐름을 보는 테스트라서)
    if (mv.kind === 'fight' && mv.dmg >= state.hp) {
      if (state.potions > 0) {
        await page.click('[data-item="potion"]');
        await wait(250);
        continue;
      }
      await page.evaluate(() => (window.__mineDungeon.run.hp = window.__mineDungeon.run.maxHp));
    }
    if (!memoShot && mv.kind === 'free' && state.fi === 0) {
      // 메모 기능 한 번: 길게 눌러 메모 창 띄우기
      const box = await page.locator(`#board .cell.hidden:not(.known)`).first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await wait(500);
      await page.mouse.up();
      await wait(150);
      await shot('03b-memo-picker');
      await page.click('#picker button[data-v="2"]');
      await wait(150);
      memoShot = true;
    }
    await tapCell(mv.i);
    if (mv.kind === 'fight') {
      await wait(120);
      await tapCell(mv.i); // 확인 탭
    }
    await wait(mv.kind === 'first' ? 900 : 140);
    if (mv.kind === 'first' && state.fi === 0) {
      await shot('03-first-dig');
      // 수정구슬: 아이템을 누르면 벨트가 대상 고르기 막대로 바뀐다
      await page.click('[data-item="crystal"]');
      await wait(250);
      await shot('03c-targeting');
      const target = await page.evaluate(() => window.__mineDungeon.floor.cells.findIndex((c) => !c.open && !c.known && c.m > 0));
      await tapCell(target);
      await wait(600);
      const known = await page.evaluate((t) => window.__mineDungeon.floor.cells[t].known, target);
      if (!known) throw new Error('수정구슬이 마물을 드러내지 못함');
      // 내 레벨 이하인 숫자를 누르면 주변이 한꺼번에 열린다
      const sweepAt = await page.evaluate(() => {
        const f = window.__mineDungeon.floor;
        const C = window.MineCore;
        return f.cells.findIndex((c, k) => c.open && C.aliveSum(f, k) > 0 && C.aliveSum(f, k) <= f.level && C.neighbors(f, k).some((j) => !f.cells[j].open));
      });
      if (sweepAt >= 0) {
        await tapCell(sweepAt);
        await wait(700);
        const swept = await page.evaluate((i) => window.MineCore.neighbors(window.__mineDungeon.floor, i).every((j) => window.__mineDungeon.floor.cells[j].open), sweepAt);
        if (!swept) throw new Error('숫자를 눌러 한꺼번에 열기 실패');
        console.log('숫자 누르기로 한꺼번에 열기: 확인');
      }
      await page.click('#h-menu');
      await wait(350);
      await shot('03d-menu');
      await page.click('[data-act="resume"]');
      await wait(250);
    }
    if (state.fi === 2 && !midShot) {
      const kills = await page.evaluate(() => window.__mineDungeon.floor.kills);
      if (kills >= 9) {
        await wait(500);
        await shot('04b-midgame-B3');
        midShot = true;
      }
    }
    if (mv.kind === 'first' && state.fi === 4) await shot('05-boss-floor');
  }

  await wait(400);
  await shot('06-end');
  const result = await page.evaluate(() => ({ won: window.__mineDungeon.run && window.__mineDungeon.run.won, text: document.querySelector('#sheet-panel h2') && document.querySelector('#sheet-panel h2').textContent }));
  console.log('결과:', JSON.stringify(result));

  // 이어하기 확인: 새 판을 시작해 한 칸 파고 새로고침
  await page.click('[data-act="title"]');
  await wait(300);
  await page.click('#t-new');
  await wait(400);
  await tapCell(Math.floor(10 / 2) * 8 + 2);
  await wait(800);
  await page.reload();
  await wait(600);
  const cont = await page.locator('#t-continue').isVisible();
  console.log('새로고침 뒤 이어하기 버튼:', cont);
  if (cont) {
    await page.click('#t-continue');
    await wait(700);
    await shot('07-continued');
  }

  // 죽음: 가장 강한 마물만 골라 공격한다
  for (let k = 0; k < 60; k++) {
    if (await page.locator('[data-act="again"]').count()) break;
    const i = await page.evaluate(() => {
      const f = window.__mineDungeon.floor;
      if (!f || window.__mineDungeon.run.dead) return -1;
      let best = -1;
      f.cells.forEach((c, j) => {
        if (!c.open && c.m > 0 && (best < 0 || c.m > f.cells[best].m)) best = j;
      });
      return best;
    });
    if (i < 0) {
      await wait(400);
      continue;
    }
    await tapCell(i);
    await wait(120);
    await tapCell(i);
    await wait(500);
  }
  await wait(600);
  await shot('08-death');
  const deathText = await page.evaluate(() => document.querySelector('#sheet-panel h2') && document.querySelector('#sheet-panel h2').textContent);
  console.log('죽음 화면:', deathText);
  if (deathText !== '쓰러졌어요') errors.push('죽음 화면이 뜨지 않음');

  // 가로가 넘치지 않는지
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('가로 넘침:', overflow);

  await browser.close();
  server.close();
  if (errors.length) {
    console.log('오류:\n' + errors.join('\n'));
    process.exit(1);
  }
  if (!result.won || !cont || overflow) process.exit(1);
  console.log('통과. 스크린샷:', OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
