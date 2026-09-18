// Wipe runtime progress so the demo starts clean. Usage: npm run demo:reset
import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "data", "progress");
let n = 0;
for (const f of readdirSync(dir)) {
  if (f.endsWith(".json")) {
    unlinkSync(join(dir, f));
    n++;
  }
}
console.log(`demo-reset: removed ${n} progress file(s) from data/progress`);
