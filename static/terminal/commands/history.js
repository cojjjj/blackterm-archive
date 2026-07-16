import { register } from "../registry.js";

register({
  name: "history",
  description: "Show recent terminal activity.",
  async run({ refreshContext, print }) {
    const context = await refreshContext();

    if (!context.recent_commands.length) {
      await print("No activity has been retained.", "muted", 4);
      return;
    }

    const commands = [...context.recent_commands].reverse();
    for (let index = 0; index < commands.length; index += 1) {
      await print(`${String(index + 1).padStart(2, "0")}  ${commands[index]}`, "muted", 2);
    }

    await print("...one entry was removed before synchronization.", "muted", 5);
  },
});
