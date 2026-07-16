import "./commands/filesystem.js";
import "./commands/artifacts.js";
import "./commands/cases.js";
import "./commands/living.js";
import "./commands/help.js";
import "./commands/status.js";
import "./commands/nodes.js";
import "./commands/whoami.js";
import "./commands/history.js";
import "./commands/ping.js";
import "./commands/observe.js";
import "./commands/inspect.js";
import "./commands/scan.js";
import "./commands/clear.js";
import "./commands/archive.js";
import "./commands/hidden.js";

import { TerminalEngine } from "./engine.js";

export async function mountTerminal(api) {
  const output = document.querySelector("#terminal-output");
  const input = document.querySelector("#terminal-input");
  const form = document.querySelector("#terminal-form");

  if (!output || !input || !form) return null;

  const engine = new TerminalEngine({ output, input, form, api });
  await engine.initialize();
  return engine;
}
