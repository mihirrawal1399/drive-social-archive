import fs from "node:fs/promises";
import path from "node:path";
import type { ArchiveIndex, Platform, PlatformAdapter, SyncState } from "./types.js";
import type { DriveStore } from "./drive.js";

const platformFolder = (p: Platform) => p === "instagram" ? "Instagram" : "YouTube";

export class ArchiveService {
  constructor(private drive: DriveStore, private tempRoot: string) {}

  async sync(adapter: PlatformAdapter): Promise<{ discovered: number; archived: number; skipped: number; failed: number }> {
    const platform = adapter.platform;
    const indexPath = `indexes/${platform}.json`;
    const state = await this.drive.readJson<SyncState>("sync-state.json", {});
    const index = await this.drive.readJson<ArchiveIndex>(indexPath, { archivedIds: [] });
    const known = new Set(index.archivedIds);
    const startedAt = new Date().toISOString();
    const items = await adapter.discover(state[platform]?.lastSyncAt);
    let archived = 0, skipped = 0, failed = 0;

    for (const item of items) {
      if (known.has(item.id)) { skipped++; continue; }
      const tmp = path.join(this.tempRoot, platform, item.id);
      try {
        await fs.rm(tmp, { recursive: true, force: true });
        const content = await adapter.download(item, tmp);
        const folderName = `${content.type}_${content.id}`;
        const folder = await this.drive.createFolder(`${platformFolder(platform)}/${folderName}`);
        const archivedMediaFiles: string[] = [];
        for (const [index, file] of content.mediaFiles.entries()) {
          const archivedName = content.mediaFiles.length === 1 ? "video" + path.extname(file) : `media_${index + 1}${path.extname(file)}`;
          await this.drive.uploadFile(folder, path.join(tmp, file), archivedName);
          archivedMediaFiles.push(archivedName);
        }
        if (content.thumbnailFile) await this.drive.uploadFile(folder, path.join(tmp, content.thumbnailFile), "thumbnail.jpg");
        await this.drive.writeJson(`${platformFolder(platform)}/${folderName}/post.json`, {
          ...content,
          mediaFiles: archivedMediaFiles,
          thumbnailFile: content.thumbnailFile ? "thumbnail.jpg" : undefined
        });
        known.add(content.id);
        await this.drive.writeJson(indexPath, { archivedIds: [...known].sort() });
        archived++;
      } catch (error) {
        failed++;
        console.error(`[${platform}:${item.id}] ${error instanceof Error ? error.message : error}`);
      } finally { await fs.rm(tmp, { recursive: true, force: true }); }
    }
    if (!failed) {
      state[platform] = { lastSyncAt: startedAt };
      await this.drive.writeJson("sync-state.json", state);
    }
    return { discovered: items.length, archived, skipped, failed };
  }

  async stats() {
    const instagram = await this.drive.readJson<ArchiveIndex>("indexes/instagram.json", { archivedIds: [] });
    const youtube = await this.drive.readJson<ArchiveIndex>("indexes/youtube.json", { archivedIds: [] });
    const state = await this.drive.readJson<SyncState>("sync-state.json", {});
    return { instagram: instagram.archivedIds.length, youtube: youtube.archivedIds.length, total: instagram.archivedIds.length + youtube.archivedIds.length, lastSync: state };
  }

  async verify() {
    const missing: string[] = [];
    for (const platform of ["instagram", "youtube"] as Platform[]) {
      const index = await this.drive.readJson<ArchiveIndex>(`indexes/${platform}.json`, { archivedIds: [] });
      for (const id of index.archivedIds) {
        const base = platformFolder(platform);
        const candidates = platform === "instagram" ? [`${base}/reel_${id}`, `${base}/post_${id}`] : [`${base}/video_${id}`, `${base}/short_${id}`];
        if (!(await Promise.all(candidates.map(p => this.drive.folderExists(p)))).some(Boolean)) missing.push(`${platform}:${id}:folder`);
      }
    }
    return { ok: missing.length === 0, missing };
  }
}
