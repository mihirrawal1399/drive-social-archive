export type Platform = "instagram" | "youtube";

export interface ArchivedContent {
  id: string;
  platform: Platform;
  type: string;
  title?: string;
  caption?: string;
  hashtags: string[];
  postUrl: string;
  publishedAt: string;
  archivedAt: string;
  sourceQuality: "downloaded" | "metadata-only";
  mediaFiles: string[];
  thumbnailFile?: string;
}

export interface DiscoveredContent {
  id: string;
  url: string;
  publishedAt?: string;
}

export interface ArchiveIndex { archivedIds: string[] }
export interface SyncState {
  instagram?: { lastSyncAt: string };
  youtube?: { lastSyncAt: string };
}

export interface PlatformAdapter {
  platform: Platform;
  discover(since?: string): Promise<DiscoveredContent[]>;
  download(item: DiscoveredContent, destination: string): Promise<ArchivedContent>;
}
