import { register } from "../registry.js";

register({
  name: "whoami",
  description: "Display current observer identity.",
  async run({ refreshContext, engine, print }) {
    const context = await refreshContext();
    const living = await engine.api("/api/living/status");
    await print("IDENTITY CONFIRMED", "system", 5);
    await print(`Observer: ${context.codename}`, "system", 3);
    await print(`Rank: ${context.rank}`, "muted", 3);
    await print(`Trust: ${living.trust_level}`, "muted", 3);
    await print(`Completed cases: ${living.completed_cases}`, "muted", 3);
    await print(`Nodes solved: ${living.solved_nodes}`, "muted", 3);
    await print(`Archive integrity: ${living.archive_integrity}%`, "muted", 3);
  },
});
