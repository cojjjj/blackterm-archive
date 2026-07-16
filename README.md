# THE ARCHIVE // 001

A terminal-style, Cicada-inspired puzzle platform built as a safe cybersecurity and puzzle-solving experience.

## Current MVP

- Anonymous player identities
- Persistent progress in SQLite
- JSON-driven challenge engine
- Prerequisite-based challenge unlocking
- Hashed answers rather than plaintext answer storage
- Terminal-style responsive interface
- Docker support
- Two starter nodes

## Run on Windows

```powershell
cd blackterm_archive
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
fastapi dev app/main.py
```

Open:

```text
http://127.0.0.1:8000
```

## Run with Docker

```powershell
docker compose up --build
```

Open:

```text
http://127.0.0.1:8000
```

## Project Structure

```text
blackterm_archive/
├── app/
│   └── main.py
├── data/
│   └── challenges.json
├── static/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

## Adding a Challenge

Challenges live in `data/challenges.json`.

Each challenge contains:

- `id`: permanent internal ID
- `sequence`: display order
- `title`
- `category`
- `difficulty`
- `briefing`
- `artifact`: optional visible clue
- `requires`: IDs that must already be solved
- `salt`
- `answer_hash`
- `success_message`

Generate a new answer hash:

```powershell
python tools/hash_answer.py "YOUR ANSWER" "YOUR-SALT"
```

## Starter Puzzle Notes

Node 001 is a simple hexadecimal decoding puzzle intended to confirm the system works.

Node 002 asks players to inspect the page's source. Add your hidden clue as an HTML comment before releasing it publicly.

## Safety Rules for Future Challenges

Keep all exploitation challenges inside intentionally vulnerable local containers. Do not direct players toward third-party systems, private individuals, real credentials, or unauthorized targets.

## Node 003: The Hidden Surface

This node hides five ordered fragments in:

1. HTML source
2. CSS
3. Browser console
4. robots.txt
5. `/restricted/`

Final phrase: `NOTHING HIDDEN STAYS BURIED FOREVER`


## v0.3 Terminal Subsystem

The dashboard now contains a modular interactive terminal.

Documented commands:

- `help`
- `status`
- `nodes`
- `whoami`
- `history`
- `ping`
- `observe`
- `inspect`
- `scan`
- `clear`
- `archive`

Hidden commands include `echo`, `sudo`, and `ghost`.

Features:

- Commands live in separate ES modules under `static/terminal/commands/`
- Up/down command history
- Tab completion
- Typewriter output
- Dynamic player and challenge context from FastAPI
- Persistent command-event logging in SQLite
- Hidden commands and glitch effects

To add a command, create a new module and register it using `register({...})`, then import the module from `static/terminal/index.js`.


## v0.4 Virtual Filesystem

The terminal now operates on a real virtual filesystem model supplied by FastAPI.

Filesystem features:

- Absolute and relative paths
- Current working directory
- Home directory expansion with `~`
- Directories, files, permissions, hidden entries, and locked areas
- Player-specific `/users/<observer-id>/` directories
- Node files generated from actual challenge progress
- Classified content unlocked by progress
- Read-only initial design to protect puzzle integrity

Filesystem commands:

- `pwd`
- `ls`, `ls -l`, `ls -a`, `ls -la`
- `cd`
- `cat`
- `tree`
- `find`
- `grep`
- `file`
- `sha256sum`
- `base64`
- `xxd`

Suggested first commands:

```text
pwd
ls
tree /
cat /README
cd /archive/transmissions
ls -la
```


## v0.5 Downloadable Artifacts

Artifacts are now real files stored under `artifacts/` and exposed through authenticated download routes.

Starter artifacts:

- `signal_001.png` — image investigation
- `relay_evidence.zip` — compressed evidence bundle
- `capture_001.pcap` — synthetic network capture
- `observer_check` — harmless reverse-engineering binary

Artifacts unlock based on solved-node count and appear inside:

```text
/archive/artifacts
```

Terminal commands:

```text
artifacts
artifact-info <path>
download <path>
file <path>
sha256sum <path>
xxd <path>
```

The reverse-engineering binary is intentionally harmless. It only compares a command-line phrase and prints a training flag.


## v0.6 Case Engine

Cases are now self-contained investigations with:

- Briefings
- Unlock requirements
- Objective questions
- Evidence artifacts
- Per-player attempts and completion state
- Progress percentages
- Virtual filesystem directories
- Completion rewards

Case definitions live in:

```text
data/cases.json
```

Case commands:

```text
cases
case case-001
submit-case case-001 <objective-id> <answer>
```

CASE-001 appears at:

```text
/archive/cases/CASE-001-dead-relay
```

Suggested workflow:

```text
cases
case case-001
cd /archive/cases/CASE-001-dead-relay
tree
cat briefing.txt
cat objectives.txt
ls evidence
download evidence/relay_evidence.zip
download evidence/capture_001.pcap
```


## v0.6.1 Case Evidence Access Fix

Case evidence is now accessible whenever its parent case is unlocked.

Artifact access is granted when either:

- The artifact's global solved-node requirement is met, or
- The artifact belongs to an unlocked case.

This prevents circular dependencies where a case is visible but its required evidence cannot be downloaded.


## v0.7 Admin Panel

Open the administrator interface at:

```text
http://127.0.0.1:8000/admin
```

The local fallback admin key is:

```text
blackterm-local-admin
```

For anything beyond local testing, set a private key before starting the server:

```powershell
$env:ARCHIVE_ADMIN_KEY="replace-with-a-long-random-secret"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Admin features:

- Platform statistics
- Case registry
- Create cases
- Edit cases
- Delete cases
- Add multiple objectives
- Hash objective answers automatically
- Assign existing artifacts as evidence
- Configure unlock requirements
- Configure completion rewards

Case changes are written directly to:

```text
data/cases.json
```

Do not expose the development server publicly with the default admin key.


## v1.0 The Living Archive

The Archive now behaves like an active system rather than a static dashboard.

Features:

- Dynamic encrypted-session boot sequence
- Observer-specific boot summaries
- Heartbeat states: ONLINE, SYNCING, OBSERVING, MONITORING, INDEXING
- Persistent observer events
- Persistent Archive mail
- Unread message and event counts
- Live activity logs
- Expanded observer profile
- Archive integrity and trust level
- Optional ambient Web Audio hum and relay clicks
- Rare visual pulses and system glitches
- Case-completion events

New terminal commands:

```text
mail
read-mail <id>
events
read-event <id>
date
live-log
whoami
```

No microphone, camera, or surveillance permissions are used. Ambient audio is generated locally and remains off until the player enables it.


## v1.1 Cinematic Boot

The session restoration sequence now includes:

- Character-by-character boot typing
- Independent staged progress movement
- Filesystem mounting and recovery steps
- Per-step status values
- Previous-session command recovery
- Occasional harmless warning sequences
- Brief corruption effects
- Smooth boot exit animation
- Observer-specific boot variations


## v1.2 CRT Power-On

The cinematic session boot now includes:

- CRT horizontal power-on line
- Vertical phosphor expansion
- Static and scanline burst
- Screen bloom
- Rare `UNKNOWN NETWORK` flicker
- Occasional 99% authorization stall
- Rare second-observer conflict message
- Brief authorization delay before Enter is accepted

These effects are visual only and do not request device permissions.


## v2.0 BLACKTERM OS Desktop

The Archive now boots into a desktop environment with:

- Desktop shell and wallpaper
- Top system status bar
- Taskbar and start menu
- Draggable windows
- Resizable windows
- Minimize, maximize, focus, and close behavior
- Reusable application registry
- Archive application
- Full terminal application
- Mail client
- File Explorer backed by the same virtual filesystem as the terminal
- Artifact downloads through File Explorer
- Live clock, observer identity, signal, mail, event, and integrity status

Desktop icons open with a double-click. Applications in the start menu open with a single click.


## v2.1 Purple Void Theme

The BLACKTERM OS visual system now uses:

- Deep black-violet desktop
- Lavender text and controls
- Violet CRT bloom and startup effects
- Animated circular relay scanner
- Rotating orbit rings
- Pulsing relay nodes
- Slowly drifting background particles
- Purple-focused windows, taskbar, icons, forms, and Archive Studio styling
- Reduced-motion support


## v2.2 Living Desktop

The Purple Void desktop now includes:

- Animated relay connection lines
- Moving packet lights between relay nodes
- Ambient desktop notifications
- Smooth close, minimize, restore, and hover animations
- Explorer breadcrumbs
- Explorer back/forward/up navigation
- Explorer search
- Explorer item counts and status bar
- Desktop story files
- Built-in text file viewer

Desktop story content is defined in:

```text
data/desktop_story.json
```


## v2.3 Desktop Bootstrap

After the cinematic CRT/session restoration, BLACKTERM OS now performs a
second-stage desktop startup:

- Virtual filesystem mounting
- Archive Core initialization
- Relay topology checks
- Integrity engine startup
- Mail and event database restoration
- Purple Void display-driver loading
- Wallpaper warm-up
- Topbar and taskbar assembly
- Per-application desktop icon initialization
- Recovered story-file mounting
- Background service synchronization
- Locked desktop interaction until startup completes
- Archive and Terminal auto-launch after the system reaches READY

Every startup includes a small randomized diagnostic variation.


## v2.4 Startup Polish

The second-stage BLACKTERM OS startup now includes:

- Refined startup pacing and status arrival animations
- Pending-state indicators before each service responds
- Purple Void monitor warm-up and sharpening
- Individual app-icon energizing
- Story-file transfer progress before each desktop file appears
- Observer detection and permission-restoration phase
- Typed final welcome message
- Smoother bootstrap card entrance and exit
- Improved keyboard focus visibility
- Reduced-motion support


## v3.0 Core OS Application Suite

BLACKTERM OS now includes these windowed applications:

- File Explorer
- Archive Mail
- Process Monitor
- Relay Monitor
- Relay World Map
- Knowledge Base
- Puzzle Editor / Archive Studio launcher
- Audio Console with waveform and playback controls
- Image Viewer with zoom, brightness, contrast, and invert controls
- Hex Viewer for downloadable artifact bytes
- Log Viewer with search and event/command filtering
- Search Index across files, mail, cases, and events

A safe recovered audio artifact, `echo_transmission.wav`, is included for the
Audio Console. The applications share the existing window manager, Archive
APIs, artifact routes, virtual filesystem, case engine, mail, and event data.


## v3.1 Application Personality

Each major BLACKTERM OS application now has an individual accent color:

- File Explorer — violet
- Terminal — phosphor green
- Mail — amber
- Process Monitor — orange
- Relay Monitor — cyan
- World Map — blue
- Knowledge Base — paper white
- Audio Console — crimson
- Hex Viewer — green

Application startup behavior now includes:

- Explorer folders sliding into place and files populating in sequence
- Mail inbox synchronization, unread counter animation, staggered messages,
  and a recovered-transmission notice
- Relay nodes fading in before packet paths activate
- World map rotation into view before relay links illuminate
- Hex rows streaming into memory instead of appearing instantly
- Audio waveform drawing before controls unlock
- Knowledge Base indexing before entries appear
- Process Monitor populating live with continuing CPU variation


## v3.2 Premium Desktop Polish

This release adds:

- Application-colored focus glows that move with the active window
- Dimmed inactive windows and brighter active title bars
- Premium scale, fade, blur, and overshoot opening animation
- Smoother minimize, maximize, restore, and close transitions
- Visible resize-handle feedback
- Enhanced desktop icon hover, selection, press, and glow states
- Complete File Explorer redesign:
  - Quick Access, Favorites, Recent, and System sections
  - Grid and Details views
  - Refresh, search, back, forward, and up navigation
  - Evidence metadata preview pane
  - SHA-256, MIME type, classification, related-case, and size display
  - Image thumbnails and media-specific previews
  - Context menu
  - Drag-and-drop support
- Drag compatible artifacts from Explorer into:
  - Image Viewer
  - Audio Console
  - Hex Viewer


## v3.3 Living Ecosystem

This update adds:

- Persistent window positions, sizes, maximize state, and z-order
- Subtle synthesized sounds for open, close, minimize, maximize, and notifications
- Stronger focused-window depth and more subdued background windows
- Scanner sweep illumination that briefly affects icons, windows, and OS chrome
- Upgraded secure Mail client:
  - Inbox folders
  - Unread priority dots
  - Recovered-transmission status
- Multi-colored Relay Monitor packets with fading trails
- PCAP drag-and-drop replay in Relay Monitor
- Drag a record into Knowledge Base to reveal related entities
- Drag evidence into Puzzle Editor to stage it for a case draft
- Existing drag support remains for Image Viewer, Audio Console, and Hex Viewer


## v4.0 Procedural Investigation Generator

BLACKTERM OS can now create deterministic, shareable investigations.

Each seed generates:

- A procedural case briefing
- Difficulty-scaled objectives
- An Archive Mail transmission
- A relay activity log
- A JSON manifest
- A generated PNG clue frame
- A synthetic WAV transmission
- A safe synthetic PCAP
- A ZIP evidence bundle
- Case and artifact entries visible throughout the OS

Generated content integrates with:

- Archive
- File Explorer
- Mail
- Audio Console
- Image Viewer
- Hex Viewer
- Relay Monitor
- Search Index
- Puzzle Editor

The same seed always restores the same investigation instead of creating a
duplicate. Generated PCAP and media content are synthetic and benign.


## v5.0 Intelligence Narrative Engine

Generated investigations now contain internally consistent intelligence
reporting rather than a single random briefing.

The seeded engine produces:

- Directorate and division attribution
- Classification, priority, and investigation status
- Executive summary
- Incident overview
- Preliminary intelligence assessment
- Analyst comment
- Recommended actions
- Technical observations
- Indicators
- Threat assessment
- Timeline reconstruction
- Chain-of-custody metadata
- Assigned operator profile
- Declassified lore fragment
- Intelligence-style observer assignment mail
- Downloadable intelligence dossier

The Archive opens procedural investigations in a dedicated dossier window with
Summary, Technical, Timeline, Custody, and Objectives sections.

`data/world_state.json` tracks recurring relays, operators, protocols, lore
fragments, and generated-case history so future narrative systems can reference
prior investigations.


## v1.2 Living Archive

The Archive now maintains a persistent world across generated investigations.

### Persistent world state

`data/world_state.json` tracks:

- Recurring relays
- Recurring operators
- Recurring protocols
- Organizations
- Case history
- Observer encounters
- Unlocked lore
- Hidden folders
- Global events
- Desktop drift state

### Narrative continuity

New generated investigations can reuse previously discovered relays, operators,
and protocols. Intelligence dossiers include correlation notes when an entity
has appeared in earlier cases.

### Evolving world map

The World Map now reads persistent relay state, shows discovered relays, links
their case history, and displays global Archive events.

### Hidden progression

Generated-case thresholds unlock:

- `/archive/declassified`
- `/archive/internal`
- `/archive/operator`
- `/archive/restricted`
- `/archive/protocol-zero`

Lore fragments and global events unlock at separate progression thresholds.

### Dynamic desktop

World progression can make Mail or Relay Monitor pulse, increase desktop drift,
and introduce occasional wallpaper interference.


## Public deployment

Production deployment files are included:

- `railway.json`
- `render.yaml`
- `.dockerignore`
- `.env.production.example`
- `LAUNCH.md`

BLACKTERM requires a persistent storage volume because it writes SQLite data,
generated investigations, JSON world state, mail state, and generated artifacts
at runtime. Set `ARCHIVE_STORAGE_DIR` to the mounted volume path.


## Analytics

Google Analytics 4 is installed with measurement ID `G-DTYY7LYPPR`.
The analytics helper records page visits and high-level interface events such as
application opens. It intentionally does not send observer IDs, answers, mail
contents, terminal commands, filenames, or evidence contents.
