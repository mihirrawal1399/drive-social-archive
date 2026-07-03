#!/usr/bin/env node
import { Command } from "commander";
import { loadDotEnv } from "./env.js";
import { loadConfig } from "./config.js";
import { DriveStore } from "./drive.js";
import { ArchiveService } from "./archive.js";
import { YtDlpAdapter } from "./platforms/ytdlp.js";
import type { Platform } from "./types.js";

loadDotEnv();

const program = new Command().name("archive").description("Back up social content to Google Drive").version("1.0.0");

async function service() {
  const config = loadConfig();
  const drive = await DriveStore.connect(config.rootFolderId);
  return { config, archive: new ArchiveService(drive, config.tempDir) };
}

async function syncOne(platform: Platform) {
  const { config, archive } = await service();
  const adapter = new YtDlpAdapter(platform, config.ytDlpPath, config.sources[platform], config.cookies[platform]);
  const result = await archive.sync(adapter);
  console.log(`${platform}: ${result.archived} archived, ${result.skipped} skipped, ${result.failed} failed (${result.discovered} discovered)`);
  if (result.failed) process.exitCode = 1;
}

program.command("sync").argument("<platform>", "instagram, youtube, or all").action(async value => {
  if (!["instagram", "youtube", "all"].includes(value)) throw new Error(`Unsupported platform: ${value}`);
  if (value === "all") { await syncOne("instagram"); await syncOne("youtube"); }
  else await syncOne(value as Platform);
});
program.command("stats").action(async () => console.log(JSON.stringify(await (await service()).archive.stats(), null, 2)));
program.command("verify").action(async () => {
  const result = await (await service()).archive.verify();
  console.log(result.ok ? "Archive indexes are consistent." : JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
});

program.parseAsync().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
