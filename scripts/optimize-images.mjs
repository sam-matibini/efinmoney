/**
 * One-shot (re-runnable) image optimization for PageSpeed:
 * - Proper-size favicons / apple-touch / favicon.ico
 * - Smaller app logo + icon PNGs
 * - Alice avatar downscale
 * - Landing photos → WebP (max width 1600)
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const assets = join(root, "src", "assets");
const pub = join(root, "public");

function kb(n) {
  return `${(n / 1024).toFixed(1)} KB`;
}

function log(from, to, before, after) {
  console.log(`  ${from} → ${to}: ${kb(before)} → ${kb(after)}`);
}

/** Single-PNG ICO (Vista+). */
function pngToIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuffer]);
}

async function writePng(src, dest, { width, height, fit = "cover" } = {}) {
  const before = existsSync(dest) ? readFileSync(dest).length : 0;
  let pipeline = sharp(src);
  if (width || height) pipeline = pipeline.resize(width, height, { fit, withoutEnlargement: true });
  const buf = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
  writeFileSync(dest, buf);
  log(basename(src), basename(dest), before || readFileSync(src).length, buf.length);
  return buf;
}

async function replacePng(path, { width, height, fit = "inside" } = {}) {
  const before = readFileSync(path).length;
  const base = sharp(path).resize(width, height, { fit, withoutEnlargement: true });
  const [palette, truecolor] = await Promise.all([
    base.clone().png({ compressionLevel: 9, palette: true, quality: 85, effort: 10 }).toBuffer(),
    base.clone().png({ compressionLevel: 9 }).toBuffer(),
  ]);
  const out = palette.length <= truecolor.length ? palette : truecolor;
  writeFileSync(path, out);
  log(basename(path), basename(path), before, out.length);
}

async function toWebp(srcPath, { maxWidth = 1600, quality = 78 } = {}) {
  const before = readFileSync(srcPath).length;
  const dest = srcPath.replace(/\.(jpe?g|png)$/i, ".webp");
  const meta = await sharp(srcPath).metadata();
  let pipeline = sharp(srcPath);
  if (meta.width && meta.width > maxWidth) {
    pipeline = pipeline.resize(maxWidth, null, { withoutEnlargement: true });
  }
  const buf = await pipeline.webp({ quality, effort: 6 }).toBuffer();
  writeFileSync(dest, buf);
  log(basename(srcPath), basename(dest), before, buf.length);
  if (dest !== srcPath && existsSync(srcPath)) {
    try {
      unlinkSync(srcPath);
      console.log(`    removed ${basename(srcPath)}`);
    } catch (err) {
      console.warn(`    keep ${basename(srcPath)} (could not delete: ${err.code || err.message})`);
    }
  }
  return dest;
}

const iconSrc = join(assets, "efin-icon.png");

console.log("Favicons");
await writePng(iconSrc, join(pub, "favicon-16x16.png"), { width: 16, height: 16 });
await writePng(iconSrc, join(pub, "favicon-32x32.png"), { width: 32, height: 32 });
await writePng(iconSrc, join(pub, "apple-touch-icon.png"), { width: 180, height: 180 });
{
  const png32 = await sharp(iconSrc).resize(32, 32).png().toBuffer();
  const before = existsSync(join(pub, "favicon.ico")) ? readFileSync(join(pub, "favicon.ico")).length : 0;
  const ico = pngToIco(png32, 32);
  writeFileSync(join(pub, "favicon.ico"), ico);
  log("efin-icon.png", "favicon.ico", before, ico.length);
}

console.log("\nBrand assets");
await replacePng(iconSrc, { width: 256, height: 256, fit: "inside" });
await replacePng(join(assets, "efin-logo-new.png"), { width: 256, height: 256, fit: "inside" });
if (existsSync(join(assets, "efin-logo.png"))) {
  await replacePng(join(assets, "efin-logo.png"), { width: 320, height: 240, fit: "inside" });
}
await replacePng(join(pub, "email-logo.png"), { width: 256, height: 256, fit: "inside" });

console.log("\nAlice avatar");
await replacePng(join(pub, "alice.png"), { width: 192, height: 192, fit: "cover" });

console.log("\nLanding photos → WebP");
const landing = [
  "landing-africa-hero.jpg",
  "landing-africa-band.jpg",
  "landing-b2b-phone.jpg",
  "landing-tourism-kenya.jpg",
  "landing-tourism-victoria-falls.jpg",
  "landing-tourism-zanzibar.jpg",
  "landing-feature-security.jpg",
  "landing-feature-instant.jpg",
  "landing-feature-corridors.jpg",
  "landing-senders.jpg",
  "landing-receivers.jpg",
  "Efinconnect.jpeg",
  "landing-efinconnect-intro.jpeg",
];
for (const name of landing) {
  const p = join(assets, name);
  if (!existsSync(p)) {
    console.log(`  skip missing ${name}`);
    continue;
  }
  const maxWidth = name.includes("feature") || name.includes("b2b") ? 900 : 1600;
  await toWebp(p, { maxWidth, quality: 78 });
}

console.log("\nDone.");
