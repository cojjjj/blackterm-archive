import { register } from "../registry.js";
import { sleep } from "../utils.js";

register({
  name: "ping",
  description: "Test an Archive endpoint.",
  async run({ args, print }) {
    const target = args[0] || "archive";
    await print(`PING ${target.toUpperCase()}`, "system", 3);

    for (const delay of [14, 9, 17]) {
      await sleep(160);
      await print(`reply from 127.0.0.1  observation=${delay}ms`, "muted", 2);
    }

    await print("integrity=100%", "system", 3);
  },
});
