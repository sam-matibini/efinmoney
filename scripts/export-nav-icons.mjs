import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourceDir = join(root, "src", "assets", "nav-icons");
const outputDir = join(root, "public", "icons", "nav");

mkdirSync(outputDir, { recursive: true });

const files = readdirSync(sourceDir).filter((name) => name.endsWith(".svg"));

for (const file of files) {
  const base = file.replace(/\.svg$/, "");
  const svg = readFileSync(join(sourceDir, file));

  writeFileSync(join(outputDir, `${base}.svg`), svg);

  await sharp(svg).resize(128, 128).png({ compressionLevel: 9 }).toFile(join(outputDir, `${base}.png`));
  await sharp(svg).resize(64, 64).png({ compressionLevel: 9 }).toFile(join(outputDir, `${base}@1x.png`));
}

console.log(`Exported ${files.length} nav icons to public/icons/nav/`);
