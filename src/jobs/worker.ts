import { RoleError } from "../roles/domain.js";
import type { JobRepository } from "./repository.js";
export interface Checker {
  check(guildId: string, userId: string): Promise<unknown>;
}
export class CheckWorker {
  private stopped = true;
  private managed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  constructor(
    private readonly repo: JobRepository,
    private readonly checker: Checker,
    private readonly report: (event: string) => void = () => {},
    private readonly clock = () => new Date(),
  ) {}
  async tick() {
    if (this.managed && this.stopped) return;
    // One batch at a time; no unbounded promises or overlapping intervals.
    if (this.running) return this.running;
    this.running = this.batch().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async batch() {
    for (let i = 0; i < 5; i++) {
      if (this.managed && this.stopped) return;
      let job;
      try {
        job = await this.repo.claim(this.clock());
      } catch {
        this.report("scheduler_database_error");
        return;
      }
      if (!job) return;
      try {
        await this.checker.check(job.guildId, job.userId);
        await this.repo.finish(job);
        this.report("scheduled_check_ok");
      } catch (error) {
        const code = error instanceof RoleError ? error.code : "unexpected";
        this.report("scheduled_check_failed:" + code);
        try {
          await this.repo.fail(job, code, this.clock());
        } catch {
          this.report("scheduler_database_error");
          return;
        }
      }
    }
  }
  start() {
    if (!this.stopped) return;
    this.managed = true;
    this.stopped = false;
    const poll = async () => {
      await this.tick();
      if (!this.stopped) {
        this.timer = setTimeout(() => {
          void poll();
        }, 60_000);
        this.timer.unref();
      }
    };
    // Defer the first batch until startup returns.
    this.timer = setTimeout(() => {
      void poll();
    }, 0);
    this.timer.unref();
  }
  async stop() {
    this.managed = true;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
