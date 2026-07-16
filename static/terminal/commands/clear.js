import { register } from "../registry.js";

register({
  name: "clear",
  aliases: ["cls"],
  description: "Clear terminal output.",
  async run({ clear }) {
    clear();
  },
});
