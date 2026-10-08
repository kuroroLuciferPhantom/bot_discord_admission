export const weekMs = 7 * 24 * 60 * 60 * 1000;
export function nextRegularCheck(now: Date, checksPerWeek: number) {
  if (![1, 2].includes(checksPerWeek))
    throw new Error("Invalid check frequency");
  return new Date(now.getTime() + weekMs / checksPerWeek);
}
export function retryDelay(attempts: number, code: string) {
  if (code === "busy" || code === "changed") return 60_000;
  if (code === "permissions") return 3600_000;
  const delays = [60_000, 300_000, 1800_000, 7200_000, 21600_000, 86400_000];
  return delays[Math.min(Math.max(0, attempts), delays.length - 1)]!;
}
