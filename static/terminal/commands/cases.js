import { register } from "../registry.js";

function caseLabel(item) {
  const lock = item.unlocked ? "" : " [SEALED]";
  const state = item.completed
    ? "RESOLVED"
    : item.unlocked
      ? `${item.solved_objectives}/${item.total_objectives}`
      : "---";

  return `CASE-${String(item.sequence).padStart(3, "0")}  ${item.title}${lock}  ${state}`;
}

register({
  name: "cases",
  description: "List investigation cases.",
  async run({ engine, print }) {
    const cases = await engine.api("/api/cases");

    for (const item of cases) {
      await print(
        caseLabel(item),
        item.completed ? "system" : item.unlocked ? "muted" : "error",
        1
      );
    }
  },
});

register({
  name: "case",
  description: "Open a case briefing. Usage: case <case-id>",
  async run({ args, engine, print }) {
    if (!args[0]) {
      await print("usage: case <case-id>", "error", 2);
      return;
    }

    const item = await engine.api(`/api/cases/${encodeURIComponent(args[0])}`);

    if (!item.unlocked) {
      await print("case remains sealed", "error", 2);
      return;
    }

    await print(
      `CASE-${String(item.sequence).padStart(3, "0")}: ${item.title}`,
      "system",
      3
    );
    await print(`CATEGORY: ${item.category}`, "muted", 2);
    await print(`DIFFICULTY: ${item.difficulty}`, "muted", 2);
    await print("", "muted", 0);
    await print(item.briefing, "system", 2);
    await print("", "muted", 0);
    await print("OBJECTIVES", "system", 3);

    for (const objective of item.objectives) {
      const marker = objective.solved ? "[SOLVED]" : "[OPEN]";
      await print(
        `${marker} ${objective.id}: ${objective.prompt}`,
        objective.solved ? "system" : "muted",
        1
      );
    }

    await print(
      `FILESYSTEM: /archive/cases/CASE-${String(item.sequence).padStart(3, "0")}-${item.slug}`,
      "muted",
      2
    );
  },
});

register({
  name: "submit-case",
  description: "Submit a case objective answer.",
  async run({ args, engine, print }) {
    if (args.length < 3) {
      await print(
        "usage: submit-case <case-id> <objective-id> <answer>",
        "error",
        2
      );
      return;
    }

    const [caseId, objectiveId, ...answerParts] = args;
    const answer = answerParts.join(" ");

    const result = await engine.api(
      `/api/cases/${encodeURIComponent(caseId)}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          objective_id: objectiveId,
          answer,
        }),
      }
    );

    await print(
      result.message,
      result.correct ? "system" : "error",
      3
    );
    await print(`CASE PROGRESS: ${result.progress}%`, "muted", 2);

    if (result.correct) {
      const filesystem = await engine.api("/api/filesystem");
      const currentPath = engine.fs.cwd;
      engine.fs.root = filesystem.root;

      try {
        engine.fs.resolve(currentPath);
      } catch {
        engine.fs.cwd = filesystem.home;
      }

      engine.updatePrompt();
    }
  },
});
