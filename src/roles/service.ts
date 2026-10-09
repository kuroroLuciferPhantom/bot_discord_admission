import type { HoldingsReader } from "./alchemy.js";
import type { RoleGateway } from "./discord.js";
import { evaluate, RoleError, sourceKey, type Inventory } from "./domain.js";
import type { RoleRepository } from "./repository.js";
import type { ChainId } from "../wallets/domain.js";
import { GuildGate } from "./gate.js";

export class RoleService {
  private readonly inFlight = new Set<string>();
  private readonly cooldown = new Map<string, number>();
  constructor(
    public readonly repo: RoleRepository,
    public readonly gateway: RoleGateway,
    private readonly reader: HoldingsReader,
    public readonly gate = new GuildGate(),
  ) {}
  async refresh(guildId: string, userId: string, automatic = false) {
    return this.gate.run(guildId, () =>
      this.refreshLocked(guildId, userId, automatic),
    );
  }
  private async refreshLocked(
    guildId: string,
    userId: string,
    automatic: boolean,
  ) {
    const key = guildId + ":" + userId,
      now = Date.now();
    if (this.inFlight.size >= 2 || this.inFlight.has(key))
      throw new RoleError("busy");
    if (!automatic && (this.cooldown.get(key) ?? 0) > now)
      throw new RoleError("busy");
    for (const [key, until] of this.cooldown)
      if (until <= now) this.cooldown.delete(key);
    if (this.cooldown.size >= 10_000) throw new RoleError("busy");
    this.cooldown.set(key, now + 60_000);
    this.inFlight.add(key);
    try {
      const snapshot = await this.repo.snapshot(guildId, userId);
      const holdings: Inventory = new Map();
      const sources = [
        ...new Map(
          snapshot.rules.map((rule) => [sourceKey(rule), rule]),
        ).values(),
      ];
      const signal = AbortSignal.timeout(30_000);
      // Query a contract once per wallet, even if several tiers or token-ID filters use it.
      for (const source of sources) {
        const balances = new Map<string, bigint>();
        const standards = new Map<string, string>();
        for (const address of [...new Set(snapshot.wallets)]) {
          const tokens = await this.reader.read(
            source.chainId as ChainId,
            address,
            source.contract,
            signal,
          );
          for (const [id, token] of tokens) {
            // A unique ERC721 cannot be simultaneously owned by two wallets; fail closed on index inconsistency.
            if (
              standards.has(id) &&
              (token.standard === "ERC721" ||
                standards.get(id) !== token.standard)
            )
              throw new RoleError("provider");
            standards.set(id, token.standard);
            balances.set(id, (balances.get(id) ?? 0n) + token.balance);
          }
        }
        holdings.set(sourceKey(source), balances);
      }
      const { desired, counts } = evaluate(
        snapshot.rules,
        holdings,
        snapshot.settings.roleStacking,
      );
      const check = await this.repo.snapshot(guildId, userId);
      if (
        check.settings.revision !== snapshot.settings.revision ||
        check.wallets.join(",") !== snapshot.wallets.join(",")
      )
        throw new RoleError("changed");
      const target = await this.gateway.prepare(
        guildId,
        userId,
        snapshot.managed,
        desired,
      );
      // Keep members discoverable for retries if Discord fails after a partial update.
      await this.repo.record(
        guildId,
        userId,
        desired.size > 0 || target.current.size > 0,
      );
      // Add first so an unsuccessful promotion cannot strip the lower tier.
      try {
        for (const id of desired)
          if (!target.current.has(id)) await target.add(id);
        for (const id of target.current)
          if (!desired.has(id)) await target.remove(id);
      } catch {
        throw new RoleError("partial");
      }
      await this.repo.record(guildId, userId, desired.size > 0);
      return { desired: [...desired], counts };
    } finally {
      this.inFlight.delete(key);
    }
  }
}
