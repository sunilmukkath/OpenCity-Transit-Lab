import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "maplibre-gl", "dist");
const pub = join(root, "public");

mkdirSync(pub, { recursive: true });

const files = [
  "maplibre-gl-worker.mjs",
  "maplibre-gl-shared.mjs",
  "maplibre-gl.mjs",
];

for (const file of files) {
  const from = join(dist, file);
  if (!existsSync(from)) {
    console.warn(`[copy-maplibre] missing ${file}`);
    continue;
  }
  copyFileSync(from, join(pub, file));
  console.log(`[copy-maplibre] ${file}`);
}
