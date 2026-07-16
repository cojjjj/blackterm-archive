import { register } from "../registry.js";

function formatEntry(entry, long = false) {
  const type = entry.node.type === "directory" ? "d" : "-";
  const suffix = entry.node.type === "directory" ? "/" : "";
  const locked = entry.node.locked ? " [LOCKED]" : "";

  if (!long) return `${entry.name}${suffix}${locked}`;

  const permissions = entry.node.permissions || "---";
  const size = entry.node.type === "file"
    ? String((entry.node.content || "").length).padStart(6, " ")
    : "     -";

  return `${type}${permissions} ${size} ${entry.name}${suffix}${locked}`;
}

register({
  name: "pwd",
  description: "Print the current working directory.",
  async run({ engine, print }) {
    await print(engine.fs.cwd, "system", 2);
  },
});

register({
  name: "ls",
  description: "List files and directories.",
  async run({ args, engine, print }) {
    const all = args.includes("-a") || args.includes("-la") || args.includes("-al");
    const long = args.includes("-l") || args.includes("-la") || args.includes("-al");
    const path = args.find((arg) => !arg.startsWith("-")) || ".";

    const entries = engine.fs.list(path, { all });

    if (!entries.length) {
      await print("", "muted", 0);
      return;
    }

    for (const entry of entries) {
      await print(formatEntry(entry, long), entry.node.locked ? "error" : "muted", 1);
    }
  },
});

register({
  name: "cd",
  description: "Change the current directory.",
  async run({ args, engine }) {
    engine.fs.changeDirectory(args[0] || "~");
    engine.updatePrompt();
  },
});

register({
  name: "cat",
  description: "Read one or more virtual files.",
  async run({ args, engine, print }) {
    if (!args.length) {
      await print("usage: cat <file>", "error", 2);
      return;
    }

    for (const path of args) {
      const content = engine.fs.read(path);
      await print(content.replace(/\n$/, ""), "system", 1);
    }
  },
});

register({
  name: "tree",
  description: "Display the directory tree.",
  async run({ args, engine, print }) {
    for (const line of engine.fs.tree(args[0] || ".")) {
      await print(line, "muted", 1);
    }
  },
});

register({
  name: "find",
  description: "Search the filesystem by name.",
  async run({ args, engine, print }) {
    const query = (args.at(-1) || "").toLowerCase();
    const start = args.length > 1 ? args[0] : ".";

    if (!query) {
      await print("usage: find [path] <name>", "error", 2);
      return;
    }

    const matches = engine.fs.walk(start)
      .filter(({ path }) => path.toLowerCase().includes(query));

    if (!matches.length) {
      await print("no matching paths", "muted", 2);
      return;
    }

    for (const match of matches) {
      await print(match.path, "muted", 1);
    }
  },
});

register({
  name: "grep",
  description: "Search file contents.",
  async run({ args, engine, print }) {
    if (args.length < 2) {
      await print('usage: grep <text> <path>', "error", 2);
      return;
    }

    const query = args[0].toLowerCase();
    const start = args[1];
    const matches = [];

    for (const item of engine.fs.walk(start)) {
      if (item.node.type !== "file") continue;
      if (!item.node.permissions?.includes("r")) continue;

      const lines = (item.node.content || "").split("\n");
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query)) {
          matches.push(`${item.path}:${index + 1}:${line}`);
        }
      });
    }

    if (!matches.length) {
      await print("no matches", "muted", 2);
      return;
    }

    for (const match of matches) {
      await print(match, "system", 1);
    }
  },
});

register({
  name: "file",
  description: "Identify a virtual path.",
  async run({ args, engine, print }) {
    if (!args[0]) {
      await print("usage: file <path>", "error", 2);
      return;
    }

    const { node, path } = engine.fs.resolve(args[0]);
    const description = node.type === "directory"
      ? "virtual directory"
      : node.type === "artifact"
        ? `downloadable artifact (${node.mime_type})`
        : "UTF-8 virtual text file";

    await print(`${path}: ${description}`, "system", 2);
  },
});

register({
  name: "sha256sum",
  description: "Calculate a SHA-256 digest for a file.",
  async run({ args, engine, print }) {
    if (!args[0]) {
      await print("usage: sha256sum <file>", "error", 2);
      return;
    }

    const content = engine.fs.read(args[0]);
    const bytes = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(hashBuffer)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    await print(`${hash}  ${args[0]}`, "system", 1);
  },
});

register({
  name: "base64",
  description: "Encode or decode text files.",
  async run({ args, engine, print }) {
    const decode = args.includes("-d");
    const path = args.find((arg) => !arg.startsWith("-"));

    if (!path) {
      await print("usage: base64 [-d] <file>", "error", 2);
      return;
    }

    const content = engine.fs.read(path);

    try {
      const result = decode
        ? atob(content.trim())
        : btoa(unescape(encodeURIComponent(content)));
      await print(result, "system", 1);
    } catch {
      await print("invalid base64 input", "error", 2);
    }
  },
});

register({
  name: "xxd",
  description: "Display a hexadecimal dump.",
  async run({ args, engine, print }) {
    if (!args[0]) {
      await print("usage: xxd <file>", "error", 2);
      return;
    }

    const bytes = new TextEncoder().encode(engine.fs.read(args[0]));

    for (let offset = 0; offset < bytes.length; offset += 16) {
      const slice = bytes.slice(offset, offset + 16);
      const hex = [...slice]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ")
        .padEnd(47, " ");
      const ascii = [...slice]
        .map((byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".")
        .join("");

      await print(
        `${offset.toString(16).padStart(8, "0")}: ${hex}  ${ascii}`,
        "muted",
        0
      );
    }
  },
});
