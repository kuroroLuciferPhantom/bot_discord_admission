import { describe, expect, it, vi } from "vitest";
import { nextRegularCheck, retryDelay, weekMs } from "../src/jobs/policy.js";
import { CheckWorker } from "../src/jobs/worker.js";
import { RoleError } from "../src/roles/domain.js";
import type { Lease } from "../src/jobs/repository.js";

const now = new Date("2026-10-08T00:00:00Z");
const job: Lease = {
  guildId: "guild",
  userId: "user",
  leaseId: "lease",
  attempts: 0,
};
function fixture() {
  const repo = {
    claim: vi.fn().mockResolvedValueOnce(job).mockResolvedValue(null),
    finish: vi.fn(),
    fail: vi.fn(),
  };
  const checker = { check: vi.fn() };
  const report = vi.fn();
  return {
    repo,
    checker,
    report,
    worker: new CheckWorker(repo, checker, report, () => now),
  };
}
describe("durable check policy", () => {
  it("uses seven-day and three-and-a-half-day rolling intervals", () => {
    expect(nextRegularCheck(now, 1).getTime()).toBe(now.getTime() + weekMs);
    expect(nextRegularCheck(now, 2).getTime()).toBe(now.getTime() + weekMs / 2);
    expect(() => nextRegularCheck(now, 3)).toThrow();
  });
  it("backs off API failures up to a day without abandoning the member", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 99].map((n) => retryDelay(n, "provider")),
    ).toEqual([60000, 300000, 1800000, 7200000, 21600000, 86400000, 86400000]);
    expect(retryDelay(99, "busy")).toBe(60000);
    expect(retryDelay(99, "changed")).toBe(60000);
    expect(retryDelay(0, "permissions")).toBe(3600000);
  });
});
describe("bounded check worker", () => {
  it("finishes successful leases", async () => {
    const f = fixture();
    await f.worker.tick();
    expect(f.checker.check).toHaveBeenCalledWith("guild", "user");
    expect(f.repo.finish).toHaveBeenCalledWith(job);
    expect(f.repo.fail).not.toHaveBeenCalled();
  });
  it("stores retry codes without logging exception payloads", async () => {
    const f = fixture();
    f.checker.check.mockRejectedValue(new RoleError("provider"));
    await f.worker.tick();
    expect(f.repo.fail).toHaveBeenCalledWith(job, "provider", now);
    expect(f.repo.finish).not.toHaveBeenCalled();
    expect(f.report).toHaveBeenCalledWith("scheduled_check_failed:provider");
  });
  it("sanitizes unexpected failures and database outages", async () => {
    const f = fixture();
    f.checker.check.mockRejectedValue(new Error("secret URL"));
    f.repo.fail.mockRejectedValue(new Error("database password"));
    await f.worker.tick();
    expect(f.repo.fail).toHaveBeenCalledWith(job, "unexpected", now);
    expect(JSON.stringify(f.report.mock.calls)).not.toMatch(/secret|password/);
    expect(f.report).toHaveBeenCalledWith("scheduler_database_error");
  });
  it("handles claim failures without calling Discord", async () => {
    const f = fixture();
    f.repo.claim.mockReset().mockRejectedValue(new Error("db"));
    await f.worker.tick();
    expect(f.checker.check).not.toHaveBeenCalled();
    expect(f.report).toHaveBeenCalledWith("scheduler_database_error");
  });
  it("limits a batch to five jobs", async () => {
    const f = fixture();
    f.repo.claim.mockReset().mockResolvedValue(job);
    await f.worker.tick();
    expect(f.repo.claim).toHaveBeenCalledTimes(5);
  });
  it("does not overlap batches and waits for in-flight work on shutdown", async () => {
    const f = fixture();
    let release!: () => void;
    f.checker.check.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = f.worker.tick();
    await vi.waitFor(() => expect(f.checker.check).toHaveBeenCalledTimes(1));
    const second = f.worker.tick();
    const stop = f.worker.stop();
    release();
    await Promise.all([first, second, stop]);
    await f.worker.tick();
    expect(f.repo.claim).toHaveBeenCalledTimes(1);
    expect(f.repo.finish).toHaveBeenCalledTimes(1);
  });
  it("start is idempotent and stop cancels polling", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      f.worker.start();
      f.worker.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(f.repo.finish).toHaveBeenCalledTimes(1);
      await f.worker.stop();
      await vi.advanceTimersByTimeAsync(120000);
      expect(f.repo.claim).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
