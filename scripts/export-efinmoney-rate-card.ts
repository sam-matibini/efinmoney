import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRateCardWorkbookToFile } from "../src/lib/pricing/exportRateCardWorkbook.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../public/docs/eFinMoney-Rates-and-Pricing-Summary.xlsx");
mkdirSync(dirname(out), { recursive: true });
writeRateCardWorkbookToFile(out);
console.log(`wrote ${out}`);
