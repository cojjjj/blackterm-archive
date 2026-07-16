export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatNode(node) {
  const status = node.solved ? "✓" : node.unlocked ? "○" : "█";
  const title = node.unlocked ? node.title : "SEALED";
  return `${String(node.sequence).padStart(3, "0")} ${status}  ${title}`;
}

export function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}
