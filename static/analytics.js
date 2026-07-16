/**
 * BLACKTERM privacy-conscious GA4 events.
 *
 * This file intentionally avoids observer IDs, answers, mail text, filenames,
 * terminal commands, and evidence contents.
 */

const sendEvent = (name, parameters = {}) => {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, parameters);
};

const cleanLabel = (value) =>
  String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 60);

document.addEventListener("click", (event) => {
  const appButton = event.target.closest("[data-open-app]");
  if (appButton) {
    sendEvent("blackterm_app_open", {
      app_name: cleanLabel(appButton.dataset.openApp),
    });
    return;
  }

  const powerButton = event.target.closest("#begin-button");
  if (powerButton) {
    sendEvent("blackterm_power_on");
    return;
  }

  const generatorButton = event.target.closest("[data-generate]");
  if (generatorButton) {
    sendEvent("blackterm_investigation_generate");
  }
});

window.addEventListener("load", () => {
  sendEvent("blackterm_loaded", {
    viewport_group: window.innerWidth < 700 ? "mobile" : "desktop",
  });
});
