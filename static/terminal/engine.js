import { allNames, resolve } from "./registry.js";
import { sleep } from "./utils.js";
import { VirtualFileSystem } from "./filesystem.js";

export class TerminalEngine {
  constructor({ output, input, form, api }) {
    this.output = output;
    this.input = input;
    this.form = form;
    this.api = api;
    this.history = [];
    this.historyIndex = 0;
    this.context = null;
    this.fs = null;
    this.busy = false;
  }

  async initialize() {
    this.context = await this.api("/api/terminal/context");
    const filesystem = await this.api("/api/filesystem");
    this.fs = new VirtualFileSystem(filesystem.root, filesystem.home);
    this.bindEvents();
    this.updatePrompt();

    await this.print("BLACKTERM // THE ARCHIVE", "system", 8);
    await this.print(`Identity synchronized: ${this.context.codename}`, "muted", 5);
    await this.print('Type "help" to enumerate documented commands.', "muted", 5);
    this.input.focus();
  }

  bindEvents() {
    this.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.execute(this.input.value);
    });

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.navigateHistory(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        this.navigateHistory(1);
      } else if (event.key === "Tab") {
        event.preventDefault();
        this.complete();
      }
    });

    this.output.addEventListener("click", () => this.input.focus());
  }

  updatePrompt() {
    const label = this.form.querySelector("label");
    if (!label || !this.fs) return;

    const home = this.fs.home;
    const displayPath = this.fs.cwd === home
      ? "~"
      : this.fs.cwd.startsWith(`${home}/`)
        ? `~${this.fs.cwd.slice(home.length)}`
        : this.fs.cwd;

    label.textContent = `OBS@ARCHIVE:${displayPath}$`;
  }

  async refreshContext() {
    this.context = await this.api("/api/terminal/context");
    return this.context;
  }

  async execute(rawValue) {
    if (this.busy) return;

    const raw = rawValue.trim();
    this.input.value = "";

    if (!raw) return;

    this.history.push(raw);
    this.historyIndex = this.history.length;
    await this.api("/api/terminal/event", {
      method: "POST",
      body: JSON.stringify({ command: raw }),
    }).catch(() => null);

    const prompt = this.form.querySelector("label")?.textContent || "OBS@ARCHIVE:$";
    await this.print(`${prompt} ${raw}`, "command", 0);

    const [name, ...args] = raw.split(/\s+/);
    const command = resolve(name.toLowerCase());

    if (!command) {
      await this.print(`command not recognized: ${name}`, "error", 3);
      return;
    }

    this.busy = true;
    this.input.disabled = true;

    try {
      await command.run({
        args,
        raw,
        engine: this,
        context: this.context,
        print: this.print.bind(this),
        clear: this.clear.bind(this),
        refreshContext: this.refreshContext.bind(this),
      });
    } catch (error) {
      await this.print(`terminal fault: ${error.message}`, "error", 2);
    } finally {
      this.busy = false;
      this.input.disabled = false;
      this.input.focus();
    }
  }

  async print(text = "", type = "system", speed = 0) {
    const line = document.createElement("p");
    line.className = `terminal-line-output ${type}`;
    this.output.appendChild(line);

    if (!speed) {
      line.textContent = text;
    } else {
      for (const character of String(text)) {
        line.textContent += character;
        this.output.scrollTop = this.output.scrollHeight;
        await sleep(speed);
      }
    }

    this.output.scrollTop = this.output.scrollHeight;
    return line;
  }

  clear() {
    this.output.replaceChildren();
  }

  navigateHistory(direction) {
    if (!this.history.length) return;

    this.historyIndex = Math.max(
      0,
      Math.min(this.history.length, this.historyIndex + direction)
    );

    this.input.value = this.history[this.historyIndex] || "";
    queueMicrotask(() => {
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    });
  }

  complete() {
    const value = this.input.value.trim().toLowerCase();
    if (!value || value.includes(" ")) return;

    const matches = allNames().filter((name) => name.startsWith(value));

    if (matches.length === 1) {
      this.input.value = `${matches[0]} `;
    } else if (matches.length > 1) {
      this.print(matches.join("    "), "muted", 0);
    }
  }

  glitch() {
    this.output.classList.add("terminal-glitch");
    setTimeout(() => this.output.classList.remove("terminal-glitch"), 900);
  }
}
