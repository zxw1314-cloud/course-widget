const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function targets() { return await (await fetch('http://127.0.0.1:9222/json')).json(); }
async function openWs(url) { const ws = new WebSocket(url); await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); }); return ws; }
function sender(ws) { let id = 0; const pending = new Map(); ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } }); return (method, params = {}) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); }); }
(async () => {
  const t0 = await targets();
  const widget = t0.find(t => t.type === 'page' && t.title === '桌面课表');
  if (!widget) { console.log('NO_WIDGET'); process.exit(1); }
  const ws = await openWs(widget.webSocketDebuggerUrl); const send = sender(ws);
  await sleep(1500);
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
  const w1 = JSON.parse(await ev(`JSON.stringify({ ow: window.outerWidth, ct: window.__ctState(), days: document.querySelectorAll('.day').length })`));
  console.log('W1:', JSON.stringify(w1));
  // 模拟鼠标在空白处（body 上）
  await ev(`document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))`);
  const ctBlank = await ev(`window.__ctState()`);
  console.log('CT_OVER_BLANK:', ctBlank);
  // 模拟鼠标在一个日期格上
  await ev(`document.querySelectorAll('.day')[3].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))`);
  const ctDay = await ev(`window.__ctState()`);
  console.log('CT_OVER_DAY:', ctDay);
  // 点日期 → 弹窗
  await ev(`document.querySelectorAll('.day')[3].click()`);
  await sleep(2200);
  const t1 = await targets();
  const popup = t1.find(t => t.type === 'page' && String(t.title).includes('当日'));
  console.log('POPUP_OPENED:', popup ? 'yes' : 'no');
  if (popup) { const ws2 = await openWs(popup.webSocketDebuggerUrl); const s2 = sender(ws2); await s2('Runtime.evaluate', { expression: `window.close()` }); ws2.close(); }
  await sleep(1500);
  const w2 = JSON.parse(await ev(`JSON.stringify({ ow: window.outerWidth, ct: window.__ctState() })`));
  console.log('W2_AFTER_CLOSE:', JSON.stringify(w2));
  ws.close(); process.exit(0);
})();