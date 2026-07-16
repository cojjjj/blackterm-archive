import { register } from "../registry.js";

register({
  name: "archive",
  description: "Read archived transmissions.",
  async run({ print }) {
    await print("ARCHIVED TRANSMISSIONS", "system", 5);
    await print("0001  The observer arrived before the signal.", "muted", 3);
    await print("0007  A phrase was found beneath the visible surface.", "muted", 3);
    await print("0013  [REDACTED]", "muted", 3);
  },
});
