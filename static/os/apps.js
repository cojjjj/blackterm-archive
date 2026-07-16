import { mountTerminal } from "../terminal/index.js";
import { VirtualFileSystem } from "../terminal/filesystem.js";
import { installCoreApps } from "./core-apps.js";

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export class AppRegistry {
  constructor({ api, windows }) {
    this.api = api;
    this.windows = windows;
    this.apps = new Map();
    this.registerDefaults();
    installCoreApps(this);
  }

  register(id, definition) {
    this.apps.set(id, definition);
  }

  open(id) {
    const app = this.apps.get(id);
    if (!app) return;
    return app.open();
  }

  openTextFile(name, content) {
    const shell = el("div", "text-viewer-app");
    shell.append(
      el("span", "eyebrow", "DESKTOP FILE"),
      el("h2", "", name),
      el("pre", "file-content", content),
    );

    return this.windows.open({
      id: `text-${name}`,
      title: name,
      content: shell,
      width: 680,
      height: 480,
    });
  }

  registerDefaults() {
    this.register("terminal", {
      open: () => {
        const content = document.querySelector("#terminal-app-template").content.cloneNode(true);
        return this.windows.open({
          id: "terminal",
          title: "Archive Terminal",
          content,
          width: 900,
          height: 590,
          onOpen: async () => {
            await mountTerminal(this.api);
            setTimeout(() => document.querySelector("#terminal-input")?.focus(), 50);
          },
        });
      },
    });

    this.register("mail", {
      open: () => this.openMail(),
    });

    this.register("archive", {
      open: () => this.openArchive(),
    });

    this.register("explorer", {
      open: () => this.openExplorer(),
    });
  }

  async openMail() {
    const shell = el("div", "mail-app mail-starting");
    const list = el("aside", "mail-list");
    const folders = el("nav", "mail-folders");
    folders.innerHTML = `
      <button class="active">INBOX <span data-folder-count>0</span></button>
      <button>PRIORITY</button>
      <button>RECOVERED</button>
      <button>ARCHIVED</button>
      <button>DELETED</button>
    `;
    const viewer = el("section", "mail-viewer");
    const sync = el("div", "mail-sync-overlay");
    sync.innerHTML = `
      <span>SECURE MAIL CHANNEL</span>
      <strong data-sync-label>SYNCING INBOX...</strong>
      <div class="mail-sync-track"><i></i></div>
      <small data-unread-count>0 UNREAD</small>
    `;
    viewer.innerHTML = '<p class="empty-state">Select a transmission.</p>';
    const leftPane = el("div", "mail-left-pane");
    leftPane.append(folders, list);
    shell.append(leftPane, viewer, sync);

    const record = this.windows.open({
      id: "mail",
      title: "Archive Mail",
      content: shell,
      width: 900,
      height: 570,
    });

    const messages = await this.api("/api/living/mail");
    const unreadTotal = messages.filter((item) => !item.is_read).length;
    folders.querySelector("[data-folder-count]").textContent = unreadTotal;
    const unreadCounter = sync.querySelector("[data-unread-count]");
    const syncLabel = sync.querySelector("[data-sync-label]");
    list.replaceChildren();

    for (let value = 0; value <= unreadTotal; value += 1) {
      unreadCounter.textContent = `${value} UNREAD`;
      await new Promise((resolve) => setTimeout(resolve, 115));
    }

    syncLabel.textContent = "DECRYPTING MESSAGE INDEX...";
    await new Promise((resolve) => setTimeout(resolve, 420));

    for (let index = 0; index < messages.length; index += 1) {
      const item = messages[index];
      const button = el("button", `mail-item mail-arrival ${item.is_read ? "" : "unread"}`);
      button.style.setProperty("--arrival-index", index);
      button.innerHTML = `
        <span class="mail-priority-dot ${item.is_read ? "" : "active"}"></span>
        <strong>${item.sender}</strong>
        <span>${item.subject}</span>
        <small>${item.created_at}</small>
      `;
      button.addEventListener("click", async () => {
        for (const node of list.children) node.classList.remove("selected");
        button.classList.add("selected");
        button.classList.remove("unread");
        const message = await this.api(`/api/living/mail/${item.id}`);
        viewer.innerHTML = "";
        viewer.append(
          el("span", "eyebrow", `FROM ${message.sender}`),
          el("h2", "", message.subject),
          el("pre", "mail-body", message.body),
        );
      });
      list.appendChild(button);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }

    syncLabel.textContent = "INBOX SYNCHRONIZED";
    await new Promise((resolve) => setTimeout(resolve, 360));
    sync.classList.add("complete");
    shell.classList.remove("mail-starting");

    if (unreadTotal > 0) {
      const notice = el("div", "mail-new-notice");
      notice.textContent = `${unreadTotal} NEW TRANSMISSION${unreadTotal === 1 ? "" : "S"} RECOVERED`;
      shell.appendChild(notice);
      requestAnimationFrame(() => notice.classList.add("visible"));
      setTimeout(() => {
        notice.classList.remove("visible");
        setTimeout(() => notice.remove(), 250);
      }, 3500);
    }

    return record;
  }

  async openDossier(caseId) {
    const investigation = await this.api(`/api/cases/${caseId}`);
    const narrative = investigation.narrative;

    if (!narrative) {
      this.openExplorer(`/archive/cases/CASE-${String(investigation.sequence).padStart(3, "0")}-${investigation.slug}`);
      return;
    }

    const shell = el("div", "intelligence-dossier");
    const technical = narrative.technical_observations;
    const threat = narrative.threat_assessment;
    const indicators = narrative.indicators;
    const custody = narrative.chain_of_custody;

    shell.innerHTML = `
      <header class="dossier-cover">
        <div>
          <span>${narrative.directorate}</span>
          <strong>${narrative.division}</strong>
        </div>
        <div class="classification-stamp">${narrative.classification}</div>
      </header>

      <section class="dossier-identity">
        <article><span>CASE</span><strong>CASE-${String(investigation.sequence).padStart(3, "0")}</strong></article>
        <article><span>DESIGNATION</span><strong>${investigation.title}</strong></article>
        <article><span>STATUS</span><strong>${narrative.status}</strong></article>
        <article><span>PRIORITY</span><strong>${narrative.priority}</strong></article>
        <article><span>SEED</span><strong>${investigation.seed}</strong></article>
      </section>

      <nav class="dossier-nav">
        <button data-section="summary" class="active">SUMMARY</button>
        <button data-section="technical">TECHNICAL</button>
        <button data-section="timeline">TIMELINE</button>
        <button data-section="custody">CUSTODY</button>
        <button data-section="objectives">OBJECTIVES</button>
      </nav>

      <main class="dossier-content">
        <section data-dossier-section="summary">
          <h3>EXECUTIVE SUMMARY</h3>
          <p>${narrative.executive_summary}</p>

          <h3>INCIDENT OVERVIEW</h3>
          <p>${narrative.incident_overview}</p>

          <h3>PRELIMINARY ASSESSMENT</h3>
          <p>${narrative.preliminary_assessment}</p>

          <aside class="analyst-comment">
            <span>ANALYST COMMENT</span>
            <p>${narrative.analyst_note}</p>
          </aside>

          <div class="threat-grid">
            <article><span>OPERATIONAL RISK</span><strong>${threat.operational_risk}</strong></article>
            <article><span>CONFIDENCE</span><strong>${threat.confidence}</strong></article>
            <article><span>INTEGRITY</span><strong>${threat.evidence_integrity}</strong></article>
            <article><span>PERSISTENCE</span><strong>${threat.persistence}</strong></article>
            <article><span>ATTRIBUTION</span><strong>${threat.attribution}</strong></article>
            <article><span>RECOMMENDATION</span><strong>${threat.recommendation}</strong></article>
          </div>
        </section>

        <section data-dossier-section="technical" class="hidden">
          <h3>TECHNICAL OBSERVATIONS</h3>
          <div class="technical-grid">
            ${Object.entries(technical).map(([key, value]) =>
              `<article><span>${key.replaceAll("_", " ").toUpperCase()}</span><strong>${value}</strong></article>`
            ).join("")}
          </div>

          <h3>INDICATORS</h3>
          <dl class="dossier-list">
            ${Object.entries(indicators).map(([key, value]) =>
              `<dt>${key.replaceAll("_", " ").toUpperCase()}</dt><dd>${value}</dd>`
            ).join("")}
          </dl>

          <h3>RECOMMENDED ACTIONS</h3>
          <ol class="recommended-actions">
            ${narrative.recommended_actions.map((item) => `<li>${item}</li>`).join("")}
          </ol>
        </section>

        <section data-dossier-section="timeline" class="hidden">
          <h3>TIMELINE RECONSTRUCTION</h3>
          <div class="intelligence-timeline">
            ${narrative.timeline.map((item) => `
              <article>
                <time>${item.time}</time>
                <span>${item.year}</span>
                <p>${item.event}</p>
              </article>
            `).join("")}
          </div>
        </section>

        <section data-dossier-section="custody" class="hidden">
          <h3>CHAIN OF CUSTODY</h3>
          <dl class="dossier-list">
            ${Object.entries(custody).map(([key, value]) =>
              `<dt>${key.replaceAll("_", " ").toUpperCase()}</dt><dd>${value}</dd>`
            ).join("")}
          </dl>

          <h3>ASSIGNED OPERATOR</h3>
          <dl class="dossier-list">
            ${Object.entries(narrative.operator_profile).map(([key, value]) =>
              `<dt>${key.replaceAll("_", " ").toUpperCase()}</dt><dd>${value}</dd>`
            ).join("")}
          </dl>

          <aside class="declassified-fragment">
            <span>DECLASSIFIED EXCERPT</span>
            <p>${narrative.lore_fragment}</p>
          </aside>
        </section>

        <section data-dossier-section="objectives" class="hidden">
          <h3>INVESTIGATIVE OBJECTIVES</h3>
          <div class="dossier-objectives">
            ${investigation.objectives.map((objective, index) => `
              <form data-objective-id="${objective.id}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <label>
                  ${objective.prompt}
                  <input ${objective.solved ? "disabled" : ""} placeholder="${objective.solved ? "OBJECTIVE RESOLVED" : "ENTER ANALYST FINDING"}">
                </label>
                <button ${objective.solved ? "disabled" : ""}>${objective.solved ? "VERIFIED" : "SUBMIT"}</button>
                <small></small>
              </form>
            `).join("")}
          </div>
        </section>
      </main>

      <footer class="dossier-footer">
        <button data-open-evidence>OPEN EVIDENCE LOCKER</button>
        <span>DISTRIBUTION OUTSIDE AUTHORIZED OBSERVER CHANNELS IS PROHIBITED.</span>
      </footer>
    `;

    const record = this.windows.open({
      id: `dossier-${caseId}`,
      title: `Intelligence Dossier // ${investigation.title}`,
      content: shell,
      width: 1050,
      height: 720,
    });

    shell.querySelectorAll("[data-section]").forEach((button) => {
      button.addEventListener("click", () => {
        shell.querySelectorAll("[data-section]").forEach((item) => item.classList.remove("active"));
        shell.querySelectorAll("[data-dossier-section]").forEach((section) => section.classList.add("hidden"));
        button.classList.add("active");
        shell.querySelector(`[data-dossier-section="${button.dataset.section}"]`).classList.remove("hidden");
      });
    });

    shell.querySelectorAll("[data-objective-id]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.querySelector("input");
        const status = form.querySelector("small");
        const result = await this.api(`/api/cases/${caseId}/submit`, {
          method: "POST",
          body: JSON.stringify({
            objective_id: form.dataset.objectiveId,
            answer: input.value,
          }),
        });
        status.textContent = result.message;
        if (result.correct) {
          input.disabled = true;
          form.querySelector("button").disabled = true;
          form.querySelector("button").textContent = "VERIFIED";
        }
      });
    });

    shell.querySelector("[data-open-evidence]").addEventListener("click", () => {
      this.openExplorer(`/archive/cases/CASE-${String(investigation.sequence).padStart(3, "0")}-${investigation.slug}`);
    });

    return record;
  }

  async openArchive() {
    const shell = el("div", "archive-app");
    shell.innerHTML = `
      <nav class="archive-tabs">
        <button data-tab="cases" class="active">CASES</button>
        <button data-tab="nodes">NODES</button>
        <button data-tab="events">EVENTS</button>
        <button data-tab="world">LIVING ARCHIVE</button>
      </nav>
      <section class="archive-panel"></section>
    `;

    const record = this.windows.open({
      id: "archive",
      title: "The Archive",
      content: shell,
      width: 980,
      height: 650,
    });

    const panel = shell.querySelector(".archive-panel");

    const renderCases = async () => {
      const cases = await this.api("/api/cases");
      panel.replaceChildren();
      for (const item of cases) {
        const card = el("article", `os-card ${item.completed ? "resolved" : ""}`);
        card.innerHTML = `
          <span class="eyebrow">CASE-${String(item.sequence).padStart(3, "0")}</span>
          <h3>${item.title}</h3>
          <p>${item.briefing}</p>
          <div class="card-meta">${item.category} // difficulty ${item.difficulty} // ${item.progress}%</div>
          <button ${item.unlocked ? "" : "disabled"}>OPEN CASE</button>
        `;
        card.querySelector("button").addEventListener("click", () => {
          if (item.narrative) {
            this.openDossier(item.id);
          } else {
            this.openExplorer(`/archive/cases/CASE-${String(item.sequence).padStart(3, "0")}-${item.slug}`);
          }
        });
        panel.appendChild(card);
      }
    };

    const renderNodes = async () => {
      const nodes = await this.api("/api/challenges");
      panel.replaceChildren();
      for (const item of nodes) {
        const card = el("article", `os-card ${item.solved ? "resolved" : ""}`);
        card.innerHTML = `
          <span class="eyebrow">NODE ${String(item.sequence).padStart(3, "0")}</span>
          <h3>${item.title}</h3>
          <p>${item.briefing}</p>
          <div class="card-meta">${item.category} // difficulty ${item.difficulty}</div>
          ${item.artifact ? `<pre>${item.artifact}</pre>` : ""}
          ${item.solved ? "<strong>RESOLVED</strong>" : `
            <form><input placeholder="ENTER RESPONSE"><button>SUBMIT</button></form>
            <p class="result"></p>
          `}
        `;
        const form = card.querySelector("form");
        if (form) {
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const answer = form.querySelector("input").value;
            const result = await this.api(`/api/challenges/${item.id}/submit`, {
              method: "POST",
              body: JSON.stringify({ answer }),
            });
            card.querySelector(".result").textContent = result.message;
            if (result.correct) renderNodes();
          });
        }
        panel.appendChild(card);
      }
    };

    const renderEvents = async () => {
      const events = await this.api("/api/living/events");
      panel.replaceChildren();
      for (const item of events) {
        const card = el("article", "os-card");
        card.innerHTML = `<span class="eyebrow">${item.event_type}</span><h3>${item.title}</h3><p>${item.detail}</p><small>${item.created_at}</small>`;
        panel.appendChild(card);
      }
    };

    const renderWorld = async () => {
      const world = await this.api("/api/world/state");
      panel.innerHTML = `
        <section class="living-world-summary">
          <article><span>GENERATED CASES</span><strong>${world.summary.generated_cases}</strong></article>
          <article><span>KNOWN RELAYS</span><strong>${world.summary.known_relays}</strong></article>
          <article><span>KNOWN OPERATORS</span><strong>${world.summary.known_operators}</strong></article>
          <article><span>LORE FRAGMENTS</span><strong>${world.summary.unlocked_lore}</strong></article>
        </section>

        <section class="living-world-columns">
          <article>
            <h3>RECURRING RELAYS</h3>
            ${Object.entries(world.entities.relays).map(([id, relay]) => `
              <button class="world-entity">
                <strong>${id}</strong>
                <span>${relay.cluster}</span>
                <small>${relay.appearances} appearance(s) // ${relay.status}</small>
              </button>
            `).join("") || '<p class="empty-state">No relays discovered.</p>'}
          </article>

          <article>
            <h3>RECURRING OPERATORS</h3>
            ${Object.entries(world.entities.operators).map(([name, operator]) => `
              <button class="world-entity">
                <strong>${name}</strong>
                <span>Clearance ${operator.clearance}</span>
                <small>${operator.appearances} appearance(s) // ${operator.status}</small>
              </button>
            `).join("") || '<p class="empty-state">No operators discovered.</p>'}
          </article>
        </section>

        <section class="living-lore">
          <h3>RECOVERED LORE</h3>
          ${world.lore_fragments.map((fragment, index) => `
            <blockquote><span>FRAGMENT ${String(index + 1).padStart(3, "0")}</span>${fragment}</blockquote>
          `).join("") || '<p class="empty-state">No fragments unlocked.</p>'}
        </section>
      `;
    };

    const renderers = { cases: renderCases, nodes: renderNodes, events: renderEvents, world: renderWorld };
    shell.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        shell.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        renderers[button.dataset.tab]();
      });
    });

    await renderCases();
    return record;
  }

  async openExplorer(initialPath = null) {
    let record = this.windows.windows.get("explorer");
    if (record) {
      record.element.classList.remove("minimized");
      this.windows.focus(record.element);
      if (record.navigate && initialPath) record.navigate(initialPath);
      return record;
    }

    const shell = el("div", "explorer-app explorer-starting details-view");
    shell.innerHTML = `
      <div class="explorer-toolbar">
        <button data-nav="back" title="Back">←</button>
        <button data-nav="forward" title="Forward">→</button>
        <button data-nav="up" title="Up">↑</button>
        <button data-nav="refresh" title="Refresh">↻</button>
        <div class="explorer-breadcrumbs"></div>
        <input class="explorer-search" placeholder="SEARCH CURRENT FOLDER">
        <button data-view="grid" title="Grid view">▦</button>
        <button data-view="details" class="active" title="Details view">☷</button>
      </div>

      <div class="explorer-layout">
        <aside class="explorer-sidebar">
          <section>
            <h4>QUICK ACCESS</h4>
            <button data-path="/archive">★ Archive</button>
            <button data-path="/archive/cases">◆ Cases</button>
            <button data-path="/archive/artifacts">◈ Evidence</button>
          </section>

          <section>
            <h4>FAVORITES</h4>
            <button data-path="/archive/artifacts">☆ Recovered</button>
            <button data-path="/users">☆ Observer Files</button>
          </section>

          <section>
            <h4>RECENT</h4>
            <button data-path="/logs">◷ Logs</button>
            <button data-path="/archive/cases/CASE-001-dead-relay">◷ Dead Relay</button>
          </section>

          <section>
            <h4>SYSTEM</h4>
            <button data-path="/">ROOT</button>
            <button data-path="/archive">ARCHIVE</button>
            <button data-path="/archive/cases">CASES</button>
            <button data-path="/archive/artifacts">EVIDENCE</button>
            <button data-path="/users">USERS</button>
            <button data-path="/logs">LOGS</button>
          </section>
        </aside>

        <section class="explorer-main">
          <header class="explorer-column-head">
            <span>NAME</span>
            <span>TYPE</span>
            <span>SIZE</span>
            <span>PERMISSIONS</span>
          </header>
          <section class="explorer-files"></section>
        </section>

        <aside class="file-preview">
          <div class="preview-empty">
            <span class="eyebrow">EVIDENCE PREVIEW</span>
            <p>Select a file or folder.</p>
          </div>
        </aside>
      </div>

      <footer class="explorer-status">
        <span class="explorer-count">0 items</span>
        <span class="explorer-selection">Nothing selected</span>
        <span>BLACKTERM EVIDENCE LOCKER</span>
      </footer>

      <div class="explorer-context-menu hidden">
        <button data-context="open">OPEN</button>
        <button data-context="properties">PROPERTIES</button>
        <button data-context="hex">OPEN IN HEX VIEWER</button>
        <button data-context="image">OPEN IN IMAGE VIEWER</button>
        <button data-context="audio">OPEN IN AUDIO CONSOLE</button>
      </div>
    `;

    record = this.windows.open({
      id: "explorer",
      title: "File Explorer",
      content: shell,
      width: 1180,
      height: 700,
    });

    const sidebarButtons = [...shell.querySelectorAll(".explorer-sidebar button")];
    sidebarButtons.forEach((button, index) => {
      button.classList.add("explorer-folder-arrival");
      button.style.setProperty("--folder-index", index);
    });

    await new Promise((resolve) => setTimeout(resolve, 420));
    shell.classList.remove("explorer-starting");

    const payload = await this.api("/api/filesystem");
    const worldState = await this.api("/api/world/state").catch(() => ({ summary: { unlocked_folders: [] } }));
    const artifactList = await this.api("/api/artifacts").catch(() => []);

    const ensureDirectory = (path) => {
      const parts = path.split("/").filter(Boolean);
      let current = payload.root;
      for (const part of parts) {
        current.children = current.children || {};
        current.children[part] = current.children[part] || {
          type: "directory",
          permissions: "dr-x------",
          hidden: false,
          children: {},
        };
        current = current.children[part];
      }
      return current;
    };

    for (const folderPath of worldState.summary.unlocked_folders || []) {
      const directory = ensureDirectory(folderPath);
      directory.children["README.classified"] = {
        type: "file",
        permissions: "-r--------",
        hidden: false,
        content: `ACCESS GRANTED\n\n${folderPath}\n\nThis directory was unlocked by Living Archive progression.`,
      };
    }
    const artifactMap = new Map(artifactList.map((item) => [item.id, item]));

    const fs = new VirtualFileSystem(payload.root, payload.home);
    const breadcrumbs = shell.querySelector(".explorer-breadcrumbs");
    const searchInput = shell.querySelector(".explorer-search");
    const files = shell.querySelector(".explorer-files");
    const preview = shell.querySelector(".file-preview");
    const countLabel = shell.querySelector(".explorer-count");
    const selectionLabel = shell.querySelector(".explorer-selection");
    const contextMenu = shell.querySelector(".explorer-context-menu");

    const history = [];
    let historyIndex = -1;
    let currentEntries = [];
    let selectedEntry = null;
    let viewMode = "details";

    const formatSize = (entry) => {
      const artifact = entry.node.artifact_id
        ? artifactMap.get(entry.node.artifact_id)
        : null;
      const size = artifact?.size;

      if (!Number.isFinite(size)) {
        return entry.node.type === "directory" ? "—" : `${(entry.node.content || "").length} B`;
      }

      const units = ["B", "KB", "MB", "GB"];
      let value = size;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
    };

    const typeLabel = (entry) => {
      if (entry.node.type === "directory") return "Folder";
      if (entry.node.type === "artifact") {
        const artifact = artifactMap.get(entry.node.artifact_id);
        return artifact?.mime_type || "Artifact";
      }
      return "Text document";
    };

    const classificationFor = (entry) => {
      if (entry.node.type === "directory") return "ARCHIVE DIRECTORY";
      if (entry.node.type === "artifact") return "RECOVERED EVIDENCE";
      return "ARCHIVE RECORD";
    };

    const metadataFor = (entry) => {
      const artifact = entry.node.artifact_id
        ? artifactMap.get(entry.node.artifact_id)
        : null;

      return {
        name: entry.name,
        type: typeLabel(entry),
        size: formatSize(entry),
        permissions: entry.node.permissions || "---",
        classification: classificationFor(entry),
        sha256: artifact?.sha256 || "Not indexed",
        description: artifact?.description || (
          entry.node.type === "directory"
            ? "Contains Archive records and evidence."
            : "Virtual filesystem record."
        ),
        relatedCase: entry.name.toLowerCase().includes("relay") ? "CASE-001" : "Unassigned",
        artifact,
      };
    };

    const openEntry = (entry) => {
      if (!entry) return;

      if (entry.node.type === "directory") {
        render(fs.normalize(entry.name));
        return;
      }

      if (entry.node.type === "artifact") {
        const artifact = artifactMap.get(entry.node.artifact_id);
        if (artifact?.mime_type?.startsWith("image/")) {
          this.open("images");
        } else if (artifact?.mime_type?.startsWith("audio/")) {
          this.open("audio");
        } else {
          this.open("hex");
        }
        return;
      }

      this.openTextFile(entry.name, entry.node.content || "");
    };

    const showPreview = (entry) => {
      selectedEntry = entry;
      const meta = metadataFor(entry);
      selectionLabel.textContent = meta.name;

      let mediaPreview = "";
      if (meta.artifact?.mime_type?.startsWith("image/")) {
        mediaPreview = `<img class="preview-thumbnail" src="/api/artifacts/${meta.artifact.id}/download" alt="">`;
      } else if (meta.artifact?.mime_type?.startsWith("audio/")) {
        mediaPreview = `<div class="preview-audio-mark">♫</div>`;
      } else {
        mediaPreview = `<div class="preview-file-mark">${entry.node.type === "directory" ? "▣" : "▤"}</div>`;
      }

      preview.innerHTML = `
        <span class="eyebrow">${meta.classification}</span>
        ${mediaPreview}
        <h3>${meta.name}</h3>
        <dl class="metadata-list">
          <dt>Type</dt><dd>${meta.type}</dd>
          <dt>Size</dt><dd>${meta.size}</dd>
          <dt>Permissions</dt><dd>${meta.permissions}</dd>
          <dt>SHA-256</dt><dd class="hash-value">${meta.sha256}</dd>
          <dt>Classification</dt><dd>${meta.classification}</dd>
          <dt>Related case</dt><dd>${meta.relatedCase}</dd>
        </dl>
        <p>${meta.description}</p>
        <div class="preview-actions">
          <button data-preview-open>OPEN</button>
          <button data-preview-properties>PROPERTIES</button>
        </div>
      `;

      preview.querySelector("[data-preview-open]").addEventListener("click", () => openEntry(entry));
      preview.querySelector("[data-preview-properties]").addEventListener("click", () => {
        preview.classList.toggle("show-full-metadata");
      });
    };

    const createEntryButton = (entry, entryIndex) => {
      const button = el("button", `file-entry file-populate ${entry.node.type}`);
      button.style.setProperty("--file-index", entryIndex);
      button.draggable = true;

      button.innerHTML = `
        <span class="file-icon">${entry.node.type === "directory" ? "▣" : entry.node.type === "artifact" ? "⬇" : "▤"}</span>
        <strong>${entry.name}${entry.node.type === "directory" ? "/" : ""}</strong>
        <span class="file-type">${typeLabel(entry)}</span>
        <span class="file-size">${formatSize(entry)}</span>
        <small>${entry.node.permissions || "---"}</small>
      `;

      button.addEventListener("click", () => {
        files.querySelectorAll(".selected").forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        showPreview(entry);
      });

      button.addEventListener("dblclick", () => openEntry(entry));

      button.addEventListener("dragstart", (event) => {
        const meta = metadataFor(entry);
        const payload = {
          name: entry.name,
          type: entry.node.type,
          artifact_id: entry.node.artifact_id || null,
          mime_type: meta.artifact?.mime_type || null,
          path: fs.normalize(entry.name),
          content: entry.node.content || "",
        };
        event.dataTransfer.setData("application/x-blackterm-file", JSON.stringify(payload));
        event.dataTransfer.effectAllowed = "copy";
        button.classList.add("dragging");
      });

      button.addEventListener("dragend", () => {
        button.classList.remove("dragging");
      });

      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        selectedEntry = entry;
        showPreview(entry);
        contextMenu.style.left = `${event.clientX}px`;
        contextMenu.style.top = `${event.clientY}px`;
        contextMenu.classList.remove("hidden");
      });

      return button;
    };

    const drawEntries = (entries) => {
      files.replaceChildren();
      shell.classList.toggle("grid-view", viewMode === "grid");
      shell.classList.toggle("details-view", viewMode === "details");

      entries.forEach((entry, index) => {
        files.appendChild(createEntryButton(entry, index));
      });

      countLabel.textContent = `${entries.length} item${entries.length === 1 ? "" : "s"}`;
    };

    const render = (path = fs.cwd) => {
      const resolved = fs.resolve(path);
      if (resolved.node.type !== "directory") return;

      fs.cwd = resolved.path;

      if (history[historyIndex] !== fs.cwd) {
        history.splice(historyIndex + 1);
        history.push(fs.cwd);
        historyIndex = history.length - 1;
      }

      breadcrumbs.replaceChildren();
      const parts = fs.cwd.split("/").filter(Boolean);

      const rootCrumb = el("button", "crumb", "ROOT");
      rootCrumb.addEventListener("click", () => render("/"));
      breadcrumbs.appendChild(rootCrumb);

      let built = "";
      for (const part of parts) {
        built += `/${part}`;
        const divider = el("span", "crumb-divider", "›");
        const crumb = el("button", "crumb", part);
        const destination = built;
        crumb.addEventListener("click", () => render(destination));
        breadcrumbs.append(divider, crumb);
      }

      currentEntries = fs.list(".", { all: true });
      selectedEntry = null;
      selectionLabel.textContent = "Nothing selected";
      preview.innerHTML = `
        <div class="preview-empty">
          <span class="eyebrow">EVIDENCE PREVIEW</span>
          <p>Select a file or folder.</p>
        </div>
      `;
      drawEntries(currentEntries);
    };

    record.navigate = render;

    shell.querySelector('[data-nav="back"]').addEventListener("click", () => {
      if (historyIndex > 0) {
        historyIndex -= 1;
        const target = history[historyIndex];
        const previousLength = history.length;
        render(target);
        history.splice(previousLength);
      }
    });

    shell.querySelector('[data-nav="forward"]').addEventListener("click", () => {
      if (historyIndex < history.length - 1) {
        historyIndex += 1;
        const target = history[historyIndex];
        const previousLength = history.length;
        render(target);
        history.splice(previousLength);
      }
    });

    shell.querySelector('[data-nav="up"]').addEventListener("click", () => render(".."));
    shell.querySelector('[data-nav="refresh"]').addEventListener("click", () => render(fs.cwd));

    shell.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        viewMode = button.dataset.view;
        shell.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        drawEntries(currentEntries);
      });
    });

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();
      const filtered = currentEntries.filter((entry) =>
        `${entry.name} ${typeLabel(entry)} ${entry.node.content || ""}`.toLowerCase().includes(query)
      );
      drawEntries(filtered);
      countLabel.textContent = `${filtered.length} shown / ${currentEntries.length} total`;
    });

    shell.querySelectorAll("[data-path]").forEach((button) => {
      button.addEventListener("click", () => render(button.dataset.path));
    });

    document.addEventListener("click", () => contextMenu.classList.add("hidden"));

    contextMenu.querySelector('[data-context="open"]').addEventListener("click", () => openEntry(selectedEntry));
    contextMenu.querySelector('[data-context="properties"]').addEventListener("click", () => {
      if (selectedEntry) showPreview(selectedEntry);
      preview.classList.add("show-full-metadata");
    });
    contextMenu.querySelector('[data-context="hex"]').addEventListener("click", () => this.open("hex"));
    contextMenu.querySelector('[data-context="image"]').addEventListener("click", () => this.open("images"));
    contextMenu.querySelector('[data-context="audio"]').addEventListener("click", () => this.open("audio"));

    render(initialPath || payload.home);
    return record;
  }
}
