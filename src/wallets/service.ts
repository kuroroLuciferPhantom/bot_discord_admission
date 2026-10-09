import type { ChainReader } from "./chain.js";
import {
  normalizeAddress,
  parseHash,
  randomAmount,
  validateProof,
  WalletError,
  type ChainId,
} from "./domain.js";
import type { WalletRepository } from "./repository.js";

export class WalletService {
  private activeRequests = 0;
  private readonly requests = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(
    private readonly repo: WalletRepository,
    private readonly chain: ChainReader,
    private readonly clock = () => new Date(),
    private readonly mutation: <T>(
      guildId: string,
      task: () => Promise<T>,
    ) => Promise<T> = (_guildId, task) => task(),
  ) {}

  private async bounded<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const now = this.clock().getTime();
    // Global per-user limit across guilds; persisted challenge limits also survive restart.
    for (const [key, value] of this.requests)
      if (value.until <= now) this.requests.delete(key);
    const limit = this.requests.get(userId) ?? {
      count: 0,
      until: now + 60_000,
    };
    if (limit.count >= 10) throw new WalletError("rateLimited");
    if (this.requests.size >= 10_000 && !this.requests.has(userId))
      throw new WalletError("busy");
    limit.count++;
    this.requests.set(userId, limit);
    if (this.activeRequests >= 10) throw new WalletError("busy");
    this.activeRequests++;
    try {
      return await task();
    } finally {
      this.activeRequests--;
    }
  }
  async begin(
    guildId: string,
    userId: string,
    addressInput: string,
    chainId: ChainId,
  ) {
    const address = normalizeAddress(addressInput);
    return this.bounded(userId, async () => {
      const snapshot = await this.chain.snapshot(chainId, address);
      if (snapshot.chainId !== chainId) throw new WalletError("unavailable");
      if (snapshot.code !== "0x") throw new WalletError("unsupportedWallet");
      return this.repo.begin({
        guildId,
        userId,
        address,
        chainId,
        startBlock: snapshot.blockNumber,
        amountWei: randomAmount(),
        now: this.clock(),
      });
    });
  }
  async verify(guildId: string, userId: string, id: string, hashInput: string) {
    const hash = parseHash(hashInput);
    return this.bounded(userId, async () => {
      const challenge = await this.repo.find(guildId, userId, id);
      if (!challenge || challenge.status !== "PENDING")
        throw new WalletError("notFound");
      if (this.clock() >= challenge.expiresAt) throw new WalletError("expired");
      const proof = await this.chain.proof(challenge.chainId as ChainId, hash);
      validateProof(challenge, hash, proof, this.clock());
      await this.mutation(guildId, () =>
        this.repo.complete(guildId, userId, id, hash, this.clock()),
      );
      return challenge.address;
    });
  }
  async list(guildId: string, userId: string) {
    return this.bounded(userId, () => this.repo.list(guildId, userId));
  }
  async remove(guildId: string, userId: string, addressInput: string) {
    const address = normalizeAddress(addressInput);
    return this.bounded(userId, () =>
      this.mutation(guildId, () => this.repo.remove(guildId, userId, address)),
    );
  }
}
