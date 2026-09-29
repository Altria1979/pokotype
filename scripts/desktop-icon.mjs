import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Keep the existing brand source and only check in the five desktop bundle icons.
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), "pokotype-icons-"));
try {
  execFileSync(process.execPath, [
    resolve(root, "node_modules/@tauri-apps/cli/tauri.js"),
    "icon", resolve(root, "public/icon.svg"), "--output", temporary,
  ], { cwd: root, stdio: "inherit" });
  const output = resolve(root, "src-tauri/icons");
  await mkdir(output, { recursive: true });
  for (const name of ["32x32.png", "128x128.png", "128x128@2x.png", "icon.icns", "icon.ico"]) {
    await copyFile(resolve(temporary, name), resolve(output, name));
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
