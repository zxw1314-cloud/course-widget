// 生成 32x32 图标 icon.png（纯 Node，无依赖）
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const W = 32, H = 32;
const px = new Uint8Array(W * H * 4);
function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = a;
}
function inRound(x, y) {
  const cx = 15.5, cy = 15.5, r = 14;
  const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
  const rr = 6;
  if (dx > r - rr || dy > r - rr) {
    const ddx = Math.max(r - rr - dx, 0), ddy = Math.max(r - rr - dy, 0);
    return Math.sqrt(ddx*ddx + ddy*ddy) <= rr;
  }
  return true;
}
// 背景：圆角蓝
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (inRound(x, y)) set(x, y, 64, 130, 255, 255);
}
// 顶部白色标题条（日历风格）
for (let y = 4; y <= 9; y++) for (let x = 5; x <= 26; x++) if (inRound(x,y)) set(x, y, 240, 246, 255, 255);
// 两个"挂环"
for (let x = 10; x <= 12; x++) set(x, 2, 255, 255, 255, 255);
for (let x = 20; x <= 22; x++) set(x, 2, 255, 255, 255, 255);
// 白色网格点(代表日期/课表)
for (let y = 14; y <= 26; y += 4) for (let x = 7; x <= 25; x += 4) set(x, y, 255, 255, 255, 255);

// ---- PNG 编码 ----
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const o = y * (1 + W * 4) + 1 + x * 4;
    raw[o] = px[i]; raw[o+1] = px[i+1]; raw[o+2] = px[i+2]; raw[o+3] = px[i+3];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(path.join(__dirname, 'assets', 'icon.png'), png);
console.log('icon.png written:', png.length, 'bytes');