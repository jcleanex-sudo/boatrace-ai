import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const shouldInstall =
  process.env.RENDER ||
  process.env.RENDER_SERVICE_ID ||
  process.env.BETAKO_INSTALL_PYTHON_DEPS === "true";

if (!shouldInstall) {
  console.log("[Python] Skipping dependency install outside Render.");
  process.exit(0);
}

const depsDir = path.resolve(process.cwd(), ".python-packages");
const reqFile = path.resolve(process.cwd(), "scripts/requirements.txt");
const pythonBin = process.env.PYTHON_BIN || "/usr/bin/python3";

console.log(`[Python] Installing dependencies into ${depsDir}`);
rmSync(depsDir, { recursive: true, force: true });

const result = spawnSync(
  pythonBin,
  ["-m", "pip", "install", "--target", depsDir, "--upgrade", "-r", reqFile],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
