import { afterAll, describe, expect, it } from "vitest";
import { createDatabase, createSettingsStore } from "../src/storage.js";
import {
  createLanguageStore,
  LanguageSettings,
} from "../src/discord/language.js";

// Dedicated CI database only. Never fall back to a developer's DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL integration", () => {
  const db = url ? createDatabase(url) : undefined;
  const first = "991111111111111111";
  const second = "992222222222222222";
  afterAll(async () => {
    if (!db) return;
    await db.guildSettings.deleteMany({
      where: { guildId: { in: [first, second] } },
    });
    await db.$disconnect();
  });
  it("persists isolated settings, preserves edits and handles repeated creation", async () => {
    if (!db) throw new Error("Missing integration database");
    const store = createSettingsStore(db);
    await Promise.all([
      store.ensureGuild(first),
      store.ensureGuild(first),
      store.ensureGuild(second),
    ]);
    await db.guildSettings.update({
      where: { guildId: first },
      data: { roleStacking: false, checksPerWeek: 2, language: "fr" },
    });
    await store.ensureGuild(first);
    const a = await db.guildSettings.findUniqueOrThrow({
      where: { guildId: first },
    });
    const b = await db.guildSettings.findUniqueOrThrow({
      where: { guildId: second },
    });
    expect(a.roleStacking).toBe(false);
    expect(a.checksPerWeek).toBe(2);
    expect(a.language).toBe("fr");
    expect(b.roleStacking).toBe(true);
    expect(b.checksPerWeek).toBe(1);
    expect(b.language).toBe("en");
    const languages = new LanguageSettings(createLanguageStore(db));
    await languages.load();
    expect(languages.guildLanguage(first)).toBe("fr");
    expect(languages.guildLanguage(second)).toBe("en");
    await languages.save(second, "fr");
    await languages.save(first, "en");
    const restarted = new LanguageSettings(createLanguageStore(db));
    await restarted.load();
    expect(restarted.guildLanguage(first)).toBe("en");
    expect(restarted.guildLanguage(second)).toBe("fr");
    const unchanged = await db.guildSettings.findUniqueOrThrow({
      where: { guildId: first },
    });
    expect(unchanged.roleStacking).toBe(false);
    expect(unchanged.checksPerWeek).toBe(2);
    await expect(
      db.guildSettings.update({
        where: { guildId: first },
        data: { language: "de" },
      }),
    ).rejects.toThrow();
    await expect(
      db.guildSettings.update({
        where: { guildId: first },
        data: { checksPerWeek: 3 },
      }),
    ).rejects.toThrow();
  });
});
