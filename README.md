# Drive Social Archive

A personal, database-free CLI for archiving Instagram and YouTube content into Google Drive.

The archive lives in Drive, not in a local database. Media, metadata, duplicate-detection indexes, and sync checkpoints are all stored under a Drive folder named `SocialArchive` by default.

## What works today

- Archives YouTube channel tabs, shorts tabs, playlists, and individual videos using `yt-dlp`.
- Archives Instagram profiles, posts, reels, and mixed carousel posts using `yt-dlp` plus a `gallery-dl` fallback.
- Stores all archived media and metadata in Google Drive.
- Skips items that were already archived.
- Keeps sync checkpoints in Drive.
- Loads `.env` automatically from the current working directory.

## Prerequisites

- Node.js 20+
- Google Cloud CLI, `gcloud`
- Google Drive API enabled in a Google Cloud project
- An OAuth client JSON file, usually named like `client_secret_....apps.googleusercontent.com.json`
- `yt-dlp`
- `gallery-dl`, recommended for Instagram profile crawling and carousel fallback
- Optional Netscape-format cookies file for Instagram/YouTube authenticated access

On Windows, this project has been tested with:

```bat
npm install
python -m pip install --user gallery-dl
winget install --id yt-dlp.yt-dlp -e
```

If `gallery-dl` installs outside PATH, set `GALLERYDL_PATH` in `.env`.

## Google Drive account selection

For normal personal backups, leave this blank in `.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=
```

Then authenticate Application Default Credentials with the Google account whose Drive quota should store the archive:

```bat
"C:\Users\rawal\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" auth application-default login --client-id-file="E:\Github\drive-social-archive\client_secret_....apps.googleusercontent.com.json" --scopes="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/drive"
```

The Google Cloud project or OAuth client can be owned by one account, while the Drive archive can be stored in another account. The Drive quota is used from the account selected in the browser during `gcloud auth application-default login`.

Use `GOOGLE_APPLICATION_CREDENTIALS` only for service-account mode. Do not point it at an OAuth `client_secret_...json` file.

## Setup

From the repo:

```bat
cd /d E:\Github\drive-social-archive
npm install
copy .env.example .env
```

Edit `.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=
SOCIAL_ARCHIVE_ROOT_ID=

INSTAGRAM_SOURCE_URLS=https://www.instagram.com/your_username/
YOUTUBE_SOURCE_URLS=https://www.youtube.com/@your_channel/shorts

INSTAGRAM_COOKIES_FILE=C:\Users\rawal\Downloads\www.instagram.com_cookies_your_username.txt
YOUTUBE_COOKIES_FILE=

YTDLP_PATH=yt-dlp
GALLERYDL_PATH=C:\Users\rawal\AppData\Roaming\Python\Python39\Scripts\gallery-dl.exe
SOCIAL_ARCHIVE_TMP_DIR=
```

Notes:

- `SOCIAL_ARCHIVE_ROOT_ID=` blank means the CLI creates/uses `SocialArchive` in the authenticated account's My Drive.
- `INSTAGRAM_COOKIES_FILE` should point to a Netscape-format cookies export.
- Keep `.env`, cookies, OAuth client secrets, and service-account keys out of git.

## Commands

Run through npm:

```bat
npm start -- stats
npm start -- sync youtube
npm start -- sync instagram
npm start -- sync all
npm start -- verify
```

Or build and link the CLI:

```bat
npm run build
npm link
archive stats
archive sync all
archive verify
```

## Testing

```bat
npm run build
npm test
```

## Drive layout

Default root folder:

```text
SocialArchive/
  Instagram/
    reel_<id>/
      video.mp4
      thumbnail.jpg
      post.json
    post_<id>/
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

`indexes/*.json` prevents duplicate uploads. `sync-state.json` advances only after a platform sync completes with zero failures.

## Instagram cookies

Instagram often requires login cookies. Export cookies in Netscape/cookies.txt format using a trusted local cookie exporter extension, then set:

```env
INSTAGRAM_COOKIES_FILE=C:\path\to\instagram-cookies.txt
```

Cookies are login tokens. Store them outside the repo when possible.

## Recovery

The Drive archive is self-describing. To move machines:

1. Clone this repo.
2. Install prerequisites.
3. Authenticate Google Drive.
4. Set `SOCIAL_ARCHIVE_ROOT_ID` to the existing archive folder ID, or leave it blank if the same authenticated account already has the `SocialArchive` folder.
5. Run `npm start -- verify`.

## Technical details

See [TECHNICAL_FLOW.md](TECHNICAL_FLOW.md) for the architecture, data model, sync flow, auth behavior, and external-tool fallback logic.
