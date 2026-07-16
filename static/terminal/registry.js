const visibleCommands = new Map();
const hiddenCommands = new Map();

export function register(command) {
  const target = command.hidden ? hiddenCommands : visibleCommands;
  target.set(command.name, command);

  for (const alias of command.aliases || []) {
    target.set(alias, command);
  }
}

export function resolve(name) {
  return visibleCommands.get(name) || hiddenCommands.get(name) || null;
}

export function visibleNames() {
  return [...new Set(
    [...visibleCommands.values()].map((command) => command.name)
  )].sort();
}

export function allNames() {
  return [...new Set([
    ...visibleCommands.values(),
    ...hiddenCommands.values(),
  ].map((command) => command.name))].sort();
}
