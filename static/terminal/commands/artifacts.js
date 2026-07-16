import { register } from "../registry.js";

function resolveArtifact(engine, path) {
  const resolved = engine.fs.resolve(path);

  if (resolved.node.type !== "artifact") {
    throw new Error(`not a downloadable artifact: ${path}`);
  }

  return resolved;
}

register({
  name: "artifacts",
  description: "List currently unlocked downloadable artifacts.",
  async run({ engine, print }) {
    const entries = engine.fs.list("/archive/artifacts");

    if (!entries.length) {
      await print("no artifacts currently unlocked", "muted", 2);
      return;
    }

    for (const entry of entries) {
      await print(
        `${entry.name.padEnd(26)} ${String(entry.node.size).padStart(8)} bytes`,
        "system",
        1
      );
    }
  },
});

register({
  name: "download",
  description: "Download an artifact to the local computer.",
  async run({ args, engine, print }) {
    if (!args[0]) {
      await print("usage: download <artifact-path>", "error", 2);
      return;
    }

    const { node, path } = resolveArtifact(engine, args[0]);
    await print(`preparing ${path}`, "muted", 2);

    const anchor = document.createElement("a");
    anchor.href = `/api/artifacts/${encodeURIComponent(node.artifact_id)}/download`;
    anchor.download = path.split("/").pop();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    await print(`download initiated: ${anchor.download}`, "system", 2);
  },
});

register({
  name: "artifact-info",
  description: "Display metadata for an artifact.",
  async run({ args, engine, print }) {
    if (!args[0]) {
      await print("usage: artifact-info <artifact-path>", "error", 2);
      return;
    }

    const { node, path } = resolveArtifact(engine, args[0]);
    await print(`PATH:   ${path}`, "system", 1);
    await print(`TYPE:   ${node.mime_type}`, "system", 1);
    await print(`SIZE:   ${node.size} bytes`, "system", 1);
    await print(`SHA256: ${node.sha256}`, "system", 1);
  },
});
