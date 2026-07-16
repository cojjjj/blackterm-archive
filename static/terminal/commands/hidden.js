import { register } from "../registry.js";
import { sleep } from "../utils.js";

register({
  name: "echo",
  hidden: true,
  async run({ args, print }) {
    if (args.length) {
      await print(args.join(" "), "system", 2);
    } else {
      await print("Interesting. Very few test the silence.", "muted", 6);
    }
  },
});

register({
  name: "sudo",
  hidden: true,
  async run({ engine, print }) {
    await print("permission denied.", "error", 5);
    await sleep(650);
    await print("...", "muted", 80);
    await sleep(350);
    engine.glitch();
    await print("request retained for later review.", "system", 6);
  },
});

register({
  name: "ghost",
  hidden: true,
  async run({ engine, print }) {
    engine.glitch();
    await print("connection lost.", "error", 8);
    await sleep(500);
    await print("connection restored.", "muted", 8);
    await print("another observer was here first.", "system", 7);
  },
});
