import fs from "node:fs";
import { Readable } from "node:stream";
import { google, drive_v3 } from "googleapis";

const FOLDER = "application/vnd.google-apps.folder";
const q = (value: string) => value.replace(/'/g, "\\'");

export class DriveStore {
  private constructor(private drive: drive_v3.Drive, public rootId: string) {}

  static async connect(rootId?: string): Promise<DriveStore> {
    const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive"] });
    const drive = google.drive({ version: "v3", auth });
    if (!rootId) {
      const found = await DriveStore.findChild(drive, "root", "SocialArchive", FOLDER);
      rootId = found ?? await DriveStore.makeFolder(drive, "root", "SocialArchive");
    }
    return new DriveStore(drive, rootId);
  }

  private static async findChild(drive: drive_v3.Drive, parent: string, name: string, mime?: string) {
    const parts = [`'${q(parent)}' in parents`, `name='${q(name)}'`, "trashed=false"];
    if (mime) parts.push(`mimeType='${mime}'`);
    const res = await drive.files.list({ q: parts.join(" and "), fields: "files(id,name)", pageSize: 2, supportsAllDrives: true, includeItemsFromAllDrives: true });
    return res.data.files?.[0]?.id ?? undefined;
  }

  private static async makeFolder(drive: drive_v3.Drive, parent: string, name: string) {
    const res = await drive.files.create({ requestBody: { name, mimeType: FOLDER, parents: [parent] }, fields: "id", supportsAllDrives: true });
    if (!res.data.id) throw new Error(`Drive did not return an ID for ${name}`);
    return res.data.id;
  }

  async createFolder(path: string): Promise<string> {
    let parent = this.rootId;
    for (const part of path.split("/").filter(Boolean)) {
      parent = await DriveStore.findChild(this.drive, parent, part, FOLDER) ?? await DriveStore.makeFolder(this.drive, parent, part);
    }
    return parent;
  }

  async folderExists(path: string): Promise<boolean> { return (await this.resolve(path, FOLDER)) !== undefined; }
  async fileExists(path: string): Promise<boolean> { return (await this.resolve(path)) !== undefined; }

  private async resolve(path: string, finalMime?: string): Promise<string | undefined> {
    const parts = path.split("/").filter(Boolean);
    let parent = this.rootId;
    for (let i = 0; i < parts.length; i++) {
      const mime = i < parts.length - 1 ? FOLDER : finalMime;
      const id = await DriveStore.findChild(this.drive, parent, parts[i], mime);
      if (!id) return undefined;
      parent = id;
    }
    return parent;
  }

  async uploadFile(folderId: string, localPath: string, name = localPath.split(/[\\/]/).pop()!): Promise<string> {
    const existing = await DriveStore.findChild(this.drive, folderId, name);
    const media = { body: fs.createReadStream(localPath) };
    const res = existing
      ? await this.drive.files.update({ fileId: existing, media, fields: "id", supportsAllDrives: true })
      : await this.drive.files.create({ requestBody: { name, parents: [folderId] }, media, fields: "id", supportsAllDrives: true });
    return res.data.id!;
  }

  async downloadFile(fileId: string, destination: string): Promise<void> {
    const res = await this.drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(destination);
      (res.data as Readable).pipe(out).on("finish", resolve).on("error", reject);
    });
  }

  async readJson<T>(path: string, fallback: T): Promise<T> {
    const id = await this.resolve(path);
    if (!id) return fallback;
    const res = await this.drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true });
    return (typeof res.data === "string" ? JSON.parse(res.data) : res.data) as T;
  }

  async writeJson(path: string, data: unknown): Promise<void> {
    const parts = path.split("/");
    const name = parts.pop()!;
    const parent = parts.length ? await this.createFolder(parts.join("/")) : this.rootId;
    const existing = await DriveStore.findChild(this.drive, parent, name);
    const media = { mimeType: "application/json", body: Readable.from(JSON.stringify(data, null, 2) + "\n") };
    if (existing) await this.drive.files.update({ fileId: existing, media, supportsAllDrives: true });
    else await this.drive.files.create({ requestBody: { name, parents: [parent], mimeType: "application/json" }, media, supportsAllDrives: true });
  }
}
