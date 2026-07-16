import { register } from "../registry.js";

register({
  name: "inspect",
  description: "Request a contextual inspection.",
  async run({ refreshContext, print }) {
    const context = await refreshContext();

    if (context.solved === 0) {
      await print("The transmission is encoded, not encrypted.", "muted", 6);
    } else if (context.solved === 1) {
      await print("Presentation is not structure. Inspect both.", "muted", 6);
    } else if (context.solved === 2) {
      await print("Five surfaces. Five fragments. Preserve their order.", "muted", 6);
    } else {
      await print("No unresolved surface is currently indexed.", "muted", 6);
    }
  },
});
