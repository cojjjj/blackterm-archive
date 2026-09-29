# BLACKTERM // THE ARCHIVE — Desktop v3

This patch installs over the Control Room update you already uploaded.

## Upload to your existing Vercel-connected repository

1. Extract `blackterm-archive-desktop-v3-updated-files.zip`.
2. Open https://github.com/cojjjj/blackterm-archive/upload/main .
3. Drag the extracted `static` folder and `UPGRADE.md` into the upload area together. Upload their contents at the repository root; do not upload the ZIP or its outer folder.
4. Commit to `main` with message `Add movable desktop and cinematic Archive entrance`.
5. Let your connected Vercel project redeploy. Refresh the site afterward.

No backend, dependency, environment variable, or Vercel entrypoint changes are needed for this patch.

## Desktop

The old left shortcut shelf is replaced by a free-position desktop. Apps and recovered files start in rows across the workspace. Drag shortcuts anywhere; their positions and overlap order save in the browser. Dragging does not launch the app. Click to open it after dropping.

App windows remain movable by their title bars. Double-click a title bar to maximize; the window controls minimize and close. Window bounds now use the actual usable desktop area.

For keyboard movement, focus a shortcut and hold Alt while pressing an arrow key. Alt+Shift+arrow moves farther. In Settings, choose **Arrange desktop icons** to reset the layout. Phones have a scrollable workspace to reach every icon.

The desktop starts clear instead of immediately opening Mission Control. Ctrl+K / Cmd+K opens the searchable launcher.

## Entrance

Every visit starts at the new Archive entrance, including returning visitors. Existing observer cookies and notebook data are preserved.

The Open the Archive button starts animated relay rings, signal acquisition, decode, observer verification, and an access-granted transition into the desktop. The cinematic takes about six seconds; real session and desktop preparation run alongside it. If preparation takes longer, the entrance waits for the server. The progress bar represents the entrance sequence, not a network transfer.

Choose **Skip cinematic sequence**, press Escape during the sequence, or use **Skip sequence** to shorten the animation. Skipping still waits for actual preparation. Reduced-motion and quiet-display preferences automatically shorten it. Failed requests return to the entrance with a retry button.

## Validation

Headless Chromium checks passed for the cinematic boot, clear desktop, icon dragging without accidental launches, position persistence after reload, title-bar window movement, layout reset, mobile scrolling and window bounds. No page errors occurred. Failure/retry and reduced-motion startup were tested separately.

Desktop and mobile screenshots were rendered and inspected. All JavaScript module syntax checks passed.

## Storage

Shortcut positions, notebook, and preferences save in this browser. Clearing browser data removes them. Vercel server puzzle progress remains temporary under the existing SQLite architecture; this patch does not add durable cloud storage.
