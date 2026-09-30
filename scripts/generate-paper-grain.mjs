import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// Ordinary surfaces use the final paper pixels, without runtime background
// blending. Keep raw grain only for the isolated, multicolored artwork layers.
const size = 256;
const alpha = 153;
// Keep these colors in sync with their semantic tokens in globals.css.
const surfaces = [
  ["canvas", [244, 241, 235], 1],
  ["soft", [233, 238, 230], 1],
  ["muted", [237, 234, 225], 1],
  ["raised", [255, 253, 248], 1],
  ["success", [232, 238, 228], 1],
  ["accent", [244, 231, 220], 1],
  ["floating", [244, 241, 235], 0.94],
].map(([name, color, opacity]) => ({
  name,
  color,
  opacity,
  pixels: Buffer.alloc(size * (size * 4 + 1)),
}));
let seed = 0x706f6b6f;
const pixels = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const gray = seed >>> 24;
    pixels.set([gray, gray, gray, alpha], offset);
    for (const surface of surfaces) {
      const grainAlpha = alpha / 255;
      const baseAlpha = surface.opacity;
      const combinedAlpha = grainAlpha + baseAlpha * (1 - grainAlpha);
      const color = surface.color.map((base) => {
        const overlay = 255 - (2 * (255 - base) * (255 - gray)) / 255;
        // Alpha-aware overlay, including the floating header's translucent base.
        const premultiplied =
          (1 - grainAlpha) * baseAlpha * base +
          (1 - baseAlpha) * grainAlpha * gray +
          baseAlpha * grainAlpha * overlay;
        return Math.round(premultiplied / combinedAlpha);
      });
      surface.pixels.set([...color, Math.round(combinedAlpha * 255)], offset);
    }
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
  ...surfaces.map(({ name, pixels }) => [`paper-${name}.png`, pixels]),
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
