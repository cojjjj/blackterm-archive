import { installInvestigationGenerator } from "./generator-app.js";
import { VirtualFileSystem } from "../terminal/filesystem.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function appShell(className, sidebarTitle = "") {
  const shell = node("div", `core-app ${className}`);
  if (sidebarTitle) shell.dataset.sidebarTitle = sidebarTitle;
  return shell;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function fetchArtifactBytes(artifact) {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}/download`);
  if (!response.ok) throw new Error("Artifact bytes unavailable.");
  return new Uint8Array(await response.arrayBuffer());
}

function buildWaveform(canvas, values) {
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(500, Math.floor(rect.width));
  const height = Math.max(150, Math.floor(rect.height));
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  context.scale(devicePixelRatio, devicePixelRatio);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--glow").trim() || "#bf7aff";
  context.lineWidth = 1;
  context.beginPath();

  const step = Math.max(1, Math.floor(values.length / width));
  for (let x = 0; x < width; x += 1) {
    let minimum = 1;
    let maximum = -1;
    for (let offset = 0; offset < step; offset += 1) {
      const value = values[x * step + offset] || 0;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    context.moveTo(x, (1 + minimum) * height / 2);
    context.lineTo(x, (1 + maximum) * height / 2);
  }
  context.stroke();
}

export function installCoreApps(registry) {
  installInvestigationGenerator(registry);
  const { api, windows } = registry;

  registry.register("processes", {
    open: () => openProcessMonitor(api, windows),
  });
  registry.register("relay", {
    open: () => openRelayMonitor(api, windows),
  });
  registry.register("worldmap", {
    open: () => openWorldMap(api, windows),
  });
  registry.register("knowledge", {
    open: () => openKnowledgeBase(windows),
  });
  registry.register("editor", {
    open: () => openPuzzleEditor(api, windows),
  });
  registry.register("audio", {
    open: () => openAudioConsole(api, windows),
  });
  registry.register("images", {
    open: () => openImageViewer(api, windows),
  });
  registry.register("hex", {
    open: () => openHexViewer(api, windows),
  });
  registry.register("logs", {
    open: () => openLogViewer(api, windows),
  });
  registry.register("search", {
    open: () => openSearchIndex(api, windows, registry),
  });
}

function openProcessMonitor(api, windows) {
  const shell = appShell("process-monitor");
  shell.innerHTML = `
    <header class="app-toolbar">
      <div><span class="eyebrow">SYSTEM</span><h2>Process Monitor</h2></div>
      <div class="toolbar-actions">
        <button data-refresh>REFRESH</button>
        <button data-end>END PROCESS</button>
      </div>
    </header>
    <section class="process-summary"></section>
    <div class="data-table process-table">
      <div class="table-row table-head">
        <span>PROCESS</span><span>PID</span><span>CPU</span><span>MEMORY</span><span>STATUS</span>
      </div>
    </div>
    <aside class="process-details"><p class="empty-state">Select a process.</p></aside>
  `;

  const record = windows.open({
    id: "processes",
    title: "Process Monitor",
    content: shell,
    width: 920,
    height: 600,
  });

  const processes = [
    { name: "ArchiveCore.exe", pid: 41, cpu: 2.4, memory: 124, status: "Running", path: "/system/archive/core" },
    { name: "RelayService.exe", pid: 77, cpu: 4.8, memory: 88, status: "Running", path: "/system/relay/service" },
    { name: "Observer.exe", pid: 113, cpu: 0.7, memory: 42, status: "Authenticated", path: "/users/current" },
    { name: "IntegrityEngine.exe", pid: 212, cpu: 1.1, memory: 67, status: "Scanning", path: "/system/integrity" },
    { name: "Echo.exe", pid: 3301, cpu: 0.0, memory: 0, status: "Suspended", path: "unresolved" },
    { name: "Ghost.exe", pid: 713, cpu: 0.0, memory: 0, status: "???", path: "no executable found" },
  ];

  let selected = null;
  const table = shell.querySelector(".process-table");
  const details = shell.querySelector(".process-details");
  const summary = shell.querySelector(".process-summary");

  const render = () => {
    table.querySelectorAll(".table-row:not(.table-head)").forEach((row) => row.remove());
    summary.innerHTML = `
      <article><span>PROCESSES</span><strong>${processes.length}</strong></article>
      <article><span>CPU</span><strong>${processes.reduce((sum, item) => sum + item.cpu, 0).toFixed(1)}%</strong></article>
      <article><span>MEMORY</span><strong>${processes.reduce((sum, item) => sum + item.memory, 0)} MB</strong></article>
      <article><span>ANOMALIES</span><strong>${processes.filter((item) => item.status === "???").length}</strong></article>
    `;

    for (const [processIndex, item] of processes.entries()) {
      const row = node("button", "table-row selectable process-arrival");
      row.style.setProperty("--process-index", processIndex);
      row.innerHTML = `
        <span>${item.name}</span><span>${item.pid}</span><span>${item.cpu.toFixed(1)}%</span>
        <span>${item.memory} MB</span><span class="${item.status === "???" ? "danger-text" : ""}">${item.status}</span>
      `;
      row.addEventListener("click", () => {
        selected = item;
        table.querySelectorAll(".selected").forEach((entry) => entry.classList.remove("selected"));
        row.classList.add("selected");
        details.innerHTML = `
          <span class="eyebrow">PID ${item.pid}</span>
          <h3>${item.name}</h3>
          <dl class="details-list">
            <dt>Status</dt><dd>${item.status}</dd>
            <dt>CPU</dt><dd>${item.cpu.toFixed(1)}%</dd>
            <dt>Memory</dt><dd>${item.memory} MB</dd>
            <dt>Image path</dt><dd>${item.path}</dd>
          </dl>
        `;
      });
      table.appendChild(row);
    }
  };

  shell.querySelector("[data-refresh]").addEventListener("click", () => {
    processes.forEach((item) => {
      if (item.name !== "Ghost.exe") item.cpu = Math.max(0.1, item.cpu + (Math.random() - .5) * 2);
    });
    render();
  });

  shell.querySelector("[data-end]").addEventListener("click", async () => {
    if (!selected) return;
    const index = processes.indexOf(selected);
    if (index >= 0) processes.splice(index, 1);
    details.innerHTML = `<p class="system-message">${selected.name} terminated.</p>`;
    const wasGhost = selected.name === "Ghost.exe";
    selected = null;
    render();
    if (wasGhost) {
      await delay(2400);
      processes.push({ name: "Ghost.exe", pid: 713, cpu: 0.0, memory: 0, status: "???", path: "no executable found" });
      render();
      details.innerHTML = `<p class="danger-text">Ghost.exe restarted without a parent process.</p>`;
    }
  });

  shell.classList.add("process-booting");
  render();
  setTimeout(() => shell.classList.remove("process-booting"), 1050);

  const cpuTimer = setInterval(() => {
    if (!document.body.contains(shell)) {
      clearInterval(cpuTimer);
      return;
    }
    processes.forEach((item) => {
      if (item.name !== "Ghost.exe") {
        item.cpu = Math.max(0.1, Math.min(18, item.cpu + (Math.random() - .5) * 1.4));
      }
    });
    render();
  }, 2400);

  return record;
}

function relayData() {
  return [
    { id: "R-01", x: 16, y: 38, status: "ONLINE", integrity: 98, packets: 1842 },
    { id: "R-03", x: 34, y: 18, status: "ONLINE", integrity: 94, packets: 943 },
    { id: "R-07", x: 75, y: 25, status: "ONLINE", integrity: 91, packets: 2218 },
    { id: "R-11", x: 62, y: 52, status: "MONITORING", integrity: 88, packets: 3201 },
    { id: "R-13", x: 35, y: 73, status: "COMPROMISED", integrity: 42, packets: 2443 },
    { id: "R-19", x: 81, y: 76, status: "UNKNOWN", integrity: 61, packets: 712 },
  ];
}

function openRelayMonitor(api, windows) {
  const shell = appShell("relay-monitor relay-booting");
  shell.innerHTML = `
    <header class="app-toolbar">
      <div><span class="eyebrow">LIVE NETWORK</span><h2>Relay Monitor</h2></div>
      <div class="live-badge"><i></i> LIVE</div>
    </header>
    <div class="relay-monitor-layout">
      <section class="relay-canvas">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M16 38 L34 18 L75 25 L62 52 L81 76 L35 73 Z"></path>
          <path d="M16 38 L62 52 L35 73"></path>
          <circle class="relay-packet-dot packet-data" r="1"><animateMotion dur="5s" repeatCount="indefinite" path="M16 38 L34 18 L75 25 L62 52"/></circle>
          <circle class="relay-packet-dot packet-control" r=".9"><animateMotion dur="7s" repeatCount="indefinite" path="M81 76 L35 73 L16 38"/></circle>
          <circle class="relay-packet-dot packet-warning" r=".8"><animateMotion dur="9s" repeatCount="indefinite" path="M35 73 L62 52 L75 25"/></circle>
        </svg>
        <div class="relay-node-layer"></div>
      </section>
      <aside class="relay-details"><p class="empty-state">Select a relay node.</p></aside>
    </div>
  `;

  const record = windows.open({
    id: "relay",
    title: "Relay Monitor",
    content: shell,
    width: 1000,
    height: 650,
  });

  record.element.addEventListener("blackterm:file-drop", (event) => {
    const file = event.detail;
    const isCapture = file?.mime_type === "application/vnd.tcpdump.pcap"
      || file?.name?.toLowerCase().endsWith(".pcap");
    if (!isCapture) return;

    shell.classList.add("capture-replay");
    const badge = shell.querySelector(".live-badge");
    badge.innerHTML = "<i></i> REPLAYING CAPTURE";

    const replayNotice = node("div", "capture-replay-notice");
    replayNotice.innerHTML = `<span>PCAP REPLAY</span><strong>${file.name}</strong><small>Injecting preserved traffic into relay graph...</small>`;
    shell.appendChild(replayNotice);

    setTimeout(() => replayNotice.classList.add("visible"), 20);
    setTimeout(() => {
      shell.classList.remove("capture-replay");
      badge.innerHTML = "<i></i> LIVE";
      replayNotice.classList.remove("visible");
      setTimeout(() => replayNotice.remove(), 260);
    }, 6500);
  });

  const layer = shell.querySelector(".relay-node-layer");
  const details = shell.querySelector(".relay-details");
  for (const [relayIndex, relay] of relayData().entries()) {
    const button = node("button", `monitor-node relay-node-arrival status-${relay.status.toLowerCase()}`);
    button.style.setProperty("--relay-index", relayIndex);
    button.style.left = `${relay.x}%`;
    button.style.top = `${relay.y}%`;
    button.innerHTML = `<i></i><span>${relay.id}</span><small>${relay.status}</small>`;
    button.addEventListener("click", () => {
      details.innerHTML = `
        <span class="eyebrow">RELAY NODE</span><h2>${relay.id}</h2>
        <div class="metric-grid">
          <article><span>STATUS</span><strong>${relay.status}</strong></article>
          <article><span>INTEGRITY</span><strong>${relay.integrity}%</strong></article>
          <article><span>PACKETS</span><strong>${relay.packets.toLocaleString()}</strong></article>
          <article><span>CHANNEL</span><strong>${3300 + Number(relay.id.slice(2))}</strong></article>
        </div>
        <div class="integrity-meter"><i style="width:${relay.integrity}%"></i></div>
        <p>${relay.id === "R-13" ? "Impossible timestamps detected. Traffic preserved for CASE-001." : "Relay telemetry appears within expected parameters."}</p>
      `;
    });
    layer.appendChild(button);
  }

  setTimeout(() => shell.classList.add("relay-links-live"), 650);
  setTimeout(() => shell.classList.remove("relay-booting"), 1200);
  return record;
}

async function openWorldMap(api, windows) {
  const shell = appShell("world-map-app world-map-booting");
  shell.innerHTML = `
    <header class="app-toolbar">
      <div><span class="eyebrow">PERSISTENT GEOSPATIAL INTELLIGENCE</span><h2>Living Relay Map</h2></div>
      <span class="map-coordinate">WORLD STATE // SYNCHRONIZED</span>
    </header>
    <div class="world-map">
      <svg viewBox="0 0 1000 500" role="img" aria-label="Persistent relay map">
        <path class="continent" d="M80 170 L130 110 L220 95 L275 140 L245 205 L180 218 L155 275 L100 240 Z"/>
        <path class="continent" d="M275 285 L335 268 L360 330 L340 420 L300 465 L280 388 Z"/>
        <path class="continent" d="M470 120 L545 85 L635 100 L685 145 L650 205 L585 215 L550 285 L485 255 L450 190 Z"/>
        <path class="continent" d="M600 270 L655 255 L710 300 L688 395 L630 420 L580 350 Z"/>
        <path class="continent" d="M735 130 L830 105 L920 155 L900 225 L820 235 L760 195 Z"/>
        <path class="continent" d="M800 355 L865 330 L925 375 L890 430 L830 420 Z"/>
        <g class="world-map-connections"></g>
      </svg>
      <div class="map-nodes"></div>
      <aside class="map-details"><p class="empty-state">Select a discovered relay.</p></aside>
      <section class="world-events">
        <h3>GLOBAL EVENTS</h3>
        <div></div>
      </section>
    </div>
  `;

  const record = windows.open({
    id: "worldmap",
    title: "Living Relay Map",
    content: shell,
    width: 1100,
    height: 660,
  });

  const payload = await api("/api/world/map");
  const nodes = shell.querySelector(".map-nodes");
  const details = shell.querySelector(".map-details");
  const eventList = shell.querySelector(".world-events div");
  const connectionGroup = shell.querySelector(".world-map-connections");

  const locations = [
    { name: "Buffalo", left: 18, top: 34 },
    { name: "London", left: 49, top: 31 },
    { name: "Berlin", left: 56, top: 29 },
    { name: "Tokyo", left: 84, top: 38 },
    { name: "Oslo", left: 54, top: 21 },
    { name: "Sydney", left: 86, top: 76 },
    { name: "Reykjavik", left: 42, top: 20 },
  ];

  const relays = payload.relays.map((relay, index) => {
    const discoveredLocation = relay.locations?.[0] || locations[index % locations.length].name;
    const position = locations.find((item) => item.name === discoveredLocation)
      || locations[index % locations.length];
    return { ...relay, ...position };
  });

  for (let index = 1; index < relays.length; index += 1) {
    const source = relays[index - 1];
    const destination = relays[index];
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("map-link", "world-state-link");
    path.setAttribute(
      "d",
      `M${source.left * 10} ${source.top * 5} Q500 ${70 + index * 18} ${destination.left * 10} ${destination.top * 5}`,
    );
    connectionGroup.appendChild(path);
  }

  for (const [locationIndex, relay] of relays.entries()) {
    const button = node("button", `map-node map-node-arrival status-${String(relay.status).toLowerCase()}`);
    button.style.left = `${relay.left}%`;
    button.style.top = `${relay.top}%`;
    button.style.setProperty("--map-index", locationIndex);
    button.innerHTML = `<i></i><span>${relay.id}</span><small>${relay.name || relay.cluster}</small>`;

    button.addEventListener("click", () => {
      details.innerHTML = `
        <span class="eyebrow">${relay.cluster}</span>
        <h3>${relay.id}</h3>
        <dl class="details-list">
          <dt>Appearances</dt><dd>${relay.appearances}</dd>
          <dt>Status</dt><dd>${relay.status}</dd>
          <dt>Locations</dt><dd>${(relay.locations || []).join(", ") || "Unknown"}</dd>
          <dt>Linked cases</dt><dd>${relay.cases.length}</dd>
          <dt>First seed</dt><dd>${relay.first_seen_seed}</dd>
        </dl>
        <div class="map-case-links">
          ${relay.cases.map((caseId) => `<button data-case-id="${caseId}">${caseId}</button>`).join("")}
        </div>
      `;
    });
    nodes.appendChild(button);
  }

  if (!payload.global_events.length) {
    eventList.innerHTML = `<p class="empty-state">No global events recorded.</p>`;
  } else {
    for (const event of [...payload.global_events].reverse()) {
      const card = node("article", "world-event-card");
      card.innerHTML = `
        <span>${event.status}</span>
        <strong>${event.title}</strong>
        <p>${event.detail}</p>
        <small>${event.region}</small>
      `;
      eventList.appendChild(card);
    }
  }

  setTimeout(() => shell.classList.add("map-links-live"), 720);
  setTimeout(() => shell.classList.remove("world-map-booting"), 1350);
  return record;
}

function openKnowledgeBase(windows) {
  const entries = [
    ["Archive", "A distributed intelligence repository designed to preserve evidence after relay failure."],
    ["Observer", "An authenticated investigator permitted to traverse the Archive filesystem."],
    ["Relay", "A remote collection node that stores and forwards transmissions."],
    ["Signal", "A recovered communication whose origin or integrity may be uncertain."],
    ["Operator", "A human or automated custodian assigned to maintain relay continuity."],
    ["Memory Echo", "A repeated data pattern that persists after its original source is removed."],
    ["Void Channel", "A sealed transport channel with no confirmed endpoint."],
    ["Dead Relay", "A relay that continues producing evidence after being marked offline."],
    ["Unknown Protocol", "An undocumented protocol identified only by recurring packet structure."],
  ];

  const shell = appShell("knowledge-app knowledge-indexing");
  shell.innerHTML = `
    <aside class="knowledge-index">
      <input placeholder="SEARCH KNOWLEDGE BASE">
      <div class="knowledge-list"></div>
    </aside>
    <article class="knowledge-view"><p class="empty-state">Select an entry.</p></article>
  `;
  const record = windows.open({
    id: "knowledge",
    title: "Knowledge Base",
    content: shell,
    width: 900,
    height: 600,
  });

  const list = shell.querySelector(".knowledge-list");
  const viewer = shell.querySelector(".knowledge-view");
  const input = shell.querySelector("input");

  const render = (query = "") => {
    list.replaceChildren();
    entries.filter(([title, body]) => `${title} ${body}`.toLowerCase().includes(query.toLowerCase()))
      .forEach(([title, body], index) => {
        const button = node("button", "knowledge-item knowledge-arrival", title);
        button.style.setProperty("--knowledge-index", index);
        button.addEventListener("click", () => {
          viewer.innerHTML = `
            <span class="eyebrow">ARCHIVE KNOWLEDGE // ${String(index + 1).padStart(3, "0")}</span>
            <h2>${title}</h2><p>${body}</p>
            <hr><p class="muted-copy">Related terms: signal, observer, relay integrity.</p>
          `;
        });
        list.appendChild(button);
      });
  };
  input.addEventListener("input", () => render(input.value));

  const indexing = node("div", "knowledge-index-overlay");
  indexing.innerHTML = `<span>ARCHIVE KNOWLEDGE</span><strong>BUILDING INDEX...</strong><i></i>`;
  shell.appendChild(indexing);
  setTimeout(() => {
    render();
    indexing.classList.add("complete");
    shell.classList.remove("knowledge-indexing");
    setTimeout(() => indexing.remove(), 260);
  }, 1050);

  record.element.addEventListener("blackterm:file-drop", (event) => {
    const file = event.detail;
    if (!file) return;
    viewer.innerHTML = `
      <span class="eyebrow">RELATED ENTITIES</span>
      <h2>${escapeHtml(file.name)}</h2>
      <p>The Archive identified these related knowledge entities:</p>
      <div class="entity-chips">
        <button>Relay</button><button>Observer</button><button>Signal</button>
        <button>Dead Relay</button><button>Unknown Protocol</button>
      </div>
      <p class="muted-copy">Source: ${escapeHtml(file.path || "dragged evidence")}</p>
    `;
  });

  return record;
}

async function openPuzzleEditor(api, windows) {
  const shell = appShell("puzzle-editor-app");
  shell.innerHTML = `
    <header class="app-toolbar">
      <div><span class="eyebrow">ARCHIVE STUDIO</span><h2>Puzzle Editor</h2></div>
      <a class="button-link" href="/admin" target="_blank">OPEN FULL STUDIO</a>
    </header>
    <section class="editor-overview"></section>
    <div class="editor-workspace">
      <section class="editor-form">
        <label>CASE TITLE<input placeholder="Unauthorized Access"></label>
        <label>CATEGORY<input placeholder="SOC investigation"></label>
        <label>BRIEFING<textarea rows="5" placeholder="Describe the incident..."></textarea></label>
        <label>OBJECTIVE<textarea rows="3" placeholder="What account was compromised?"></textarea></label>
        <label>CORRECT ANSWER<input type="password" placeholder="Stored only in Archive Studio"></label>
        <button data-preview>PREVIEW DRAFT</button>
      </section>
      <aside class="editor-preview"><p class="empty-state">Draft preview appears here.</p></aside>
    </div>
  `;
  const record = windows.open({
    id: "editor",
    title: "Puzzle Editor",
    content: shell,
    width: 1000,
    height: 650,
  });

  record.element.addEventListener("blackterm:file-drop", (event) => {
    const file = event.detail;
    if (!file) return;
    const preview = shell.querySelector(".editor-preview");
    preview.innerHTML = `
      <span class="eyebrow">EVIDENCE ATTACHED</span>
      <h2>${escapeHtml(file.name)}</h2>
      <p>Type: ${escapeHtml(file.mime_type || file.type || "Unknown")}</p>
      <p>Path: ${escapeHtml(file.path || "Dragged from File Explorer")}</p>
      <p class="muted-copy">The evidence has been staged for the draft case.</p>
    `;
  });

  const [cases, artifacts] = await Promise.all([
    api("/api/cases").catch(() => []),
    api("/api/artifacts").catch(() => []),
  ]);
  shell.querySelector(".editor-overview").innerHTML = `
    <article><span>PUBLISHED CASES</span><strong>${cases.length}</strong></article>
    <article><span>AVAILABLE ARTIFACTS</span><strong>${artifacts.length}</strong></article>
    <article><span>AUTHORING MODE</span><strong>LOCAL</strong></article>
  `;
  shell.querySelector("[data-preview]").addEventListener("click", () => {
    const inputs = shell.querySelectorAll("input, textarea");
    shell.querySelector(".editor-preview").innerHTML = `
      <span class="eyebrow">DRAFT CASE</span>
      <h2>${escapeHtml(inputs[0].value || "Untitled Case")}</h2>
      <p>${escapeHtml(inputs[2].value || "No briefing entered.")}</p>
      <h3>Objective</h3><p>${escapeHtml(inputs[3].value || "No objective entered.")}</p>
      <p class="muted-copy">Publishing and secure answer hashing are completed in Archive Studio.</p>
    `;
  });
  return record;
}

async function openAudioConsole(api, windows) {
  const shell = appShell("audio-console-app audio-booting");
  shell.innerHTML = `
    <aside class="audio-library"></aside>
    <section class="audio-workbench">
      <header><span class="eyebrow">RECOVERED AUDIO</span><h2>Audio Console</h2></header>
      <canvas class="waveform"></canvas>
      <audio controls></audio>
      <div class="audio-controls">
        <label>SPEED<input data-speed type="range" min=".5" max="2" step=".1" value="1"></label>
        <label>VOLUME<input data-volume type="range" min="0" max="1" step=".05" value=".8"></label>
        <button data-reverse disabled>REVERSE // ANALYSIS ONLY</button>
      </div>
      <pre class="audio-metadata">Select a transmission.</pre>
    </section>
  `;

  const record = windows.open({
    id: "audio",
    title: "Audio Console",
    content: shell,
    width: 1000,
    height: 620,
  });

  record.element.addEventListener("blackterm:file-drop", (event) => {
    const file = event.detail;
    if (!file?.mime_type?.startsWith("audio/")) return;
    const artifact = file.artifact_id
      ? { id: file.artifact_id, title: file.name, filename: file.name, mime_type: file.mime_type, size: 0, sha256: "Loaded from desktop" }
      : null;
    if (!artifact) return;
    audio.src = `/api/artifacts/${artifact.id}/download`;
    metadata.textContent = `TITLE: ${artifact.title}\nTYPE: ${artifact.mime_type}\nSOURCE: DRAG AND DROP`;
  });

  const artifacts = (await api("/api/artifacts")).filter((item) => item.mime_type.startsWith("audio/"));
  const library = shell.querySelector(".audio-library");
  const audio = shell.querySelector("audio");
  const metadata = shell.querySelector(".audio-metadata");
  const canvas = shell.querySelector(".waveform");
  const interactiveControls = [...shell.querySelectorAll("audio, input, button")];
  interactiveControls.forEach((control) => control.disabled = true);

  const bootValues = new Float32Array(1600);
  for (let index = 0; index < bootValues.length; index += 1) {
    bootValues[index] = Math.sin(index / 11) * Math.min(1, index / 900) * .28;
  }
  let bootLength = 80;
  const waveformBoot = setInterval(() => {
    if (!document.body.contains(shell)) {
      clearInterval(waveformBoot);
      return;
    }
    buildWaveform(canvas, bootValues.slice(0, bootLength));
    bootLength += 95;
    if (bootLength >= bootValues.length) {
      clearInterval(waveformBoot);
      interactiveControls.forEach((control) => control.disabled = false);
      shell.classList.remove("audio-booting");
    }
  }, 55);

  if (!artifacts.length) library.innerHTML = `<p class="empty-state">No audio artifacts indexed.</p>`;
  for (const artifact of artifacts) {
    const button = node("button", "audio-item");
    button.innerHTML = `<strong>${artifact.filename}</strong><small>${formatBytes(artifact.size)}</small>`;
    button.addEventListener("click", async () => {
      audio.src = `/api/artifacts/${artifact.id}/download`;
      metadata.textContent = `TITLE: ${artifact.title}\nTYPE: ${artifact.mime_type}\nSIZE: ${formatBytes(artifact.size)}\nSHA256: ${artifact.sha256}`;
      try {
        const bytes = await fetchArtifactBytes(artifact);
        const context = new AudioContext();
        const decoded = await context.decodeAudioData(bytes.buffer.slice(0));
        buildWaveform(canvas, decoded.getChannelData(0));
        await context.close();
      } catch {
        buildWaveform(canvas, new Float32Array(500).map((_, index) => Math.sin(index / 8) * .2));
      }
    });
    library.appendChild(button);
  }

  shell.querySelector("[data-speed]").addEventListener("input", (event) => {
    audio.playbackRate = Number(event.target.value);
  });
  shell.querySelector("[data-volume]").addEventListener("input", (event) => {
    audio.volume = Number(event.target.value);
  });
  return record;
}

async function openImageViewer(api, windows) {
  const shell = appShell("image-viewer-app");
  shell.innerHTML = `
    <aside class="image-library"></aside>
    <section class="image-stage">
      <div class="image-toolbar">
        <button data-action="zoom-in">＋</button><button data-action="zoom-out">−</button>
        <button data-action="invert">INVERT</button><button data-action="reset">RESET</button>
        <label>BRIGHTNESS<input data-brightness type="range" min="25" max="175" value="100"></label>
        <label>CONTRAST<input data-contrast type="range" min="25" max="200" value="100"></label>
      </div>
      <div class="image-canvas"><p class="empty-state">Select an image artifact.</p></div>
      <footer class="image-metadata"></footer>
    </section>
  `;
  const record = windows.open({
    id: "images",
    title: "Image Viewer",
    content: shell,
    width: 1050,
    height: 660,
  });

  record.element.addEventListener("blackterm:file-drop", (event) => {
    const file = event.detail;
    if (!file?.mime_type?.startsWith("image/") || !file.artifact_id) return;
    canvas.replaceChildren();
    image = document.createElement("img");
    image.src = `/api/artifacts/${file.artifact_id}/download`;
    image.alt = file.name;
    canvas.appendChild(image);
    metadata.textContent = `${file.mime_type} // DRAGGED FROM EXPLORER`;
    zoom = 1; invert = 0; brightness = 100; contrast = 100; apply();
  });

  const artifacts = (await api("/api/artifacts")).filter((item) => item.mime_type.startsWith("image/"));
  const library = shell.querySelector(".image-library");
  const canvas = shell.querySelector(".image-canvas");
  const metadata = shell.querySelector(".image-metadata");
  let image = null;
  let zoom = 1;
  let invert = 0;
  let brightness = 100;
  let contrast = 100;

  const apply = () => {
    if (!image) return;
    image.style.transform = `scale(${zoom})`;
    image.style.filter = `invert(${invert}) brightness(${brightness}%) contrast(${contrast}%)`;
  };

  for (const artifact of artifacts) {
    const button = node("button", "image-item");
    button.innerHTML = `<strong>${artifact.filename}</strong><small>${formatBytes(artifact.size)}</small>`;
    button.addEventListener("click", () => {
      canvas.replaceChildren();
      image = document.createElement("img");
      image.src = `/api/artifacts/${artifact.id}/download`;
      image.alt = artifact.title;
      canvas.appendChild(image);
      metadata.textContent = `${artifact.mime_type} // ${formatBytes(artifact.size)} // ${artifact.sha256.slice(0, 20)}…`;
      zoom = 1; invert = 0; brightness = 100; contrast = 100; apply();
    });
    library.appendChild(button);
  }

  shell.querySelector('[data-action="zoom-in"]').addEventListener("click", () => { zoom = Math.min(4, zoom + .2); apply(); });
  shell.querySelector('[data-action="zoom-out"]').addEventListener("click", () => { zoom = Math.max(.25, zoom - .2); apply(); });
  shell.querySelector('[data-action="invert"]').addEventListener("click", () => { invert = invert ? 0 : 1; apply(); });
  shell.querySelector('[data-action="reset"]').addEventListener("click", () => { zoom=1; invert=0; brightness=100; contrast=100; apply(); });
  shell.querySelector("[data-brightness]").addEventListener("input", (event) => { brightness = event.target.value; apply(); });
  shell.querySelector("[data-contrast]").addEventListener("input", (event) => { contrast = event.target.value; apply(); });
  return record;
}

async function openHexViewer(api, windows) {
  const shell = appShell("hex-viewer-app");
  shell.innerHTML = `
    <header class="app-toolbar">
      <select class="hex-artifact-select"><option value="">SELECT ARTIFACT</option></select>
      <input class="hex-search" placeholder="SEARCH ASCII OR HEX">
      <span class="hex-offset">OFFSET 00000000</span>
    </header>
    <div class="hex-layout">
      <div class="hex-gutter"></div><pre class="hex-bytes"></pre><pre class="hex-ascii"></pre>
    </div>
    <footer class="hex-status">No artifact loaded.</footer>
  `;
  const record = windows.open({
    id: "hex",
    title: "Hex Viewer",
    content: shell,
    width: 1050,
    height: 650,
  });

  record.element.addEventListener("blackterm:file-drop", async (event) => {
    const file = event.detail;
    if (!file?.artifact_id) return;
    const option = [...select.options].find((item) => item.value === file.artifact_id);
    if (option) {
      select.value = file.artifact_id;
      select.dispatchEvent(new Event("change"));
    }
  });

  const artifacts = await api("/api/artifacts");
  const select = shell.querySelector("select");
  const gutter = shell.querySelector(".hex-gutter");
  const bytesPane = shell.querySelector(".hex-bytes");
  const asciiPane = shell.querySelector(".hex-ascii");
  const status = shell.querySelector(".hex-status");
  let rows = [];

  for (const artifact of artifacts) {
    const option = document.createElement("option");
    option.value = artifact.id;
    option.textContent = `${artifact.filename} // ${formatBytes(artifact.size)}`;
    option.dataset.artifact = JSON.stringify(artifact);
    select.appendChild(option);
  }

  const render = (filter = "") => {
    const normalized = filter.toLowerCase().replaceAll(" ", "");
    const visible = rows.filter((row) =>
      !normalized || row.hex.replaceAll(" ", "").includes(normalized) || row.ascii.toLowerCase().includes(filter.toLowerCase())
    );
    gutter.textContent = visible.map((row) => row.offset).join("\n");
    bytesPane.textContent = visible.map((row) => row.hex).join("\n");
    asciiPane.textContent = visible.map((row) => row.ascii).join("\n");
    status.textContent = `${visible.length} rows displayed`;
  };

  select.addEventListener("change", async () => {
    const option = select.selectedOptions[0];
    if (!option?.dataset.artifact) return;
    const artifact = JSON.parse(option.dataset.artifact);
    status.textContent = "Loading artifact bytes...";
    const data = await fetchArtifactBytes(artifact);
    rows = [];
    gutter.textContent = "";
    bytesPane.textContent = "";
    asciiPane.textContent = "";
    shell.classList.add("hex-streaming");

    for (let offset = 0; offset < data.length; offset += 16) {
      const slice = data.slice(offset, offset + 16);
      rows.push({
        offset: offset.toString(16).padStart(8, "0"),
        hex: [...slice].map((value) => value.toString(16).padStart(2, "0")).join(" ").padEnd(47, " "),
        ascii: [...slice].map((value) => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".").join(""),
      });
    }

    let visibleCount = 0;
    const streamRows = () => {
      visibleCount = Math.min(rows.length, visibleCount + 18);
      const visible = rows.slice(0, visibleCount);
      gutter.textContent = visible.map((row) => row.offset).join("\n");
      bytesPane.textContent = visible.map((row) => row.hex).join("\n");
      asciiPane.textContent = visible.map((row) => row.ascii).join("\n");
      status.textContent = `STREAMING ${visibleCount} / ${rows.length} ROWS`;
      if (visibleCount < rows.length) {
        requestAnimationFrame(streamRows);
      } else {
        shell.classList.remove("hex-streaming");
        status.textContent = `${rows.length} rows loaded`;
      }
    };
    requestAnimationFrame(streamRows);
  });
  shell.querySelector(".hex-search").addEventListener("input", (event) => render(event.target.value));
  return record;
}

async function openLogViewer(api, windows) {
  const shell = appShell("log-viewer-app");
  shell.innerHTML = `
    <header class="app-toolbar">
      <div><span class="eyebrow">SYSTEM ACTIVITY</span><h2>Log Viewer</h2></div>
      <div class="toolbar-actions">
        <select data-level><option>ALL</option><option>CMD</option><option>EVT</option></select>
        <input data-search placeholder="FILTER LOGS">
        <button data-refresh>REFRESH</button>
      </div>
    </header>
    <section class="log-stream"></section>
    <footer class="log-footer"></footer>
  `;
  const record = windows.open({
    id: "logs",
    title: "Log Viewer",
    content: shell,
    width: 980,
    height: 620,
  });

  const stream = shell.querySelector(".log-stream");
  const footer = shell.querySelector(".log-footer");
  let logs = [];

  const render = () => {
    const level = shell.querySelector("[data-level]").value;
    const query = shell.querySelector("[data-search]").value.toLowerCase();
    const filtered = logs.filter((line) =>
      (level === "ALL" || line.includes(` ${level} `)) && line.toLowerCase().includes(query)
    );
    stream.replaceChildren();
    filtered.forEach((line, index) => {
      const row = node("div", `log-line ${line.includes("EVT") ? "event" : "command"}`);
      row.innerHTML = `<span>${String(index + 1).padStart(3, "0")}</span><code>${escapeHtml(line)}</code>`;
      stream.appendChild(row);
    });
    footer.textContent = `${filtered.length} / ${logs.length} entries`;
  };

  const refresh = async () => {
    logs = await api("/api/living/logs");
    render();
  };
  shell.querySelector("[data-refresh]").addEventListener("click", refresh);
  shell.querySelector("[data-level]").addEventListener("change", render);
  shell.querySelector("[data-search]").addEventListener("input", render);
  await refresh();
  return record;
}

async function openSearchIndex(api, windows, registry) {
  const shell = appShell("search-index-app");
  shell.innerHTML = `
    <header class="search-hero">
      <span class="eyebrow">ARCHIVE SEARCH</span><h2>Search Index</h2>
      <input autofocus placeholder="SEARCH FILES, MAIL, CASES, EVENTS">
    </header>
    <section class="search-scope">
      <label><input type="checkbox" value="files" checked> FILES</label>
      <label><input type="checkbox" value="mail" checked> MAIL</label>
      <label><input type="checkbox" value="cases" checked> CASES</label>
      <label><input type="checkbox" value="events" checked> EVENTS</label>
    </section>
    <section class="search-results"><p class="empty-state">Enter a search term.</p></section>
  `;
  const record = windows.open({
    id: "search",
    title: "Search Index",
    content: shell,
    width: 920,
    height: 620,
  });

  const [filesystem, messages, cases, events] = await Promise.all([
    api("/api/filesystem"),
    api("/api/living/mail"),
    api("/api/cases"),
    api("/api/living/events"),
  ]);
  const fs = new VirtualFileSystem(filesystem.root, filesystem.home);
  const fileItems = fs.walk("/").filter((item) => item.node.type !== "directory");
  const input = shell.querySelector("input[autofocus]");
  const results = shell.querySelector(".search-results");

  const search = () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      results.innerHTML = `<p class="empty-state">Enter a search term.</p>`;
      return;
    }
    const scopes = new Set([...shell.querySelectorAll(".search-scope input:checked")].map((item) => item.value));
    const matches = [];

    if (scopes.has("files")) {
      for (const item of fileItems) {
        const content = `${item.path} ${item.node.content || ""}`.toLowerCase();
        if (content.includes(query)) matches.push({ type: "FILE", title: item.path, detail: item.node.content?.slice(0, 130) || "", action: () => registry.open("explorer") });
      }
    }
    if (scopes.has("mail")) {
      messages.filter((item) => `${item.sender} ${item.subject}`.toLowerCase().includes(query))
        .forEach((item) => matches.push({ type: "MAIL", title: item.subject, detail: `From ${item.sender}`, action: () => registry.open("mail") }));
    }
    if (scopes.has("cases")) {
      cases.filter((item) => `${item.title} ${item.briefing} ${item.category}`.toLowerCase().includes(query))
        .forEach((item) => matches.push({ type: "CASE", title: item.title, detail: item.briefing, action: () => registry.open("archive") }));
    }
    if (scopes.has("events")) {
      events.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query))
        .forEach((item) => matches.push({ type: "EVENT", title: item.title, detail: item.detail, action: () => registry.open("archive") }));
    }

    results.replaceChildren();
    if (!matches.length) {
      results.innerHTML = `<p class="empty-state">No indexed records matched “${escapeHtml(query)}”.</p>`;
      return;
    }
    for (const match of matches.slice(0, 80)) {
      const button = node("button", "search-result");
      button.innerHTML = `<span>${match.type}</span><strong>${escapeHtml(match.title)}</strong><p>${escapeHtml(match.detail)}</p>`;
      button.addEventListener("click", match.action);
      results.appendChild(button);
    }
  };

  input.addEventListener("input", search);
  shell.querySelectorAll(".search-scope input").forEach((checkbox) => checkbox.addEventListener("change", search));
  return record;
}
