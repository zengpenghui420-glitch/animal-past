/**
 * Synthetic-order checks for animal-past unlock.
 * Chrome is pinned to 127.0.0.1 for the API and Mantle hosts, so a missed
 * mock cannot redeem a real order or code. This file never uses a real buyer
 * order or a pool code.
 *
 * Run: npm install --prefix /tmp/puppeteer-animal puppeteer-core
 *      node tools/order-unlock.test.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkg = ['/tmp/puppeteer-animal/package.json', '/tmp/ppt/package.json'].find((p) => existsSync(p));
if (!pkg) throw new Error('puppeteer-core is not installed');
const puppeteer = createRequire(pkg)('puppeteer-core');

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const API_HOST = 'snappy-tundra-7uesdvk-zengpenghui420-glitch.vercel.app';
const API = 'https://' + API_HOST;
const ORDER = 'P738291046518273649';
const OTHER = 'P847291038475610293';
const CODE = 'AP7K3N';
const PORT = 8947;
const BASE = `http://127.0.0.1:${PORT}/`;
const ART = '/opt/cursor/artifacts';

function patternError(id) {
  if (!/^P\d{18}$/.test(id)) return 'shape';
  const d = id.slice(1);
  for (const size of [1, 2, 3, 6, 9]) {
    if (d.slice(0, size).repeat(d.length / size) === d) return 'repeat';
  }
  const step = (d.charCodeAt(1) - d.charCodeAt(0) + 10) % 10;
  if (step === 1 || step === 9) {
    let seq = true;
    for (let i = 1; i < d.length; i++) {
      if ((d.charCodeAt(i) - d.charCodeAt(i - 1) + 10) % 10 !== step) seq = false;
    }
    if (seq) return 'sequence';
  }
  return '';
}
if (patternError(ORDER) || patternError(OTHER)) throw new Error('synthetic order is not a legal id');
if (!/^AP[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(CODE)) throw new Error('synthetic code shape');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Content-Type,Authorization,X-Device-Id,X-Fingerprint,X-Mantle-Key',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'content-type': 'application/json',
};

function freshState() {
  return {
    vaultMode: 'ok',
    mantleRemaining: 3,
    mantleMissing: false,
    mantleDecrResult: null,
    vaultPosts: 0,
    mantleGets: 0,
    mantleDecr: 0,
    mantleIncr: 0,
    bodies: [],
    urls: [],
    unexpected: [],
  };
}

async function send(req, status, obj) {
  await req.respond({ status, headers: CORS, body: JSON.stringify(obj) });
}

async function handleApi(req, u, state) {
  if (req.method() === 'OPTIONS') {
    await req.respond({ status: 204, headers: CORS, body: '' });
    return;
  }
  state.urls.push(req.method() + ' ' + u.hostname + u.pathname);
  if (u.pathname.includes('/order/') || u.pathname.includes('/orders/')) {
    state.unexpected.push('vercel-order ' + req.method() + ' ' + u.pathname);
    await req.abort('failed');
    return;
  }
  if (u.pathname === '/redeem' && req.method() === 'POST') {
    const body = JSON.parse(req.postData() || '{}');
    state.bodies.push(body);
    state.vaultPosts++;
    if (state.vaultMode === 'down') {
      await req.abort('failed');
      return;
    }
    if (state.vaultMode === 'not_found') return send(req, 404, { ok: false, error: 'not_found' });
    if (state.vaultMode === 'exhausted') return send(req, 403, { ok: false, error: 'exhausted' });
    return send(req, 200, { ok: true, remaining: 2, max: 3 });
  }
  state.unexpected.push('api ' + req.method() + ' ' + u.pathname);
  await req.abort('failed');
}

async function handleMantle(req, u, state) {
  if (req.method() === 'OPTIONS') {
    await req.respond({ status: 204, headers: CORS, body: '' });
    return;
  }
  state.urls.push(req.method() + ' mantle ' + u.pathname);
  if (u.pathname.includes('/orders/')) {
    state.unexpected.push('mantle-order ' + u.pathname);
    await req.abort('failed');
    return;
  }
  if (!u.pathname.includes('/ap/')) {
    state.unexpected.push('mantle-col ' + u.pathname);
    await req.abort('failed');
    return;
  }
  if (req.method() === 'GET') {
    state.mantleGets++;
    if (state.mantleMissing) return send(req, 404, { error: 'not_found' });
    return send(req, 200, { remaining: state.mantleRemaining, max: 3 });
  }
  if (req.method() === 'POST' && u.pathname.includes('/increment/')) {
    const body = JSON.parse(req.postData() || '{}');
    state.bodies.push(body);
    if (body.by === -1) {
      state.mantleDecr++;
      if (state.mantleDecrResult != null) return send(req, 200, { remaining: state.mantleDecrResult });
      state.mantleRemaining -= 1;
    } else if (body.by === 1) {
      state.mantleIncr++;
      state.mantleRemaining += 1;
    } else {
      state.unexpected.push('mantle by ' + body.by);
    }
    return send(req, 200, { remaining: state.mantleRemaining });
  }
  state.unexpected.push('mantle ' + req.method() + ' ' + u.pathname);
  await req.abort('failed');
}

async function arm(page, state) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    try {
      const u = new URL(req.url());
      if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
        await req.continue();
        return;
      }
      if (u.hostname === API_HOST) return await handleApi(req, u, state);
      if (u.hostname === 'mantledb.sh') return await handleMantle(req, u, state);
      state.unexpected.push(u.hostname + req.url());
      await req.abort('failed');
    } catch (e) {
      state.unexpected.push('handler ' + e.message);
      try { await req.abort('failed'); } catch (err) {}
    }
  });
}

function assert(cond, msg, state) {
  if (!cond) {
    const extra = state ? '\n' + JSON.stringify({
      vaultPosts: state.vaultPosts,
      mantleGets: state.mantleGets,
      mantleDecr: state.mantleDecr,
      mantleIncr: state.mantleIncr,
      bodies: state.bodies,
      urls: state.urls,
      unexpected: state.unexpected,
    }, null, 2) : '';
    throw new Error((msg || 'assertion failed') + extra);
  }
}

function assertNoOrderNet(state, msg) {
  const hit = state.urls.filter((u) => u.includes('/order') || u.includes('/orders') || u.includes('vercel'));
  assert(hit.length === 0 && state.unexpected.length === 0, msg || 'order network', state);
  assert(state.vaultPosts === 0 && state.mantleGets === 0 && state.mantleDecr === 0 && state.mantleIncr === 0, msg || 'order network', state);
}

async function openAndSubmit(page, value) {
  await page.click('#btnStart');
  await page.waitForSelector('#codeMask.show');
  await page.$eval('#codeInput', (el, v) => { el.value = v; }, value);
  await page.click('#btnCodeOk');
}

async function waitQuiz(page) {
  await page.waitForFunction(() => document.getElementById('quiz').classList.contains('active'), { timeout: 8000 });
}

async function waitResult(page) {
  await page.waitForFunction(() => document.getElementById('result').classList.contains('active'), { timeout: 8000 });
}

async function fastFinish(page) {
  await page.evaluate(() => {
    ans = Array(Q.length).fill(0);
    qi = Q.length - 1;
    finish();
  });
  await waitResult(page);
}

async function answerOne(page) {
  const before = await page.$eval('#qprog', (el) => el.textContent);
  await page.click('#opts .opt');
  await page.waitForFunction((prev) => document.getElementById('qprog').textContent !== prev, { timeout: 4000 }, before);
}

async function shownUses(page, orderId = ORDER) {
  return page.evaluate((id) => shownOrderUses(id), orderId);
}

async function shot(page, name) {
  await mkdir(ART, { recursive: true });
  await page.screenshot({ path: join(ART, name), fullPage: false });
}

async function newPage(browser, state, opts = {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.setCacheEnabled(false);
  await page.evaluateOnNewDocument(() => {
    try {
      if (sessionStorage.getItem('__test_ready')) return;
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem('__test_ready', '1');
    } catch (e) {}
  });
  await page.setViewport(opts.viewport || { width: 390, height: 844, isMobile: true, hasTouch: true });
  await arm(page, state);
  await page.goto(BASE + (opts.path || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof redeemOrder === 'function' && typeof redeemAccess === 'function');
  return { page, errors };
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('format helpers and the order form stay on this quiz', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  const out = await page.evaluate((order) => {
    const visible = document.body.innerText;
    return {
      good: orderFormatError(order),
      repeat: orderFormatError('P111111111111111111'),
      seq: orderFormatError('P123456789012345678'),
      down: orderFormatError('P987654321098765432'),
      p19: orderFormatError('P9900000000000001378'),
      p19c: classifyInput('P9900000000000001378').type,
      pasted: classifyInput(' 「p7382-910465-18273649」 '),
      code: classifyInput(' ap 7k 3n '),
      quiz: QUIZ_KEY,
      api: API_BASE,
      key: ORDER_USES_KEY,
      unlocked: redeemOrder(order),
      copy: orderSuccessText({ ok: true, uses: 1, remaining: 2 }),
      lastCopy: orderSuccessText({ ok: true, uses: 3, remaining: 0 }),
      laterCopy: orderSuccessText({ ok: true, uses: 4, remaining: 0 }),
      h3: document.querySelector('.code-panel h3').textContent,
      hint: document.querySelector('.code-hint').innerText,
      placeholder: document.getElementById('codeInput').placeholder,
      retry: document.getElementById('btnRetry').textContent,
      visible,
      srcHasOrderRoute: document.documentElement.innerHTML.includes('/order/redeem') || document.documentElement.innerHTML.includes('/order/get') || document.documentElement.innerHTML.includes('/orders/'),
      srcHasOtherKey: document.documentElement.innerHTML.includes('soft_persimmon_order_uses'),
    };
  }, ORDER);
  assert(out.good === '' && out.repeat === 'invalid' && out.seq === 'invalid' && out.down === 'invalid', 'pattern checks ' + JSON.stringify(out));
  assert(out.p19 === 'invalid' && out.p19c === 'order-invalid', '19-digit id');
  assert(out.pasted.type === 'order' && out.pasted.orderId === ORDER, 'paste ' + JSON.stringify(out.pasted));
  assert(out.code.type === 'code' && out.code.code === CODE, 'code ' + JSON.stringify(out.code));
  assert(out.quiz === 'animal' && out.api === API, 'quiz/api');
  assert(out.key === 'animal_past_order_uses', out.key);
  assert(out.unlocked.paidVerified === false && out.unlocked.uses === 1, 'paidVerified must stay false');
  assert(out.copy === '验证成功，还可以测 2 次', out.copy);
  assert(out.lastCopy === '验证成功，这是最后一次', out.lastCopy);
  assert(out.laterCopy === '验证成功', out.laterCopy);
  assert(out.h3 === '输入订单号' && out.placeholder === '订单号', out.h3 + ' ' + out.placeholder);
  assert(out.hint.includes('我的订单') && out.hint.includes('3 次'), out.hint);
  assert(out.retry === '再测一次', out.retry);
  assert(!out.visible.includes('验证码') && !out.visible.includes('localStorage') && !out.visible.includes('paidVerified'), 'buyer-facing copy');
  assert(!out.srcHasOrderRoute && !out.srcHasOtherKey, 'order route or foreign key leaked into the page');
  assertNoOrderNet(state, 'format checks must not hit the network');
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('valid id starts with no order request; refresh, continue, result, and view-last keep the display', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  await openAndSubmit(page, ' p7382 910465-18273649 ');
  await waitQuiz(page);
  const first = await page.evaluate((id) => ({
    uses: shownOrderUses(id),
    other: shownOrderUses('P847291038475610293'),
    toast: document.getElementById('toast').textContent,
    q: document.getElementById('qtext').textContent,
    paid: document.body.innerText.includes('paidVerified'),
  }), ORDER);
  assert(first.uses === 1 && first.other === 0, 'first display ' + JSON.stringify(first));
  assert(first.toast === '验证成功，还可以测 2 次', first.toast);
  assert(first.q.startsWith('周末醒来'), first.q);
  assert(first.paid === false, 'paidVerified rendered');
  assertNoOrderNet(state, 'first start must not call the network');

  await answerOne(page);
  await answerOne(page);
  const mid = await page.evaluate(() => ({ prog: document.getElementById('qprog').textContent, a0: ans[0], a1: ans[1], qi }));
  assert(mid.prog === '3 / 12' && mid.qi === 2 && mid.a0 === 0 && mid.a1 === 0, 'progress ' + JSON.stringify(mid));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#start.active');
  assert(await shownUses(page) === 1, 'refresh changed the display count');
  assert(!(await page.$('#quiz.active')), 'refresh should leave a running attempt on the start screen');
  assertNoOrderNet(state, 'refresh must not call the network');
  await page.click('#btnStart');
  await waitQuiz(page);
  const cont = await page.evaluate(() => ({
    prog: document.getElementById('qprog').textContent,
    qi,
    a0: ans[0],
    a1: ans[1],
  }));
  assert(cont.prog === '3 / 12' && cont.qi === 2 && cont.a0 === 0 && cont.a1 === 0, 'continue ' + JSON.stringify(cont));
  assert(await shownUses(page) === 1, 'continue changed the display count');
  assertNoOrderNet(state, 'continue must not call the network');

  await fastFinish(page);
  const name = await page.$eval('.bname', (el) => el.textContent);
  assert(name.length > 0, 'result missing');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitResult(page);
  assert((await page.$eval('.bname', (el) => el.textContent)) === name, 'result refresh changed the animal');
  assert(await shownUses(page) === 1, 'result refresh changed the display count');
  assertNoOrderNet(state, 'result refresh must not call the network');

  await page.evaluate(() => show('start'));
  await page.click('#btnLast');
  await waitResult(page);
  assert(await shownUses(page) === 1, '查看上次结果 changed the display count');
  assertNoOrderNet(state, '查看上次结果 must not call the network');
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('再测一次 advances the display, and a later entry still opens', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  await openAndSubmit(page, ORDER);
  await waitQuiz(page);
  await fastFinish(page);
  await page.click('#btnRetry');
  await waitQuiz(page);
  assert(await shownUses(page) === 2, 'second display');
  assert((await page.$eval('#toast', (el) => el.textContent)).includes('还可以测 1 次'), 'second toast');
  const restarted = await page.evaluate(() => ({ prog: document.getElementById('qprog').textContent, len: ans.length }));
  assert(restarted.prog === '1 / 12' && restarted.len === 0, 'retest ' + JSON.stringify(restarted));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#start.active');
  assert(await shownUses(page) === 2, 'refresh after the second start changed the display');
  await page.click('#btnStart');
  await waitQuiz(page);
  assert(await shownUses(page) === 2, 'continue after the second start changed the display');
  await fastFinish(page);
  await page.click('#btnRetry');
  await waitQuiz(page);
  assert(await shownUses(page) === 3, 'third display');
  assert((await page.$eval('#toast', (el) => el.textContent)).includes('这是最后一次'), 'third toast');
  await fastFinish(page);
  await page.click('#btnRetry');
  await waitQuiz(page);
  await page.waitForFunction(() => document.getElementById('toast').textContent === '验证成功');
  const after = await page.evaluate((id) => ({
    quiz: document.getElementById('quiz').classList.contains('active'),
    toast: document.getElementById('toast').textContent,
    uses: shownOrderUses(id),
  }), ORDER);
  assert(after.quiz, 'a later entry must still open the quiz');
  assert(after.toast === '验证成功' && !after.toast.includes('用完') && !after.toast.includes('暂时验证不了'), after.toast);
  assert(after.uses === 4, 'later entry still records a display count');
  assertNoOrderNet(state, 'later entry must not call the network');
  assert(errors.length === 0, errors.join('\n'));
  await shot(page, 'animal-order-still-opens.png');
  await page.close();
});

test('19-digit, repeating, and sequence ids are rejected locally', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  await openAndSubmit(page, 'P111111111111111111');
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('格式不对'));
  assert(!(await page.$('#quiz.active')), 'repeating id started the quiz');
  await page.$eval('#codeInput', (el) => { el.value = 'P123456789012345678'; });
  await page.click('#btnCodeOk');
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('格式不对'));
  await page.$eval('#codeInput', (el) => { el.value = 'P987654321098765432'; });
  await page.click('#btnCodeOk');
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('格式不对'));
  await page.$eval('#codeInput', (el) => { el.value = 'P9900000000000001378'; });
  await page.click('#btnCodeOk');
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('格式不对'));
  assert(!(await page.$('#quiz.active')), '19-digit id started the quiz');
  assert(await shownUses(page) === 0, 'rejected ids changed the display count');
  assertNoOrderNet(state, 'rejected ids must not hit the network');
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('display counts are stored separately per order id', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  await openAndSubmit(page, ORDER);
  await waitQuiz(page);
  await page.evaluate(() => clearUnlock());
  await page.evaluate(() => show('start'));
  await openAndSubmit(page, OTHER);
  await waitQuiz(page);
  const uses = await page.evaluate((ids) => ({ a: shownOrderUses(ids[0]), b: shownOrderUses(ids[1]) }), [ORDER, OTHER]);
  assert(uses.a === 1 && uses.b === 1, JSON.stringify(uses));
  assertNoOrderNet(state, 'second id must not hit the network');
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('access code hits the vault and does not touch Mantle when the vault has it', async (browser) => {
  const state = freshState();
  const { page, errors } = await newPage(browser, state);
  await openAndSubmit(page, 'ap7k3n');
  await waitQuiz(page);
  assert(state.vaultPosts === 1 && state.bodies[0].quiz === 'animal' && state.bodies[0].code === CODE, 'vault body', state);
  assert(!state.bodies[0].orderId, 'code redeem must not send orderId', state);
  assert(state.mantleGets === 0 && state.mantleDecr === 0, 'vault hit must not touch Mantle', state);
  assert(!state.urls.some((u) => u.includes('/order') || u.includes('/orders')), 'code path called orders', state);
  const toast = await page.$eval('#toast', (el) => el.textContent);
  assert(toast.includes('还可以测 2 次'), toast);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#start.active');
  await page.click('#btnStart');
  await waitQuiz(page);
  assert(state.vaultPosts === 1, 'unlocked code refresh must not redeem again', state);
  await fastFinish(page);
  await page.click('#btnRetry');
  await page.waitForSelector('#start.active');
  await page.click('#btnStart');
  await waitQuiz(page);
  assert(state.vaultPosts === 1 && state.mantleDecr === 0, 'code 再测一次 must not redeem again', state);
  assert(errors.length === 0, errors.join('\n'));
  await page.close();
});

test('vault miss falls back to Mantle ap, exhausted vault does not', async (browser) => {
  const miss = freshState();
  miss.vaultMode = 'not_found';
  const opened = await newPage(browser, miss);
  await openAndSubmit(opened.page, CODE);
  await waitQuiz(opened.page);
  assert(miss.vaultPosts === 1 && miss.mantleGets === 1 && miss.mantleDecr === 1 && miss.mantleIncr === 0, 'mantle fallback', miss);
  assert(miss.mantleRemaining === 2, 'remaining after decr', miss);
  assert(miss.urls.some((u) => u.includes('/ap/' + CODE)), 'mantle collection', miss);
  assert(!miss.urls.some((u) => u.includes('/orders/')), 'mantle orders', miss);
  await opened.page.close();

  const done = freshState();
  done.vaultMode = 'exhausted';
  const second = await newPage(browser, done);
  await openAndSubmit(second.page, CODE);
  await second.page.waitForFunction(() => document.getElementById('toast').textContent.includes('次数已经用完'));
  const onQuiz = await second.page.$eval('#quiz', (el) => el.classList.contains('active'));
  assert(!onQuiz && done.mantleGets === 0 && done.mantleDecr === 0 && done.vaultPosts === 1, 'exhausted vault fell through', done);
  await second.page.close();
});

test('vault outage falls back to Mantle and a negative decrement is rolled back', async (browser) => {
  const down = freshState();
  down.vaultMode = 'down';
  const opened = await newPage(browser, down);
  await openAndSubmit(opened.page, CODE);
  await waitQuiz(opened.page);
  assert(down.vaultPosts === 1 && down.mantleDecr === 1 && down.mantleRemaining === 2, 'outage fallback', down);
  await opened.page.close();

  const rollback = freshState();
  rollback.vaultMode = 'not_found';
  rollback.mantleRemaining = 1;
  rollback.mantleDecrResult = -1;
  const page2 = await newPage(browser, rollback);
  await openAndSubmit(page2.page, CODE);
  await page2.page.waitForFunction(() => document.getElementById('toast').textContent.includes('次数已经用完'));
  const onQuiz = await page2.page.$eval('#quiz', (el) => el.classList.contains('active'));
  assert(!onQuiz && rollback.mantleDecr === 1 && rollback.mantleIncr === 1, 'rollback', rollback);
  await page2.page.close();

  const both = freshState();
  both.vaultMode = 'down';
  both.mantleMissing = true;
  const page3 = await newPage(browser, both);
  await openAndSubmit(page3.page, CODE);
  await page3.page.waitForFunction(() => document.getElementById('toast').textContent.includes('网络异常'));
  assert(await page3.page.evaluate(() => !isUnlocked()), 'network failure unlocked');
  await page3.page.close();
});

test('query string still starts an order id locally or redeems a legacy code', async (browser) => {
  const order = freshState();
  const p1 = await newPage(browser, order, { path: '?code=' + ORDER });
  await waitQuiz(p1.page);
  assert(await shownUses(p1.page) === 1, 'query order display');
  assertNoOrderNet(order, 'query order must not call the network');
  await p1.page.close();

  const code = freshState();
  const p2 = await newPage(browser, code, { path: '?code=' + CODE });
  await waitQuiz(p2.page);
  assert(code.vaultPosts === 1 && code.bodies[0].code === CODE && code.mantleGets === 0, 'query code', code);
  await p2.page.close();
});

test('layout at 320 and 390 keeps the order field on screen', async (browser) => {
  for (const width of [320, 390]) {
    const state = freshState();
    const { page, errors } = await newPage(browser, state, { viewport: { width, height: 780, isMobile: true, hasTouch: true } });
    await page.click('#btnStart');
    await page.waitForSelector('#codeMask.show');
    await page.$eval('#codeInput', (el, v) => { el.value = v; }, ORDER);
    const box = await page.evaluate(() => {
      const panel = document.querySelector('.code-panel');
      const input = document.getElementById('codeInput');
      const r = panel.getBoundingClientRect();
      return {
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        left: r.left,
        right: r.right,
        inputFit: input.scrollWidth <= input.clientWidth + 2,
      };
    });
    assert(box.sw <= box.cw + 1, width + ' overflow ' + JSON.stringify(box));
    assert(box.left >= -1 && box.right <= width + 1, width + ' panel ' + JSON.stringify(box));
    assert(box.inputFit === true, width + ' order id clipped ' + JSON.stringify(box));
    await shot(page, `animal-${width}-order.png`);
    assertNoOrderNet(state, 'opening the form must not redeem');
    assert(errors.length === 0, errors.join('\n'));
    await page.close();
  }
});

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 300));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    `--host-resolver-rules=MAP ${API_HOST} 127.0.0.1, MAP mantledb.sh 127.0.0.1`,
  ],
});

let failed = 0;
try {
  for (const c of cases) {
    try {
      await c.fn(browser);
      console.log('ok  ' + c.name);
    } catch (e) {
      failed++;
      console.error('FAIL ' + c.name);
      console.error(e && e.stack || e);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log(cases.length + ' passed');
