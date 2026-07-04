# Technical Flow

This document is written for future AI/code agents and maintainers. It explains the project behavior without requiring a line-by-line read of the source.

## Purpose

`drive-social-archive` is a TypeScript CLI that archives social media content into Google Drive. It intentionally avoids a local database. Google Drive is both the object store and the persistence layer for indexes/checkpoints.

The current supported platforms are:

- Instagram
- YouTube

## Main entrypoints

- `src/cli.ts`
  - CLI command definitions.
  - Loads `.env` via `loadDotEnv()`.
  - Builds runtime config.
  - Connects to Google Drive.
  - Creates a platform adapter and calls `ArchiveService`.
- `src/env.ts`
  - Minimal `.env` loader.
  - Reads `.env` from `process.cwd()` by default.
  - Does not overwrite already-set process environment variables.
- `src/config.ts`
  - Converts environment variables into typed config.
- `src/archive.ts`
  - Platform-independent archive orchestration.
  - Handles duplicate skipping, Drive folder creation, file uploads, index updates, sync-state updates, and verification.
- `src/drive.ts`
  - Google Drive persistence abstraction.
  - Finds/creates folders, uploads files, reads/writes JSON.
- `src/platforms/ytdlp.ts`
  - Platform adapter backed by `yt-dlp`.
  - Uses `gallery-dl` as an Instagram fallback for profile discovery and failed Instagram downloads.
- `src/types.ts`
  - Shared interfaces for platform adapters, discovered items, archived content, indexes, and sync state.

## Runtime configuration

The CLI auto-loads `.env` before reading config.

Important environment variables:

| Variable | Meaning |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service-account JSON key path only. Leave blank for personal OAuth/ADC mode. |
| `SOCIAL_ARCHIVE_ROOT_ID` | Existing Drive folder ID. If blank, the app finds/creates `SocialArchive` in authenticated My Drive. |
| `INSTAGRAM_SOURCE_URLS` | Comma-separated Instagram profile/post/reel URLs. |
| `YOUTUBE_SOURCE_URLS` | Comma-separated YouTube channel tab/playlist/video URLs. |
| `INSTAGRAM_COOKIES_FILE` | Optional Netscape cookies file passed to external downloaders. |
| `YOUTUBE_COOKIES_FILE` | Optional Netscape cookies file passed to external downloaders. |
| `YTDLP_PATH` | `yt-dlp` executable path or command name. Defaults to `yt-dlp`. |
| `GALLERYDL_PATH` | `gallery-dl` executable path or command name. Defaults to `gallery-dl`. |
| `SOCIAL_ARCHIVE_TMP_DIR` | Temporary download root. Defaults to OS temp + `social-archive`. |

## Google auth model

`DriveStore.connect()` uses:

```ts
new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive"] })
```

That means auth resolution follows Google Application Default Credentials behavior.

Personal OAuth mode:

1. `GOOGLE_APPLICATION_CREDENTIALS` stays blank.
2. User runs `gcloud auth application-default login --client-id-file=... --scopes=...`.
3. Browser opens.
4. User selects the Google account whose Drive should own the archive.
5. ADC is saved under the user's gcloud config directory.
6. The Node Google API library uses that ADC credential.

Service-account mode:

1. `GOOGLE_APPLICATION_CREDENTIALS` points to a service-account JSON key.
2. User shares the destination Drive folder with the service account's `client_email`.
3. `SOCIAL_ARCHIVE_ROOT_ID` points to that shared folder.

Do not put an OAuth `client_secret_...json` path in `GOOGLE_APPLICATION_CREDENTIALS`; that file identifies the OAuth app, not the authenticated Drive account.

## High-level sync flow

For `npm start -- sync <platform>`:

```text
CLI
  load .env
  load config
  connect Google Drive
  create platform adapter
  ArchiveService.sync(adapter)
    read indexes/<platform>.json from Drive
    read sync-state.json from Drive
    adapter.discover(lastSyncAt)
    for each discovered item:
      skip if ID exists in index
      download to temp directory
      create Drive folder
      upload media files
      upload thumbnail if present
      write post.json
      update platform index immediately
    if no failures:
      update sync-state.json for that platform
```

Indexes are updated after each successful item. This makes partial progress durable. Sync state advances only after zero failures so failed/unknown items can be retried later.

## Discovery flow

### YouTube

For YouTube sources, the adapter calls:

```text
yt-dlp --flat-playlist --dump-single-json --no-warnings <source>
```

The result is parsed into `DiscoveredContent` items:

- `id`
- canonical or derived URL
- published date if available

### Instagram

The adapter first tries the same `yt-dlp` discovery approach. If that fails, it falls back to `gallery-dl`.

For plain profile URLs like:

```text
https://www.instagram.com/<username>/
```

the fallback rewrites the source to:

```text
https://www.instagram.com/<username>/posts/
```

Then it calls:

```text
gallery-dl --cookies <cookie-file> --simulate --dump-json <source>
```

`gallery-dl` emits event arrays. Event type `2` contains metadata. The adapter extracts:

- `post_shortcode` or `post_id` as ID
- `post_url` as the item URL
- `post_date` or `date` as published time

## Download flow

### Primary downloader

The adapter first tries `yt-dlp`:

```text
yt-dlp [--cookies <file>] --no-warnings --write-thumbnail --convert-thumbnails jpg --merge-output-format mp4 -o <tmp>/media.%(ext)s --print after_move:%()j <item-url>
```

For successful downloads, it parses the final JSON line and records:

- media file
- optional thumbnail
- title/caption/hashtags when available
- content type:
  - Instagram: `reel` if URL contains `/reel/`, else `post`
  - YouTube: `short` if URL contains `/shorts/` or duration is <= 60 seconds, else `video`

### Instagram fallback downloader

If `yt-dlp` fails for Instagram, the adapter falls back to:

```text
gallery-dl [--cookies <file>] --directory <tmp> --filename media_{num}.{extension} <item-url>
```

This is important for Instagram carousel/mixed media posts where `yt-dlp` may report no video formats. The fallback accepts files matching:

```text
media.mp4
media_1.mp4
media_2.jpg
media_3.webp
...
```

Fallback metadata is intentionally smaller:

- ID
- platform
- type
- post URL
- published time if discovery provided it
- list of downloaded media files

## Drive storage model

If `SOCIAL_ARCHIVE_ROOT_ID` is blank, Drive root is:

```text
SocialArchive
```

Folder layout:

```text
SocialArchive/
  Instagram/
    reel_<id>/
      video.mp4
      thumbnail.jpg
      post.json
    post_<id>/
      video.mp4
      post.json
    post_<carousel-id>/
      media_1.mp4
      media_2.jpg
      post.json
  YouTube/
    short_<id>/
      video.mp4
      thumbnail.jpg
      post.json
    video_<id>/
      video.mp4
      thumbnail.jpg
      post.json
  indexes/
    instagram.json
    youtube.json
  sync-state.json
```

Single-media items are uploaded as:

```text
video.<ext>
```

Multi-media items are uploaded as:

```text
media_1.<ext>
media_2.<ext>
...
```

`post.json` stores the normalized `ArchivedContent` object, including the final Drive filenames.

## Duplicate detection

The app reads:

```text
indexes/<platform>.json
```

Shape:

```json
{
  "archivedIds": ["id1", "id2"]
}
```

If a discovered item ID exists in the index, it is skipped.

After a successful item upload, the ID is added to the index and the index is immediately written back to Drive.

## Sync checkpoints

The app reads/writes:

```text
sync-state.json
```

Shape:

```json
{
  "instagram": { "lastSyncAt": "2026-07-04T14:21:25.067Z" },
  "youtube": { "lastSyncAt": "2026-07-04T10:41:37.948Z" }
}
```

The checkpoint for a platform is updated only when that platform sync has zero failures.

During discovery, items with a known published time older than or equal to `lastSyncAt` are skipped before download.

## Verify flow

`verify` reads each platform index and checks that a plausible folder exists in Drive:

- Instagram candidates:
  - `Instagram/reel_<id>`
  - `Instagram/post_<id>`
- YouTube candidates:
  - `YouTube/video_<id>`
  - `YouTube/short_<id>`

It currently verifies folder presence, not byte-level media integrity.

## Important operational notes

- `.env` is ignored by git.
- OAuth client secrets, service-account keys, tokens, and cookie exports should stay out of git.
- Cookies are effectively login tokens. Treat them like secrets.
- Instagram extraction changes often. The current design intentionally uses `gallery-dl` as a fallback because `yt-dlp` profile extraction can break while individual post downloads may still work.
- `gallery-dl` may install outside PATH on Windows. In that case set `GALLERYDL_PATH` to the full `.exe` path.
- The local temp directory can be deleted at any time; Drive is the source of truth.

## Current limitations

- No local database.
- No byte-for-byte revalidation of uploaded media.
- No retry backoff beyond rerunning the command.
- Metadata is richer when `yt-dlp` succeeds and thinner when the Instagram `gallery-dl` fallback handles download.
- The Drive API wrapper searches folders/files by name under parent folders. Avoid manually creating duplicate folder names under the archive root.
