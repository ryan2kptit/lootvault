// Tiny dependency-free PNG renderer for seed artwork: a framed gradient "card" with a gem.
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** @param {{ hue: number, size?: number }} options */
export function renderCardPng({ hue, size = 384 }) {
  const top = hsl(hue, 0.65, 0.55);
  const bottom = hsl((hue + 60) % 360, 0.7, 0.25);
  const gem = hsl((hue + 180) % 360, 0.85, 0.7);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const center = size / 2;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const t = (x + y) / (2 * size);
      let color = top.map((c, i) => Math.round(c + (bottom[i] - c) * t));
      if ((x + y) % 48 < 4) color = color.map((c) => Math.min(255, c + 25)); // stripes
      const border = Math.min(x, y, size - 1 - x, size - 1 - y);
      if (border < 10) color = [235, 215, 160]; // gold frame
      const distance = Math.hypot(x - center, y - center);
      if (distance < size * 0.18) color = gem.map((c) => Math.max(0, Math.round(c - distance / 3)));
      raw.set(color, row + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
