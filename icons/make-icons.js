const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(data) {
  let value = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    value ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, checksum]);
}

function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = draw(x, y, size);
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insideRound(x, y, left, top, right, bottom, radius) {
  if (x < left || y < top || x > right || y > bottom) return false;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function draw(x, y, size) {
  const px = x + 0.5;
  const py = y + 0.5;
  const margin = size * 0.06;
  if (!insideRound(px, py, margin, margin, size - margin, size - margin, size * 0.22)) return [0, 0, 0, 0];
  const pageX = size * 0.28;
  const pageY = size * 0.18;
  const pageW = size * 0.44;
  const pageH = size * 0.64;
  if (insideRound(px, py, pageX, pageY, pageX + pageW, pageY + pageH, size * 0.08)) {
    const fold = size * 0.14;
    if (px > pageX + pageW - fold && py < pageY + fold) {
      const localX = px - (pageX + pageW - fold);
      const localY = py - pageY;
      if (localX + localY < fold) return [127, 29, 29, 255];
    }
    const line = (y0, width) => py > y0 && py < y0 + Math.max(1, size * 0.035) && px > pageX + pageW * 0.16 && px < pageX + pageW * width;
    if (line(pageY + pageH * 0.28, 0.78) || line(pageY + pageH * 0.44, 0.84) || line(pageY + pageH * 0.6, 0.7) || line(pageY + pageH * 0.76, 0.8)) {
      return [127, 29, 29, 255];
    }
    return [255, 250, 245, 255];
  }
  return [127, 29, 29, 255];
}

const dir = __dirname;
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(dir, `icon-${size}.png`), png(size, draw));
}
