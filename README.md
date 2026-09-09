# Jump Pilot Log

A dependency-free, mobile-first flight/block time tracker for parachuting operations. It is designed to run as a static site on GitHub Pages and stores all operational data in the browser's `localStorage`.

## Features

- Date navigation plus calendar picker
- Touch-friendly custom aircraft dropdown with registration history and per-aircraft default settings
- Per-day settings snapshots, so changing an aircraft default does not rewrite older days
- Off-block, lift, fuel and on-block events
- Valid 24-hour time inputs with a permanent colon and double-tap-to-fill-current-time
- T/O + LDG tracking with automatic elapsed minutes, or TIME ONLY mode
- No-cycle and no-drop markers
- Daily statistics and tab-delimited pilot-log clipboard export
- UTC conversion based on the aircraft/day UTC offset
- Offline-capable after the first successful visit via a tiny service worker
- Sleek borderless event layout with compact mobile spacing and inline SVG icons
- No framework, build system, CDN or backend

## GitHub Pages deployment

1. Create a repository and copy the files from this folder into the repository root.
2. Push to the default branch.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the default branch and the `/ (root)` folder, then save.

Because every asset uses a relative path, the app works both at `username.github.io` and inside a project subpath such as `username.github.io/jump-pilot-log/`.

## Data model / privacy

There is no server. Aircraft profiles, settings, dates and events remain in `localStorage` on the device/browser where they were entered. Clearing site data will remove the log. If cross-device sync or durable backups are required later, add an explicit export/import or backend layer.

## Pilot log line format

For each completed off-block/on-block segment, **Export to pilot log** copies one tab-separated line with these fields:

`PIC`, date, airfield, off-block UTC, airfield, on-block UTC, aircraft type, registration.

The date uses `YYYY-MM-DD`; off-block and on-block times are converted to UTC using that day's saved UTC offset.
