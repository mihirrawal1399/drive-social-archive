import os from "node:os";
import path from "node:path";
import type { Platform } from "./types.js";

function list(name: string): string[] {
  return (process.env[name] ?? "").split(",").map(v => v.trim()).filter(Boolean);
}

export interface Config {
  rootFolderId?: string;
  tempDir: string;
  ytDlpPath: string;
  galleryDlPath: string;
  sources: Record<Platform, string[]>;
  cookies: Partial<Record<Platform, string>>;
}

export function loadConfig(): Config {
  return {
    rootFolderId: process.env.SOCIAL_ARCHIVE_ROOT_ID || undefined,
    tempDir: process.env.SOCIAL_ARCHIVE_TMP_DIR || path.join(os.tmpdir(), "social-archive"),
    ytDlpPath: process.env.YTDLP_PATH || "yt-dlp",
    galleryDlPath: process.env.GALLERYDL_PATH || "gallery-dl",
    sources: {
      instagram: list("INSTAGRAM_SOURCE_URLS"),
      youtube: list("YOUTUBE_SOURCE_URLS")
    },
    cookies: {
      instagram: process.env.INSTAGRAM_COOKIES_FILE || undefined,
      youtube: process.env.YOUTUBE_COOKIES_FILE || undefined
    }
  };
}
