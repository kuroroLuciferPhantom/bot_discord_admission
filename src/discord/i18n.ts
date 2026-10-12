import { AsyncLocalStorage } from "node:async_hooks";
import { french } from "./translations/fr.js";

export type Language = "en" | "fr";
const context = new AsyncLocalStorage<Language>();

export function supportedLanguage(
  locale?: string | null,
): Language | undefined {
  if (locale === "fr") return "fr";
  if (locale === "en-US" || locale === "en-GB" || locale === "en") return "en";
  return undefined;
}

export function withLanguage<T>(language: Language, action: () => T): T {
  return context.run(language, action);
}

// Explicit message templates only: never translate user data, IDs, or JSON exports.
// A single replacement pass keeps interpolated values byte-for-byte intact.
export function t(key: keyof typeof french, ...values: unknown[]): string {
  const template = context.getStore() === "fr" ? french[key] : key;
  return template.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : placeholder,
  );
}
