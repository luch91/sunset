import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const allowed = /\.(?:css|html|js|json|md|mjs|rs|toml|ts|tsx|txt|yml|yaml)$/i;
const banned = /\u2014/u;
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => file && (allowed.test(file) || file.endsWith("Cargo.lock")) && existsSync(file));

const failures = files.filter((file) => banned.test(readFileSync(file, "utf8")));
if (failures.length) {
  console.error(`U+2014 found in:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Checked ${files.length} text files. No U+2014 found.`);
