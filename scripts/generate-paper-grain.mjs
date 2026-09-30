import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// Keep the raw grain for surfaces and colored artwork. The page canvas gets
// the same grain precomposed, so Safari does not need to blend a tiled background.
const size = 256;
const canvas = [244, 241, 235]; // --canvas in src/app/globals.css (#f4f1eb).
const alpha = 153;
let seed = 0x706f6b6f;
const pixels = Buffer.alloc(size * (size * 4 + 1));
const canvasPixels = Buffer.alloc(pixels.length);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const gray = seed >>> 24;
    pixels.set([gray, gray, gray, alpha], offset);
    // Overlay on the light canvas, followed by the raw texture's alpha blend.
    const color = canvas.map((base) => {
      const overlay = 255 - (2 * (255 - base) * (255 - gray)) / 255;
      return Math.round(base + (overlay - base) * (alpha / 255));
    });
    canvasPixels.set([...color, 255], offset);
  }
}

function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(payload.length + 8);
  result.writeUInt32BE(data.length, 0);
  payload.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8; // Eight-bit RGBA, no interlacing.
header[9] = 6;
for (const [name, data] of [
  ["paper-grain.png", pixels],
  ["paper-canvas.png", canvasPixels],
]) {
  writeFileSync(
    new URL(`../public/${name}`, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(data)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
