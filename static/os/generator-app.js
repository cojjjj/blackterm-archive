function createNode(tag, className = "", text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function installInvestigationGenerator(registry) {
  registry.register("generator", {
    open: () => openGenerator(registry),
  });
}

async function openGenerator(registry) {
  const { api, windows } = registry;

  const shell = createNode("div", "generator-app");
  shell.innerHTML = `
    <header class="app-toolbar generator-header">
      <div>
        <span class="eyebrow">ARCHIVE CORE</span>
        <h2>Investigation Generator</h2>
      </div>
      <span class="generator-status">DETERMINISTIC ENGINE // READY</span>
    </header>

    <section class="generator-layout">
      <section class="generator-controls">
        <label>
          INVESTIGATION SEED
          <div class="seed-control">
            <input data-seed maxlength="9" placeholder="AUTO-GENERATE">
            <button data-random-seed>RANDOM</button>
          </div>
          <small>Share a seed to reproduce the same investigation.</small>
        </label>

        <label>
          DIFFICULTY
          <input data-difficulty type="range" min="1" max="5" value="3">
          <output data-difficulty-label>3 // ANALYST</output>
        </label>

        <div class="generation-capabilities">
          <span>BRIEFING</span><span>OBJECTIVES</span><span>MAIL</span>
          <span>LOG</span><span>JSON</span><span>PNG</span>
          <span>WAV</span><span>PCAP</span><span>ZIP</span>
        </div>

        <button class="generator-primary" data-generate>GENERATE INVESTIGATION</button>
      </section>

      <section class="generator-console">
        <div class="generator-terminal">
          <p>&gt; Case generation subsystem online.</p>
          <p>&gt; Synthetic evidence mode enabled.</p>
          <p>&gt; Awaiting seed.</p>
        </div>
        <div class="generator-progress"><i></i></div>
      </section>

      <section class="generator-result">
        <div class="generator-empty">
          <span class="generator-core-mark">∞</span>
          <p>No generated investigation loaded.</p>
        </div>
      </section>

      <aside class="generator-history">
        <h3>GENERATED ARCHIVE</h3>
        <div data-history></div>
      </aside>
    </section>
  `;

  const record = windows.open({
    id: "generator",
    title: "Investigation Generator",
    content: shell,
    width: 1180,
    height: 720,
  });

  const seedInput = shell.querySelector("[data-seed]");
  const difficulty = shell.querySelector("[data-difficulty]");
  const difficultyLabel = shell.querySelector("[data-difficulty-label]");
  const consoleElement = shell.querySelector(".generator-terminal");
  const progress = shell.querySelector(".generator-progress i");
  const resultPane = shell.querySelector(".generator-result");
  const historyPane = shell.querySelector("[data-history]");
  const generateButton = shell.querySelector("[data-generate]");

  const difficultyNames = {
    1: "OBSERVER",
    2: "INVESTIGATOR",
    3: "ANALYST",
    4: "ARCHIVIST",
    5: "DIRECTOR",
  };

  const randomSeed = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const part = () => Array.from({ length: 4 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join("");
    return `${part()}-${part()}`;
  };

  const appendLine = async (text, state = "") => {
    const row = createNode("div", "generator-line");
    row.innerHTML = `<span>&gt; ${text}</span><strong>${state}</strong>`;
    consoleElement.appendChild(row);
    consoleElement.scrollTop = consoleElement.scrollHeight;
    await wait(150 + Math.random() * 130);
  };

  const refreshHistory = async () => {
    const records = await api("/api/generator/investigations");
    historyPane.replaceChildren();

    if (!records.length) {
      historyPane.innerHTML = `<p class="empty-state">No generated seeds.</p>`;
      return;
    }

    for (const item of [...records].reverse().slice(0, 20)) {
      const button = createNode("button", "generator-history-item");
      button.innerHTML = `
        <strong>${item.seed}</strong>
        <span>${item.case_id}</span>
        <small>${item.artifact_ids.length} artifacts</small>
      `;
      button.addEventListener("click", () => {
        seedInput.value = item.seed;
      });
      historyPane.appendChild(button);
    }
  };

  shell.querySelector("[data-random-seed]").addEventListener("click", () => {
    seedInput.value = randomSeed();
  });

  difficulty.addEventListener("input", () => {
    difficultyLabel.value = `${difficulty.value} // ${difficultyNames[difficulty.value]}`;
  });

  generateButton.addEventListener("click", async () => {
    generateButton.disabled = true;
    resultPane.innerHTML = `<div class="generator-empty"><span class="generator-core-mark">◌</span><p>Generation in progress.</p></div>`;
    consoleElement.replaceChildren();
    progress.style.width = "2%";

    const seed = seedInput.value.trim() || randomSeed();
    seedInput.value = seed;

    try {
      await appendLine(`Initializing deterministic seed ${seed}...`, "LOCKED");
      progress.style.width = "14%";
      await appendLine("Selecting investigation archetype...", "COMPLETE");
      progress.style.width = "27%";
      await appendLine("Constructing briefing and objectives...", "COMPLETE");
      progress.style.width = "41%";
      await appendLine("Generating relay log and manifest...", "COMPLETE");
      progress.style.width = "54%";
      await appendLine("Rendering recovered image frame...", "COMPLETE");
      progress.style.width = "66%";
      await appendLine("Synthesizing audio transmission...", "COMPLETE");
      progress.style.width = "77%";
      await appendLine("Writing safe synthetic packet capture...", "COMPLETE");
      progress.style.width = "88%";
      await appendLine("Bundling generated evidence...", "COMPLETE");

      const payload = await api("/api/generator/investigations", {
        method: "POST",
        body: JSON.stringify({
          seed,
          difficulty: Number(difficulty.value),
        }),
      });

      progress.style.width = "100%";
      await appendLine(
        payload.created ? "Investigation published to Archive." : "Existing seeded investigation restored.",
        payload.created ? "CREATED" : "RESTORED",
      );

      const investigation = payload.case;
      resultPane.innerHTML = `
        <article class="generated-case-card">
          <span class="eyebrow">CASE-${String(investigation.sequence).padStart(3, "0")} // SEED ${payload.seed}</span>
          <h2>${investigation.title}</h2>
          <p>${investigation.briefing}</p>

          <div class="generated-case-metrics">
            <article><span>DIFFICULTY</span><strong>${investigation.difficulty}</strong></article>
            <article><span>CATEGORY</span><strong>${investigation.category}</strong></article>
            <article><span>OBJECTIVES</span><strong>${investigation.objectives.length}</strong></article>
            <article><span>ARTIFACTS</span><strong>${payload.artifact_ids.length}</strong></article>
          </div>

          <div class="generated-objectives">
            ${investigation.objectives.map((objective, index) =>
              `<p><span>${String(index + 1).padStart(2, "0")}</span>${objective.prompt}</p>`
            ).join("")}
          </div>

          <div class="generated-actions">
            <button data-open-archive>OPEN IN ARCHIVE</button>
            <button data-open-files>OPEN EVIDENCE</button>
            <button data-open-mail>READ TRANSMISSION</button>
          </div>
        </article>
      `;

      resultPane.querySelector("[data-open-archive]").addEventListener("click", () => registry.open("archive"));
      resultPane.querySelector("[data-open-files]").addEventListener("click", () => registry.open("explorer"));
      resultPane.querySelector("[data-open-mail]").addEventListener("click", () => registry.open("mail"));

      await refreshHistory();
    } catch (error) {
      progress.style.width = "0%";
      await appendLine(error.message || "Generation failed.", "FAULT");
      resultPane.innerHTML = `<p class="danger-text">Generation failed. Check the FastAPI console.</p>`;
    } finally {
      generateButton.disabled = false;
    }
  });

  await refreshHistory();
  return record;
}
