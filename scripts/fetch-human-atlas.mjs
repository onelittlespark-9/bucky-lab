import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = new URL("../public/models/human-atlas/", import.meta.url);
const BASE = "https://raw.githubusercontent.com/ashemag/human-atlas/main/public/models/";
const manifestUrl = `${BASE}atlas.json`;

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

const out = { ...manifest, chunks: [] };
for (const chunk of manifest.chunks) {
  const filename = String(chunk.url).split("/").pop();
  if (!filename) throw new Error("Human Atlas chunk has no filename.");
  const target = new URL(filename, ROOT);
  const existing = await readFile(target).catch(() => null);
  if (!existing || existing.byteLength !== chunk.bytes) {
    console.log(`Downloading Human Atlas ${filename} (${Math.round(chunk.bytes / 1024 / 1024)} MB)`);
    await download(`${BASE}${filename}`, target);
  }
  out.chunks.push({ url: `/models/human-atlas/${filename}`, bytes: chunk.bytes });
}

await writeFile(new URL("atlas.json", ROOT), JSON.stringify(out));
await writeFile(new URL("VERSION", ROOT), `${manifest.version}\n`);
console.log(`Human Atlas ready: ${manifest.parts.length} parts, ${manifest.chunks.length} chunks, ${manifest.triangles} triangles.`);
