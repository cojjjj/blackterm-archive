import { register } from "../registry.js";

register({
  name: "status",
  description: "Display observer and network status.",
  async run({ refreshContext, print }) {
    const context = await refreshContext();
    await print(`IDENTITY      ${context.codename}`, "system", 3);
    await print(`RANK          ${context.rank}`, "system", 3);
    await print(`TRUST LEVEL   ${context.trust_level}`, "system", 3);
    await print(`NODES         ${context.solved}/${context.total}`, "system", 3);
    await print(`PROGRESS      ${context.progress}%`, "system", 3);
    await print(`SIGNAL        ${context.signal}`, "system", 3);
  },
});
