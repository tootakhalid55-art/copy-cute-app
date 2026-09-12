// Writes public/version.txt at build time so the deployed commit is visible
// at https://<site>/version.txt — used to verify the auto-deploy actually
// delivered a push (the sandbox that develops this app cannot reach the VPS).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {
  // not a git checkout (e.g. tarball) — keep "unknown"
}
writeFileSync("public/version.txt", `${commit}\n${new Date().toISOString()}\n`);
console.log(`[version] ${commit.slice(0, 8)}`);
