import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ArchivedContent, DiscoveredContent, Platform, PlatformAdapter } from "../types.js";

interface YtInfo {
  id: string; webpage_url?: string; url?: string; title?: string; description?: string;
  timestamp?: number; upload_date?: string; duration?: number; extractor_key?: string;
  tags?: string[]; entries?: YtInfo[];
}

interface GalleryDlPost {
  date?: string;
  post_date?: string;
  post_shortcode?: string;
  post_id?: string;
  post_url?: string;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);
    child.on("error", err => reject(new Error(`Could not start ${bin}: ${err.message}`)));
    child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(`${bin} exited ${code}: ${stderr.trim()}`)));
  });
}

function date(info: YtInfo): string {
  if (info.timestamp) return new Date(info.timestamp * 1000).toISOString();
  if (info.upload_date?.length === 8) return `${info.upload_date.slice(0,4)}-${info.upload_date.slice(4,6)}-${info.upload_date.slice(6,8)}T00:00:00.000Z`;
  return new Date(0).toISOString();
}

function hashtags(info: YtInfo): string[] {
  const text = `${info.title ?? ""} ${info.description ?? ""}`;
  return [...new Set([...(info.tags ?? []), ...[...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(m => m[1])])];
}

const mediaPattern = /^media(?:_\d+)?\.(mp4|webm|mkv|mov|jpg|jpeg|png|webp)$/i;

export class YtDlpAdapter implements PlatformAdapter {
  constructor(public platform: Platform, private bin: string, private sources: string[], private cookies?: string, private galleryDl = "gallery-dl") {}
  private args(): string[] { return this.cookies ? ["--cookies", this.cookies] : []; }

  private galleryArgs(source: string): string[] {
    const url = /^https:\/\/www\.instagram\.com\/[^/]+\/?$/.test(source)
      ? `${source.replace(/\/$/, "")}/posts/`
      : source;
    return [...this.args(), "--simulate", "--dump-json", url];
  }

  private async discoverInstagramWithGalleryDl(source: string, since?: string): Promise<DiscoveredContent[]> {
    const output = await run(this.galleryDl, this.galleryArgs(source));
    const events = JSON.parse(output) as unknown[];
    const discovered = new Map<string, DiscoveredContent>();
    for (const event of events) {
      if (!Array.isArray(event) || event[0] !== 2 || typeof event[1] !== "object" || event[1] === null) continue;
      const post = event[1] as GalleryDlPost;
      const id = post.post_shortcode ?? post.post_id;
      const url = post.post_url;
      if (!id || !url) continue;
      const publishedAt = post.post_date || post.date ? new Date(post.post_date ?? post.date!).toISOString() : new Date(0).toISOString();
      if (since && publishedAt !== new Date(0).toISOString() && publishedAt <= since) continue;
      discovered.set(id, { id, url, publishedAt });
    }
    return [...discovered.values()];
  }

  private async downloadInstagramWithGalleryDl(item: DiscoveredContent, destination: string): Promise<ArchivedContent> {
    await run(this.galleryDl, [...this.args(), "--directory", destination, "--filename", "media_{num}.{extension}", item.url]);
    const files = (await fs.readdir(destination)).filter(file => mediaPattern.test(file)).sort();
    if (!files.length) throw new Error(`gallery-dl did not download media for ${item.id}`);
    return {
      id: item.id,
      platform: "instagram",
      type: /\/reel\//.test(item.url) ? "reel" : "post",
      hashtags: [],
      postUrl: item.url,
      publishedAt: item.publishedAt ?? new Date(0).toISOString(),
      archivedAt: new Date().toISOString(),
      sourceQuality: "downloaded",
      mediaFiles: files
    };
  }

  async discover(since?: string): Promise<DiscoveredContent[]> {
    if (!this.sources.length) throw new Error(`No ${this.platform} sources configured`);
    const all = new Map<string, DiscoveredContent>();
    for (const source of this.sources) {
      let output: string;
      try {
        output = await run(this.bin, [...this.args(), "--flat-playlist", "--dump-single-json", "--no-warnings", source]);
      } catch (error) {
        if (this.platform !== "instagram") throw error;
        for (const item of await this.discoverInstagramWithGalleryDl(source, since)) all.set(item.id, item);
        continue;
      }
      const root = JSON.parse(output) as YtInfo;
      for (const item of root.entries ?? [root]) {
        const publishedAt = date(item);
        if (since && publishedAt !== new Date(0).toISOString() && publishedAt <= since) continue;
        const url = item.webpage_url ?? item.url ?? (this.platform === "youtube" ? `https://www.youtube.com/watch?v=${item.id}` : source);
        all.set(item.id, { id: item.id, url, publishedAt });
      }
    }
    return [...all.values()];
  }

  async download(item: DiscoveredContent, destination: string): Promise<ArchivedContent> {
    await fs.mkdir(destination, { recursive: true });
    let output: string;
    try {
      output = await run(this.bin, [...this.args(), "--no-warnings", "--write-thumbnail", "--convert-thumbnails", "jpg", "--merge-output-format", "mp4", "-o", path.join(destination, "media.%(ext)s"), "--print", "after_move:%()j", item.url]);
    } catch (error) {
      if (this.platform === "instagram") return this.downloadInstagramWithGalleryDl(item, destination);
      throw error;
    }
    const info = JSON.parse(output.trim().split(/\r?\n/).at(-1)!) as YtInfo;
    const files = await fs.readdir(destination);
    const media = files.find(f => /^media\.(mp4|webm|mkv|mov)$/i.test(f));
    const thumb = files.find(f => /^media\.(jpg|jpeg|png|webp)$/i.test(f));
    if (!media) throw new Error(`No media downloaded for ${item.id}`);
    const isShort = this.platform === "youtube" && (/\/shorts\//.test(info.webpage_url ?? item.url) || (info.duration ?? 999) <= 60);
    const type = this.platform === "instagram" ? (/\/reel\//.test(info.webpage_url ?? item.url) ? "reel" : "post") : (isShort ? "short" : "video");
    return {
      id: info.id || item.id, platform: this.platform, type, title: info.title,
      caption: info.description, hashtags: hashtags(info), postUrl: info.webpage_url ?? item.url,
      publishedAt: date(info), archivedAt: new Date().toISOString(), sourceQuality: "downloaded",
      mediaFiles: [media], thumbnailFile: thumb
    };
  }
}
