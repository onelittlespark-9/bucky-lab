import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = new URL("../public/models/human-atlas/", import.meta.url);
const BASE = "https://raw.githubusercontent.com/ashemag/human-atlas/main/public/models/";
const manifestUrl = `${BASE}atlas.json`;

// Keep only systems actually consumed by the room overlays and radiograph projectors.
// This avoids shipping unrelated atlas systems and, when the upstream atlas chunks are
// system-grouped, prevents those chunks being downloaded/deployed at all.
const USED_SYSTEMS = new Set([
  "skeletal",
  "integumentary",
  "muscular",
  "respiratory",
  "cardiac",
  "digestive",
  "urinary",
  "arterial",
  "venous",
  "lymphatic",
  "nervous",
]);

async function download(url, target) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Human Atlas download failed (${response.status}): ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}

await mkdir(ROOT, { recursive: true });
const manifestResponse = await fetch(manifestUrl);
if (!manifestResponse.ok) throw new Error(`Could not download Human Atlas manifest (${manifestResponse.status}).`);
const manifest = await manifestResponse.json();
if (!Array.isArray(manifest.parts) || !Array.isArray(manifest.chunks)) throw new Error("Human Atlas manifest is invalid.");

const selectedParts = manifest.parts.filter(part => USED_SYSTEMS.has(String(part.system)));
const usedChunkIds = [...new Set(selectedParts.map(part => part.chunk))].sort((a, b) => a - b);
const remap = new Map(usedChunkIds.map((oldIndex, newIndex) => [oldIndex, newIndex]));
const outChunks = [];
let totalBytes = 0;

for (const oldIndex of usedChunkIds) {
  const chunk = manifest.chunks[oldIndex];
  if (!chunk) throw new Error(`Human Atlas chunk ${oldIndex} is missing.`);
  const filename = String(chunk.url).split("/").pop();
  if (!filename) throw new Error("Human Atlas chunk has no filename.");
  const target = new URL(filename, ROOT);
  const existing = await readFile(target).catch(() => null);
  if (!existing || existing.byteLength !== chunk.bytes) {
    console.log(`Downloading Human Atlas ${filename} (${Math.round(chunk.bytes / 1024 / 1024)} MB)`);
    await download(`${BASE}${filename}`, target);
  }
  outChunks.push({ url: `/models/human-atlas/${filename}`, bytes: chunk.bytes });
  totalBytes += chunk.bytes;
}

const parts = selectedParts.map(part => ({ ...part, chunk: remap.get(part.chunk) }));
const out = {
  ...manifest,
  parts,
  chunks: outChunks,
  sourcePartCount: manifest.parts.length,
  sourceChunkCount: manifest.chunks.length,
  runtimePartCount: parts.length,
  runtimeChunkCount: outChunks.length,
};

await writeFile(new URL("atlas.json", ROOT), JSON.stringify(out));
await writeFile(new URL("VERSION", ROOT), `${manifest.version}\n`);
console.log(`Human Atlas ready: ${parts.length}/${manifest.parts.length} parts, ${outChunks.length}/${manifest.chunks.length} chunks, ${Math.round(totalBytes / 1024 / 1024)} MB runtime data.`);
