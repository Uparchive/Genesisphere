import { readdir, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "genesisphere-check-"));

async function collectJavaScript(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScript(path));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

function check(path) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`JavaScript syntax check failed: ${relative(root, path)}`);
  }
}

try {
  const requiredEntries = ["index.html", "src/app.js", "src/auth/auth-gate.js", "src/cloudflare/worker.js", "wrangler.toml"];
  for (const path of requiredEntries) await readFile(join(root, path));

  const sourceFiles = await collectJavaScript(join(root, "src"));
  for (const path of sourceFiles) check(path);

  const html = await readFile(join(root, "index.html"), "utf8");
  const inlineModule = [...html.matchAll(/<script\b(?=[^>]*\btype=["']module["'])(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)][0]?.[1];
  if (!inlineModule) throw new Error("No inline module script was found in index.html");
  const inlinePath = join(temporaryDirectory, "index-inline.mjs");
  await writeFile(inlinePath, inlineModule);
  check(inlinePath);

  process.stdout.write(`Static app validation passed (${sourceFiles.length} source modules and index.html inline module).\n`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
