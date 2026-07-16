import { register } from "../registry.js";

register({
  name: "mail",
  description: "List Archive messages.",
  async run({ engine, print }) {
    const messages = await engine.api("/api/living/mail");

    if (!messages.length) {
      await print("inbox empty", "muted", 2);
      return;
    }

    for (const item of messages) {
      const marker = item.is_read ? " " : "*";
      await print(
        `${marker} ${String(item.id).padStart(3, "0")}  ${item.sender.padEnd(10)}  ${item.subject}`,
        item.is_read ? "muted" : "system",
        1
      );
    }

    await print('Use: read-mail <id>', "muted", 2);
  },
});

register({
  name: "read-mail",
  description: "Read an Archive message.",
  async run({ args, engine, print }) {
    if (!args[0]) {
      await print("usage: read-mail <id>", "error", 2);
      return;
    }

    const item = await engine.api(`/api/living/mail/${encodeURIComponent(args[0])}`);
    await print(`FROM: ${item.sender}`, "system", 2);
    await print(`SUBJECT: ${item.subject}`, "system", 2);
    await print("", "muted", 0);
    await print(item.body, "muted", 2);
  },
});

register({
  name: "events",
  description: "List recent Archive events.",
  async run({ engine, print }) {
    const events = await engine.api("/api/living/events");

    for (const item of events) {
      const marker = item.is_read ? " " : "*";
      await print(
        `${marker} ${String(item.id).padStart(3, "0")} ${item.event_type.toUpperCase()} ${item.title}`,
        item.is_read ? "muted" : "system",
        1
      );
    }
  },
});

register({
  name: "read-event",
  description: "Read and acknowledge an Archive event.",
  async run({ args, engine, print }) {
    if (!args[0]) {
      await print("usage: read-event <id>", "error", 2);
      return;
    }

    const events = await engine.api("/api/living/events");
    const event = events.find((item) => String(item.id) === String(args[0]));

    if (!event) {
      await print("event not found", "error", 2);
      return;
    }

    await print(event.title, "system", 2);
    await print(event.detail, "muted", 2);
    await engine.api(`/api/living/events/${event.id}/read`, {
      method: "POST",
    });
  },
});

register({
  name: "date",
  description: "Display Archive time.",
  async run({ print }) {
    const now = new Date();
    await print(
      `${now.toUTCString().toUpperCase()}\nARCHIVE TIME`,
      "system",
      2
    );
  },
});

register({
  name: "live-log",
  aliases: ["tail-log"],
  description: "Display recent live Archive activity.",
  async run({ engine, print }) {
    const logs = await engine.api("/api/living/logs");

    for (const line of logs) {
      await print(line, "muted", 1);
    }
  },
});
