function splitPath(path) {
  return path.split("/").filter(Boolean);
}

function normalizeParts(parts) {
  const output = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      output.pop();
      continue;
    }
    output.push(part);
  }

  return output;
}

export class VirtualFileSystem {
  constructor(root, home = "/") {
    this.root = root;
    this.home = home;
    this.cwd = home;
  }

  normalize(path = ".") {
    if (path === "~") return this.home;

    const source = path.startsWith("/")
      ? splitPath(path)
      : [...splitPath(this.cwd), ...splitPath(path)];

    const normalized = normalizeParts(source);
    return `/${normalized.join("/")}` || "/";
  }

  resolve(path = ".") {
    const absolute = this.normalize(path);
    let node = this.root;

    for (const part of splitPath(absolute)) {
      if (node.type !== "directory" || !node.children?.[part]) {
        throw new Error(`path not found: ${path}`);
      }

      node = node.children[part];

      if (node.locked || node.permissions === "---") {
        throw new Error(`permission denied: ${path}`);
      }
    }

    return { node, path: absolute };
  }

  list(path = ".", { all = false } = {}) {
    const { node, path: absolute } = this.resolve(path);

    if (node.type !== "directory") {
      return [{
        name: absolute.split("/").pop() || "/",
        node,
      }];
    }

    return Object.entries(node.children || {})
      .filter(([name, child]) => all || (!name.startsWith(".") && !child.hidden))
      .map(([name, child]) => ({ name, node: child }))
      .sort((a, b) => {
        if (a.node.type !== b.node.type) {
          return a.node.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  changeDirectory(path = "~") {
    const resolved = this.resolve(path);

    if (resolved.node.type !== "directory") {
      throw new Error(`not a directory: ${path}`);
    }

    this.cwd = resolved.path;
    return this.cwd;
  }

  read(path) {
    const { node } = this.resolve(path);

    if (!["file", "artifact"].includes(node.type)) {
      throw new Error(`not a file: ${path}`);
    }

    if (!node.permissions?.includes("r")) {
      throw new Error(`permission denied: ${path}`);
    }

    return node.content || "";
  }

  walk(startPath = "/") {
    const start = this.resolve(startPath);
    const results = [];

    const visit = (node, currentPath) => {
      results.push({ path: currentPath, node });

      if (node.type !== "directory" || node.locked) return;

      for (const [name, child] of Object.entries(node.children || {})) {
        visit(child, currentPath === "/" ? `/${name}` : `${currentPath}/${name}`);
      }
    };

    visit(start.node, start.path);
    return results;
  }

  tree(path = ".") {
    const { node, path: absolute } = this.resolve(path);
    const lines = [absolute];

    const render = (current, prefix = "") => {
      if (current.type !== "directory") return;

      const entries = Object.entries(current.children || {})
        .filter(([name, child]) => !name.startsWith(".") && !child.hidden);

      entries.forEach(([name, child], index) => {
        const last = index === entries.length - 1;
        const connector = last ? "└── " : "├── ";
        const suffix = child.type === "directory" ? "/" : "";
        const locked = child.locked ? " [LOCKED]" : "";

        lines.push(`${prefix}${connector}${name}${suffix}${locked}`);

        if (child.type === "directory" && !child.locked) {
          render(child, `${prefix}${last ? "    " : "│   "}`);
        }
      });
    };

    render(node);
    return lines;
  }
}
