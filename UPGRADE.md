# BLACKTERM // THE ARCHIVE — Control Room update

## Install on your working Vercel project

1. Extract this ZIP and replace the matching files in your existing GitHub repository. Keep your existing Vercel project and settings.
2. Commit and push. Let your existing Vercel integration redeploy.
3. Set the Vercel environment variable `ARCHIVE_ADMIN_KEY` to a long random secret if you want Archive Studio enabled. Redeploy after changing environment variables. The built-in development admin password is disabled on Vercel when no key is configured.
4. Open the deployment. Fast startup is enabled by default; uncheck it before entering for the original cinematic sequence.

The FastAPI entrypoint in `pyproject.toml` is unchanged. No new application dependency or frontend build step is required.

## Features

- Refined gate, control-room panels, icons, window chrome, and responsive sizing.
- Mission Control with actual identity, decoded count, progress, unresolved unlocked leads, refresh, and shortcuts.
- Ctrl+K / Cmd+K searchable app launcher with keyboard navigation and focus trapping.
- Investigation Notebook with browser autosave, plain-text export, and text/Markdown import. Import asks before replacing existing notes.
- Violet, emerald, and arctic themes; quiet display; reduced-motion support; window recovery.
- One-click desktop apps and story files; double-click titlebars to maximize.
- Fast startup for returning observers.
- Window bounds adapt to the viewport; saved maximized windows can restore their original geometry.
- Request timeout messages, power-gate retry, and application failure messages.
- Notification audio respects the audio toggle; quiet display suppresses ambient alerts.
- Vercel admin access requires a configured key; HTTPS cookies default to secure.
- New observer codenames use the same calculation as Vercel session recovery.

## Data

The existing SQLite architecture is preserved. Vercel server data still lives in `/tmp`: puzzle progress, generated investigations, and admin edits can reset when instances are replaced or differ between instances. This is not durable cloud persistence. Mission Control labels this storage mode. Durable multi-user progress requires a hosted database and shared artifact storage.

Notebook and display preferences save in this browser, independently of the temporary server files. Export notes for backup. Clearing browser data removes them. Notebook exports do not back up puzzle progress.

## Validation

Python compilation, JavaScript module syntax checks, and isolated FastAPI checks cover sessions, mission data, challenge submission, cases, artifacts, living-world endpoints, and invalid admin rejection.

Vercel-mode checks passed for secure cookies, codename recovery after player data loss, disabled default admin access, and static asset delivery.

DOM interaction tests also passed for mission rendering, launcher filtering/Enter, safe notebook autosave, theme persistence, viewport clamping, and maximize behavior.

The test-browser download failed, so desktop/mobile rendering could not be visually verified. The existing live Vercel deployment was not accessed or redeployed.
