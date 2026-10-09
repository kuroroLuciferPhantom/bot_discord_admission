import type { HoldingsReader } from "./alchemy.js";
import type { RoleGateway } from "./discord.js";
import { evaluate, RoleError, sourceKey, type Inventory } from "./domain.js";
import type { RoleRepository } from "./repository.js";
import type { ChainId } from "../wallets/domain.js";
import { GuildGate } from "./gate.js";

export class RoleService {
  public schedulerEnabled = false;
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
  async check(guildId: string, userId: string) {
    return this.gate.run(guildId, () =>
      this.refreshLocked(guildId, userId, true, true),
    );
  }
  private async refreshLocked(
    guildId: string,
    userId: string,
    automatic: boolean,
    scheduled = false,
  ) {
    const key = guildId + ":" + userId,
      now = Date.now();
    if (this.inFlight.size >= 2 || this.inFlight.has(key))
      throw new RoleError("busy");
    if (!automatic && (this.cooldown.get(key) ?? 0) > now)
      throw new RoleError("busy");
    for (const [key, until] of this.cooldown)
      if (until <= now) this.cooldown.delete(key);
    if (!scheduled && this.cooldown.size >= 10_000) throw new RoleError("busy");
    if (!scheduled) this.cooldown.set(key, now + 60_000);
    this.inFlight.add(key);
    try {
      const snapshot = await this.repo.snapshot(guildId, userId);
      let initialCurrent: Set<string> | undefined;
      if (scheduled) {
        try {
          initialCurrent = (
            await this.gateway.prepare(
              guildId,
              userId,
              snapshot.managed,
              new Set(),
            )
          ).current;
        } catch (error) {
          if (error instanceof RoleError && error.code === "memberGone") {
            await this.repo.record(guildId, userId, false, true);
            return { desired: [], counts: new Map<string, bigint>() };
          }
          throw error;
        }
        if (initialCurrent.size === 0) {
          await this.repo.record(guildId, userId, false, true);
          return { desired: [], counts: new Map<string, bigint>() };
        }
      }
      const rules = scheduled
        ? snapshot.rules.filter((rule) => initialCurrent!.has(rule.roleId))
        : snapshot.rules;
      const holdings: Inventory = new Map();
      const sources = [
        ...new Map(rules.map((rule) => [sourceKey(rule), rule])).values(),
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
        rules,
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
      if (
        initialCurrent &&
        (initialCurrent.size !== target.current.size ||
          [...initialCurrent].some((id) => !target.current.has(id)))
      )
        throw new RoleError("changed");
      // Keep members discoverable for retries if Discord fails after a partial update.
      await this.repo.track(
        guildId,
        userId,
        desired.size > 0 || target.current.size > 0,
      );
      // Add first so an unsuccessful promotion cannot strip the lower tier.
      try {
        if (!scheduled)
          for (const id of desired)
            if (!target.current.has(id)) await target.add(id);
        for (const id of target.current)
          if (!desired.has(id)) await target.remove(id);
      } catch {
        throw new RoleError("partial");
      }
      if (scheduled)
        await this.repo.record(guildId, userId, desired.size > 0, true);
      else await this.repo.record(guildId, userId, desired.size > 0);
      return { desired: [...desired], counts };
    } finally {
      this.inFlight.delete(key);
    }
  }
}
