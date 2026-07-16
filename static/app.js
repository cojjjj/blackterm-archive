import { runBoot, mountLivingArchive } from "./living/living.js";
import { mountDesktop } from "./os/desktop.js";

console.log("%cBLACKTERM OS // THE ARCHIVE", "color:#6bff97;font-size:18px;font-weight:bold;");
console.log("%carchive-node-003-console: STAYS", "color:#6bff97;");
localStorage.setItem("archive_echo", "the sixth fragment does not exist");

const gate = document.querySelector("#gate");
const desktop = document.querySelector("#desktop");
const beginButton = document.querySelector("#begin-button");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Transmission failed.");
  return payload;
}

async function ensureSession() {
  try {
    await api("/api/me");
  } catch {
    await api("/api/session", { method: "POST" });
  }
}

let mounted = false;

async function startOs() {
  if (mounted) return;
  mounted = true;
  gate.classList.add("hidden");
  await runBoot(api);
  desktop.classList.remove("hidden");
  mountLivingArchive(api);
  await mountDesktop(api);
}

beginButton.addEventListener("click", async () => {
  beginButton.disabled = true;
  beginButton.textContent = "INITIALIZING...";
  await ensureSession();
  await startOs();
});

(async () => {
  try {
    await api("/api/me");
    await startOs();
  } catch {
    // New observers remain at the power gate.
  }
})();
