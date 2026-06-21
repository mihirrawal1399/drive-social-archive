import test from "node:test";
import assert from "node:assert/strict";
import { ArchiveService } from "../src/archive.ts";
import type { ArchivedContent, PlatformAdapter } from "../src/types.ts";

class MemoryDrive {
  json = new Map<string, unknown>(); folders = new Set<string>(); uploads: string[] = [];
  async readJson<T>(p: string, f: T) { return (this.json.get(p) ?? f) as T; }
  async writeJson(p: string, d: unknown) { this.json.set(p, structuredClone(d)); }
  async createFolder(p: string) { this.folders.add(p); return p; }
  async folderExists(p: string) { return this.folders.has(p); }
  async uploadFile(folder: string, _file: string, name: string) { this.uploads.push(`${folder}/${name}`); return name; }
}

test("sync is idempotent and keeps state in Drive", async () => {
  const drive = new MemoryDrive(); let downloads = 0;
  const adapter: PlatformAdapter = {
    platform: "youtube",
    async discover() { return [{ id: "abc", url: "https://youtu.be/abc" }]; },
    async download(_item, destination) {
      downloads++;
      const fs = await import("node:fs/promises"); await fs.mkdir(destination, { recursive: true }); await fs.writeFile(`${destination}/media.mp4`, "x");
      return { id: "abc", platform: "youtube", type: "video", hashtags: [], postUrl: "https://youtu.be/abc", publishedAt: "2026-01-01T00:00:00Z", archivedAt: new Date().toISOString(), sourceQuality: "downloaded", mediaFiles: ["media.mp4"] } satisfies ArchivedContent;
    }
  };
  const service = new ArchiveService(drive as never, `${process.cwd()}/.social-archive-tmp/test`);
  assert.equal((await service.sync(adapter)).archived, 1);
  assert.equal((await service.sync(adapter)).archived, 0);
  assert.equal(downloads, 1);
  assert.deepEqual(drive.json.get("indexes/youtube.json"), { archivedIds: ["abc"] });
  assert.deepEqual((drive.json.get("YouTube/video_abc/post.json") as ArchivedContent).mediaFiles, ["video.mp4"]);
});
