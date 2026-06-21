# Social Archive

A personal, database-free CLI that archives Instagram and YouTube content into Google Drive. Drive contains the media, metadata, indexes, and sync checkpoints needed to recover the complete archive.

## Prerequisites

- Node.js 20+
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp#installation) available on `PATH`
- A Google Cloud project with the Drive API enabled
- A Google service-account key (recommended), or Application Default Credentials

For a service account, create or choose the destination Drive folder, share it with the key's `client_email`, and put that folder ID in `SOCIAL_ARCHIVE_ROOT_ID`. A service account cannot use a human user's My Drive unless a folder is explicitly shared with it.

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env`, then load it into your shell (the CLI intentionally does not add a dotenv dependency):

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^[^#].*=') { $name, $value = $_ -split '=', 2; Set-Item "Env:$name" $value }
}
npm run build
npm link
```

The configured source URL can be an Instagram profile, individual post/reel, YouTube channel tab, playlist, or individual video. Use a Netscape-format cookies file for private content or when a platform requires login. Keep that file and Google credentials outside this repository.

## Commands

```powershell
archive sync instagram
archive sync youtube
archive sync all
archive stats
archive verify
```

Each item is written as `Instagram/reel_ID` or `YouTube/video_ID`, containing `video.*`, optional `thumbnail.jpg`, and `post.json`. `indexes/*.json` provides idempotent duplicate detection; `sync-state.json` advances only after a failure-free platform run.

## Recovery and caveats

The Drive archive is self-describing and has no required local state. To move machines, reinstall this CLI and point it at the same root folder ID. `verify` checks indexed item folders. Platform extraction is necessarily subject to platform access and `yt-dlp` support; cookies may expire. Already archived files remain independent of both.
