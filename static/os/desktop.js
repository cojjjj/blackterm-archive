import { WindowManager } from "./window-manager.js";
import { AppRegistry } from "./apps.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let notificationAudioContext = null;

function playNotificationTone(kind = "normal") {
  try {
    notificationAudioContext = notificationAudioContext || new AudioContext();
    const frequencies = kind === "warning" ? [330, 250] : [640, 860];
    frequencies.forEach((frequency, index) => {
      const oscillator = notificationAudioContext.createOscillator();
      const gain = notificationAudioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const start = notificationAudioContext.currentTime + index * 0.075;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.014, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
      oscillator.connect(gain);
      gain.connect(notificationAudioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.09);
    });
  } catch {
    // Audio is optional.
  }
}

function showToast(title, detail, tone = "normal") {
  const layer = document.querySelector("#toast-layer");
  if (!layer) return;

  const toast = document.createElement("article");
  toast.className = `os-toast ${tone}`;
  toast.innerHTML = `<span>${title}</span><p>${detail}</p>`;
  layer.appendChild(toast);
  playNotificationTone(tone);

  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 220);
  }, 4600);
}

async function applyLivingWorldState(api) {
  const desktop = document.querySelector("#desktop");
  const mailIcon = document.querySelector('[data-open-app="mail"]');
  const relayIcon = document.querySelector('[data-open-app="relay"]');

  try {
    const world = await api("/api/world/state");
    const state = world.summary.desktop_state || {};

    desktop.dataset.driftLevel = String(state.drift_level || 0);
    desktop.classList.toggle("living-mail-pulse", Boolean(state.mail_pulse));
    desktop.classList.toggle("living-relay-pulse", Boolean(state.relay_pulse));
    desktop.classList.toggle("living-wallpaper-glitch", Boolean(state.wallpaper_glitch));

    mailIcon?.classList.toggle("world-alert", Boolean(state.mail_pulse));
    relayIcon?.classList.toggle("world-alert", Boolean(state.relay_pulse));

    if (world.summary.global_events?.length) {
      const latest = world.summary.global_events.at(-1);
      showToast(latest.title, latest.detail, latest.status === "CLASSIFIED" ? "warning" : "normal");
    }
  } catch {
    // Living world is optional during initial migration.
  }
}

function mountScannerIllumination() {
  const desktop = document.querySelector("#desktop");
  if (!desktop) return;

  const pulse = () => {
    desktop.classList.add("scanner-illumination");
    setTimeout(() => desktop.classList.remove("scanner-illumination"), 1500);
  };

  pulse();
  setInterval(pulse, 8500);
}

function mountAmbientNotifications() {
  const notifications = [
    ["RELAY R-12", "Heartbeat received."],
    ["ARCHIVE", "Index synchronization complete."],
    ["NETWORK", "Recovered packet stored."],
    ["RELAY R-13", "Signal instability detected.", "warning"],
    ["SYSTEM", "Background integrity scan complete."],
    ["ECHO", "One unread fragment remains."],
  ];

  const schedule = () => {
    const delay = 18000 + Math.random() * 28000;
    setTimeout(() => {
      const item = notifications[Math.floor(Math.random() * notifications.length)];
      showToast(item[0], item[1], item[2] || "normal");
      schedule();
    }, delay);
  };

  schedule();
}

async function typeText(element, text, speed = 8) {
  element.textContent = "";
  for (const character of String(text)) {
    element.textContent += character;
    await sleep(speed + Math.random() * 8);
  }
}

async function typeBootstrapLine(
  container,
  label,
  state = "",
  tone = "normal",
  options = {},
) {
  const {
    typingSpeed = 7,
    statusDelay = 80,
    pulse = true,
  } = options;

  const row = document.createElement("div");
  row.className = `bootstrap-row ${tone}`;

  const left = document.createElement("span");
  const right = document.createElement("strong");
  right.className = "bootstrap-state pending";
  right.textContent = "···";

  row.append(left, right);
  container.appendChild(row);

  await typeText(left, `> ${label}`, typingSpeed);
  await sleep(statusDelay + Math.random() * 70);

  right.classList.remove("pending");
  if (pulse) right.classList.add("state-arrival");
  right.textContent = state;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: "smooth",
  });

  return row;
}

function setBootstrapProgress(value, stage) {
  const bar = document.querySelector("#bootstrap-progress-bar");
  const percent = document.querySelector("#bootstrap-percent");
  const stageLabel = document.querySelector("#bootstrap-stage");

  if (bar) bar.style.width = `${value}%`;
  if (percent) percent.textContent = `${value}%`;
  if (stageLabel) stageLabel.textContent = stage;
}

async function revealElement(element, delay = 0, className = "startup-revealed") {
  if (!element) return;
  if (delay) await sleep(delay);
  element.classList.add(className);
}

async function receiveStoryFile(log, icon, index, total) {
  const filename = icon.querySelector("strong")?.textContent || `record-${index + 1}`;
  const row = document.createElement("div");
  row.className = "bootstrap-transfer";

  const heading = document.createElement("div");
  heading.className = "transfer-heading";
  heading.innerHTML = `<span>RECEIVING ${filename}</span><strong>0%</strong>`;

  const track = document.createElement("div");
  track.className = "transfer-track";
  const fill = document.createElement("i");
  track.appendChild(fill);

  row.append(heading, track);
  log.appendChild(row);
  log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });

  const steps = [18, 41, 66, 84, 100];
  for (const value of steps) {
    fill.style.width = `${value}%`;
    heading.querySelector("strong").textContent = `${value}%`;
    await sleep(55 + Math.random() * 65);
  }

  row.classList.add("complete");
  heading.querySelector("strong").textContent = "STORED";
  await revealElement(icon, 70, "startup-received");
  await sleep(index === total - 1 ? 120 : 45);
}

async function runDesktopBootstrap({ api, apps, desktop, storyIcons }) {
  const overlay = document.querySelector("#desktop-bootstrap");
  const card = overlay.querySelector(".desktop-bootstrap-card");
  const log = document.querySelector("#bootstrap-log");
  const topbar = document.querySelector(".os-topbar");
  const taskbar = document.querySelector(".taskbar");
  const wallpaper = document.querySelector(".desktop-wallpaper");
  const coreIcons = [...document.querySelectorAll(".desktop-icon[data-open-app]")];
  const statusItems = [...document.querySelectorAll(".os-system-state > span, .os-user")];

  desktop.classList.remove("os-startup-pending");
  desktop.classList.add("os-booting");
  overlay.classList.add("visible");
  card.classList.add("bootstrap-card-enter");
  log.replaceChildren();
  setBootstrapProgress(1, "BOOTSTRAP");

  const [living, me] = await Promise.all([
    api("/api/living/status").catch(() => ({
      unread_mail: 0,
      unread_events: 0,
      archive_integrity: 97,
    })),
    api("/api/me"),
  ]);

  const startupVariations = [
    ["Checking relay topology...", "4 NODES"],
    ["Recovering abandoned session...", "FOUND"],
    ["Comparing Archive manifests...", "MATCH"],
    ["Scanning for orphaned processes...", "1 FOUND"],
    ["Decrypting transmission fragments...", "3 RECOVERED"],
    ["Synchronizing observer cache...", "CURRENT"],
  ];
  const variation = startupVariations[
    Math.floor(Math.random() * startupVariations.length)
  ];

  await typeBootstrapLine(log, "Mounting virtual filesystem...", "OK");
  setBootstrapProgress(11, "FILESYSTEM");

  await typeBootstrapLine(log, "Initializing Archive Core...", "OK");
  setBootstrapProgress(20, "ARCHIVE CORE");

  await typeBootstrapLine(log, variation[0], variation[1]);
  setBootstrapProgress(30, "RELAY NETWORK");

  await typeBootstrapLine(log, "Starting integrity engine...", `${living.archive_integrity}%`);
  setBootstrapProgress(39, "INTEGRITY");

  await typeBootstrapLine(log, "Decrypting mail database...", `${living.unread_mail} UNREAD`);
  setBootstrapProgress(47, "MAIL DATABASE");

  await typeBootstrapLine(log, "Restoring event stream...", `${living.unread_events} EVENTS`);
  setBootstrapProgress(55, "EVENT STREAM");

  await typeBootstrapLine(log, "Loading Purple Void display driver...", "WARMING");
  setBootstrapProgress(63, "DISPLAY");

  wallpaper.classList.add("wallpaper-warming");
  await revealElement(wallpaper, 120);
  await sleep(350);
  wallpaper.classList.add("wallpaper-sharpened");

  await typeBootstrapLine(log, "Starting desktop shell...", "ONLINE");
  setBootstrapProgress(70, "DESKTOP SHELL");
  await revealElement(topbar);

  for (const item of statusItems) {
    await revealElement(item, 65);
  }

  await typeBootstrapLine(log, "Starting task manager...", "READY");
  setBootstrapProgress(76, "TASKBAR");
  await revealElement(taskbar);

  const appMessages = [
    ["Mounting ARCHIVE application...", "ARCHIVE ONLINE"],
    ["Starting TERMINAL subsystem...", "TERMINAL READY"],
    ["Verifying FILE EXPLORER...", "FILESYSTEM VERIFIED"],
    ["Decrypting MAIL application...", `${living.unread_mail} RECOVERED`],
  ];

  for (let index = 0; index < coreIcons.length; index += 1) {
    const icon = coreIcons[index];
    const message = appMessages[index] || ["Loading application...", "READY"];
    await typeBootstrapLine(log, message[0], message[1]);
    icon.classList.add("startup-icon-energize");
    await revealElement(icon, 65);
    setBootstrapProgress(79 + index * 3, "APPLICATIONS");
  }

  await typeBootstrapLine(
    log,
    "Opening recovered desktop channel...",
    `${storyIcons.length} RECORDS`,
  );
  setBootstrapProgress(91, "RECEIVING RECORDS");

  for (let index = 0; index < storyIcons.length; index += 1) {
    await receiveStoryFile(log, storyIcons[index], index, storyIcons.length);
  }

  await typeBootstrapLine(log, "Synchronizing relay nodes...", "COMPLETE");
  setBootstrapProgress(96, "BACKGROUND SERVICES");

  await typeBootstrapLine(log, "Enabling ambient event service...", "STANDBY");
  setBootstrapProgress(98, "OBSERVER AUTH");

  await typeBootstrapLine(log, "Waiting for observer...", "DETECTED", "attention", {
    statusDelay: 420,
  });
  await sleep(220);

  await typeBootstrapLine(log, `Restoring permissions for ${me.codename}...`, "GRANTED");
  await sleep(150);

  setBootstrapProgress(100, "SYSTEM READY");
  await typeBootstrapLine(log, "BLACKTERM OS startup complete.", "READY", "success");
  await sleep(430);

  const finalMessage = document.createElement("div");
  finalMessage.className = "bootstrap-welcome";
  await typeText(finalMessage, "WELCOME BACK, OBSERVER.", 18);
  log.appendChild(finalMessage);
  log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });

  await sleep(620);

  overlay.classList.add("bootstrap-exit");
  await sleep(330);
  overlay.classList.remove("visible", "bootstrap-exit");
  card.classList.remove("bootstrap-card-enter");
  desktop.classList.remove("os-booting");
  desktop.classList.add("os-ready");

  showToast("ARCHIVE", "Session restored. All systems nominal.");

  await sleep(420);
  apps.open("archive");
  await sleep(360);
  apps.open("terminal");
}

export async function mountDesktop(api) {
  const desktop = document.querySelector("#desktop");

  const manager = new WindowManager({
    layer: document.querySelector("#window-layer"),
    taskbar: document.querySelector("#task-buttons"),
    template: document.querySelector("#window-template"),
  });

  const apps = new AppRegistry({ api, windows: manager });
  const startMenu = document.querySelector("#start-menu");
  const startButton = document.querySelector("#start-button");

  document.querySelectorAll("[data-open-app]").forEach((button) => {
    button.addEventListener("dblclick", () => {
      if (!desktop.classList.contains("os-ready")) return;
      apps.open(button.dataset.openApp);
    });

    button.addEventListener("click", () => {
      if (!desktop.classList.contains("os-ready")) return;
      if (button.closest("#start-menu")) {
        apps.open(button.dataset.openApp);
        startMenu.classList.add("hidden");
      }
    });
  });

  startButton.addEventListener("click", () => {
    if (!desktop.classList.contains("os-ready")) return;
    startMenu.classList.toggle("hidden");
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#start-menu") && !event.target.closest("#start-button")) {
      startMenu.classList.add("hidden");
    }
  });

  const me = await api("/api/me");
  document.querySelector("#os-codename").textContent = me.codename;
  document.querySelector("#start-codename").textContent = me.codename;

  const clock = document.querySelector("#os-clock");
  const tick = () => {
    clock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  };
  tick();
  setInterval(tick, 1000);

  const signal = 89 + (Number(me.codename.replace(/\D/g, "")) % 11);
  document.querySelector("#task-signal").textContent = `SIGNAL ${signal}%`;

  const desktopFiles = await api("/api/os/desktop-files");
  const desktopIcons = document.querySelector("#desktop-icons");
  const storyIcons = [];

  for (const file of desktopFiles) {
    const button = document.createElement("button");
    button.className = "desktop-icon story-file-icon startup-item";
    button.innerHTML = `<span class="icon-glyph">▤</span><strong>${file.name}</strong>`;
    button.addEventListener("dblclick", () => {
      if (!desktop.classList.contains("os-ready")) return;
      apps.openTextFile?.(file.name, file.content);
    });
    desktopIcons.appendChild(button);
    storyIcons.push(button);
  }

  mountAmbientNotifications();
  mountScannerIllumination();
  await applyLivingWorldState(api);
  await runDesktopBootstrap({ api, apps, desktop, storyIcons });

  return { manager, apps };
}
