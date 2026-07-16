import { register } from "../registry.js";
import { randomItem } from "../utils.js";

const observations = [
  "The first pattern is rarely the important one.",
  "A locked door still confirms that a room exists.",
  "Most observers search for answers. Few inspect the question.",
  "Meaning survives translation, corruption, and time.",
  "The Archive records persistence more carefully than speed.",
];

register({
  name: "observe",
  description: "Read an observation log.",
  async run({ print }) {
    await print("OBSERVATION LOG", "system", 6);
    await print(randomItem(observations), "muted", 7);
  },
});
