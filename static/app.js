import { openArchive } from "./os/entrance.js";
import { mountLivingArchive } from "./living/living.js";
import { mountDesktop } from "./os/desktop.js";

console.log("%cBLACKTERM OS // THE ARCHIVE", "color:#6bff97;font-size:18px;font-weight:bold;");
console.log("%carchive-node-003-console: STAYS", "color:#6bff97;");
try { localStorage.setItem("archive_echo", "the sixth fragment does not exist"); } catch { /* Optional clue cache. */ }

const gate = document.querySelector("#gate");
const desktop = document.querySelector("#desktop");
const beginButton = document.querySelector("#begin-button");

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: options.signal || controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof payload.detail === "string" ? payload.detail : `Transmission failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The Archive took too long to respond. Try again.");
    throw error;
  } finally { clearTimeout(timeout); }
}

async function ensureSession() {
  try {
    await api("/api/me");
  } catch (error) {
    if (error.status !== 401) throw error;
    await api("/api/session", { method: "POST" });
  }
}

let mounted = false;

async function startOs() {
  if (mounted) return;
  mounted = true;
  await openArchive(async () => {
    await ensureSession();
    document.documentElement.dataset.fastBoot = "true";
    await mountDesktop(api);
    mountLivingArchive(api);
  }, { skipAnimation: document.querySelector("#fast-boot").checked });
}

beginButton.addEventListener("click", async () => {
  beginButton.disabled = true;
  beginButton.textContent = "INITIALIZING...";
  document.querySelector("#gate-error").textContent = "";
  try {
    await startOs();
  } catch (error) {
    mounted = false;
    gate.classList.remove("hidden");
    desktop.classList.add("hidden");
    document.querySelector("#boot-sequence").classList.add("hidden");
    document.querySelector("#gate-error").textContent = error.message;
    beginButton.disabled = false;
    beginButton.textContent = "RETRY CONNECTION →";
  }
});

// Every visit starts at the entrance; existing observers keep their cookie identity.
api("/api/me").then(me => {
  document.querySelector("#gate-identity").textContent = `OBSERVER ${me.codename} / SESSION FOUND`;
}).catch(() => {});
