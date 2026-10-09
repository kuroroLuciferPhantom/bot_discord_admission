import { RoleError } from "./domain.js";
// Single bot replica in this MVP. All config, wallet mutations and role effects share this gate.
export class GuildGate {
  private readonly running = new Set<string>();
  async run<T>(guildId: string, task: () => Promise<T>): Promise<T> {
    if (this.running.has(guildId) || this.running.size >= 2)
      throw new RoleError("busy");
    this.running.add(guildId);
    try {
      return await task();
    } finally {
      this.running.delete(guildId);
    }
  }
}
