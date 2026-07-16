import { register } from "../registry.js";
import { formatNode } from "../utils.js";

register({
  name: "nodes",
  aliases: ["node-list"],
  description: "List challenge nodes.",
  async run({ refreshContext, print }) {
    const context = await refreshContext();
    for (const node of context.nodes) {
      await print(formatNode(node), node.solved ? "system" : "muted", 2);
    }
  },
});
