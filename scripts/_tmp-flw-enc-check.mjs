import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function len(label, v) {
  console.log(label, "len=", v.length, "prefix=", v.slice(0, 8));
}

for (const file of ["migration-export/secrets.env", ".env"]) {
  try {
    const text = readFileSync(file, "utf8");
    const enc = text.split(/\r?\n/).find((l) => l.startsWith("FLW_ENCRYPTION_KEY="));
    const sec = text.split(/\r?\n/).find((l) => l.startsWith("FLW_SECRET_KEY="));
    if (enc) len(`${file} ENCRYPTION`, enc.slice("FLW_ENCRYPTION_KEY=".length).trim().replace(/^["']|["']$/g, ""));
    if (sec) {
      const seckey = sec.slice("FLW_SECRET_KEY=".length).trim().replace(/^["']|["']$/g, "");
      len(`${file} SECRET`, seckey);
      const md5 = createHash("md5").update(seckey).digest("hex");
      const derived = seckey.replace(/^FLWSECK-/, "").slice(0, 12) + md5.slice(-12);
      len(`${file} DERIVED`, derived);
      if (enc) {
        const e = enc.slice("FLW_ENCRYPTION_KEY=".length).trim().replace(/^["']|["']$/g, "");
        console.log(`${file} enc===derived`, e === derived);
      }
    }
  } catch (e) {
    console.log(file, e.message);
  }
}
