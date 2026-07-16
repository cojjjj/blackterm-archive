import { register, visibleNames } from "../registry.js";

register({
  name: "help",
  description: "List documented commands.",
  async run({ print }) {
    await print("DOCUMENTED COMMANDS", "system", 6);
    for (const name of visibleNames()) {
      await print(`  ${name}`, "muted", 2);
    }
  },
});
