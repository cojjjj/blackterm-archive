const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function playCrtPowerOn() {
  const layer = document.querySelector("#crt-poweron");
  if (!layer) return;

  layer.classList.remove("hidden");
  layer.classList.remove("play");
  void layer.offsetWidth;
  layer.classList.add("play");

  await sleep(1150);

  layer.classList.add("hidden");
  layer.classList.remove("play");
}

async function typeText(element, text, speed = 22) {
  element.textContent = "";

  for (const character of String(text)) {
    element.textContent += character;
    await sleep(speed + Math.random() * 13);
  }
}

async function flashCorruption(element) {
  const original = element.textContent;
  const corrupted = original
    .split("")
    .map((character) => {
      if (character === " ") return " ";
      return Math.random() < 0.16 ? "█" : character;
    })
    .join("");

  element.textContent = corrupted;
  element.classList.add("boot-corrupt");
  await sleep(140);
  element.textContent = original;
  element.classList.remove("boot-corrupt");
}

class AmbientArchive {
  constructor() {
    this.context = null;
    this.gain = null;
    this.enabled = false;
    this.timer = null;
  }

  async enable() {
    if (this.enabled) return;

    this.context = this.context || new AudioContext();
    this.gain = this.context.createGain();
    this.gain.gain.value = 0.018;
    this.gain.connect(this.context.destination);

    const oscillator = this.context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 52;
    oscillator.connect(this.gain);
    oscillator.start();

    this.enabled = true;
    this.scheduleClick();
  }

  disable() {
    this.enabled = false;
    clearTimeout(this.timer);

    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }

  scheduleClick() {
    if (!this.enabled || !this.context) return;

    this.timer = setTimeout(() => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();

      oscillator.type = "square";
      oscillator.frequency.value = 850;
      gain.gain.setValueAtTime(0.018, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.context.currentTime + 0.04
      );

      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + 0.05);
      this.scheduleClick();
    }, 7000 + Math.random() * 12000);
  }
}

export async function runBoot(api) {
  const overlay = document.querySelector("#boot-sequence");
  const lines = document.querySelector("#boot-lines");
  const progress = document.querySelector("#boot-progress-bar");
  const summary = document.querySelector("#boot-summary");
  const continueButton = document.querySelector("#boot-continue");
  const title = overlay?.querySelector("h2");

  if (!overlay || !title) return;

  const payload = await api("/api/living/boot");

  await playCrtPowerOn();
  overlay.classList.remove("hidden");
  lines.replaceChildren();
  summary.textContent = "";
  continueButton.classList.add("hidden");
  progress.style.width = "0%";


  const networkLabel = overlay.querySelector(".eyebrow");

  if (networkLabel && Math.random() < 0.13) {
    const original = networkLabel.textContent;
    networkLabel.textContent = "UNKNOWN NETWORK";
    networkLabel.classList.add("boot-network-flicker");
    await sleep(220);
    networkLabel.textContent = original;
    await sleep(140);
    networkLabel.classList.remove("boot-network-flicker");
  }

  await typeText(title, "RESTORING SESSION", 42);
  await sleep(280);

  let displayedProgress = 4;
  progress.style.width = `${displayedProgress}%`;

  for (let index = 0; index < payload.boot_steps.length; index += 1) {
    const step = payload.boot_steps[index];
    const row = document.createElement("div");
    row.className = "boot-step";

    const label = document.createElement("span");
    label.className = "boot-step-label";

    const state = document.createElement("strong");
    state.className = "boot-step-state";

    row.append(label, state);
    lines.appendChild(row);

    await typeText(label, `> ${step.text}...`, 15);
    await sleep(130 + Math.random() * 180);
    await typeText(state, step.state, 17);

    displayedProgress = Math.min(
      92,
      Math.round(((index + 1) / payload.boot_steps.length) * 88) + 5
    );
    progress.style.width = `${displayedProgress}%`;

    if (index === 2 && Math.random() < 0.45) {
      await flashCorruption(label);
    }
  }

  if (payload.anomaly) {
    const warning = document.createElement("p");
    warning.className = "boot-warning";
    lines.appendChild(warning);

    await typeText(warning, `WARNING: ${payload.anomaly}`, 18);
    await sleep(520);
    await typeText(warning, "WARNING CLEARED.", 24);
  }

  const shouldStall = Math.random() < 0.16;

  if (shouldStall) {
    progress.style.width = "99%";

    const stall = document.createElement("p");
    stall.className = "boot-stall";
    lines.appendChild(stall);

    await typeText(stall, "Searching...", 34);
    await sleep(850);
    stall.textContent += "\nSearching...";
    await sleep(850);
    stall.textContent += "\nSearching...";
    await sleep(1100);
    stall.textContent += "\n\nAnother observer is already connected.";
    await sleep(1250);
    stall.textContent += "\nIgnoring conflict.";
    await sleep(700);
  }

  progress.style.width = "100%";
  await sleep(420);

  const sessionLines = [
    `Observer recognized: ${payload.codename}`,
    `Unread transmissions: ${payload.unread_events}`,
    `Unread mail: ${payload.unread_mail}`,
    `Completed cases: ${payload.completed_cases}`,
  ];

  if (payload.last_command) {
    sessionLines.push(`Previous command: ${payload.last_command}`);
    sessionLines.push("Previous session ended without logout.");
  }

  for (const lineText of sessionLines) {
    const line = document.createElement("div");
    summary.appendChild(line);
    await typeText(line, lineText, 16);
  }

  const authorization = document.createElement("div");
  authorization.className = "boot-step-state";
  authorization.textContent = "AUTHORIZATION REQUIRED";
  summary.appendChild(authorization);

  continueButton.classList.remove("hidden");
  continueButton.classList.add("boot-authorizing");
  continueButton.disabled = true;

  await sleep(900);

  continueButton.disabled = false;
  continueButton.classList.remove("boot-authorizing");
  continueButton.focus();

  await new Promise((resolve) => {
    const proceed = () => {
      continueButton.removeEventListener("click", proceed);
      window.removeEventListener("keydown", onKey);
      resolve();
    };

    const onKey = (event) => {
      if (event.key === "Enter") proceed();
    };

    continueButton.addEventListener("click", proceed);
    window.addEventListener("keydown", onKey);
  });

  overlay.classList.add("boot-exit");
  await sleep(320);
  overlay.classList.add("hidden");
  overlay.classList.remove("boot-exit");
}

export function mountLivingArchive(api) {
  const heartbeat = document.querySelector("#living-heartbeat");
  const mailCount = document.querySelector("#living-mail-count");
  const eventCount = document.querySelector("#living-event-count");
  const integrity = document.querySelector("#living-integrity");
  const audioButton = document.querySelector("#ambient-toggle");
  const ambient = new AmbientArchive();

  const states = ["ONLINE", "SYNCING", "OBSERVING", "MONITORING", "INDEXING"];
  let stateIndex = 0;

  async function refresh() {
    try {
      const payload = await api("/api/living/status");
      heartbeat.textContent = states[stateIndex % states.length];
      stateIndex += 1;
      mailCount.textContent = payload.unread_mail;
      eventCount.textContent = payload.unread_events;
      integrity.textContent = `${payload.archive_integrity}%`;

      if (Math.random() < 0.14) {
        document.body.classList.add("archive-pulse");
        setTimeout(() => document.body.classList.remove("archive-pulse"), 800);
      }
    } catch {
      heartbeat.textContent = "OFFLINE";
    }
  }

  audioButton?.addEventListener("click", async () => {
    if (ambient.enabled) {
      ambient.disable();
      audioButton.textContent = "AUDIO: OFF";
    } else {
      await ambient.enable();
      audioButton.textContent = "AUDIO: ON";
    }
  });

  refresh();
  setInterval(refresh, 6000);
}
