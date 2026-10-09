import { describe, expect, it, vi } from "vitest";
import {
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { panelButton, panelCommand, panelReply } from "../src/discord/panel.js";
import { commands } from "../src/discord/commands.js";
import type { WalletService } from "../src/wallets/service.js";
import type { RoleService } from "../src/roles/service.js";

const address = "0x1111111111111111111111111111111111111111";
function fixture(id: string, guildId: string | null = "guild") {
  const event = {
    customId: id,
    guildId,
    user: { id: "clicker" },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    showModal: vi.fn(),
  };
  const wallets = {
    list: vi.fn().mockResolvedValue({ addresses: [address], pending: null }),
    remove: vi.fn().mockResolvedValue(true),
  };
  const roles = {
    refresh: vi.fn().mockResolvedValue({ desired: ["role"] }),
    inspect: vi
      .fn()
      .mockResolvedValue({ desired: [], counts: new Map(), rules: [] }),
    repo: { queue: vi.fn() },
  };
  return {
    event,
    wallets,
    roles,
    run: () =>
      panelButton(
        event as unknown as ButtonInteraction,
        wallets as unknown as WalletService,
        roles as unknown as RoleService,
      ),
  };
}
describe("member button panel", () => {
  it("publishes restart-safe identifiers and no personal data", () => {
    const reply = panelReply();
    expect(
      reply.components[0]!.toJSON().components.map((b) =>
        "custom_id" in b ? b.custom_id : "",
      ),
    ).toEqual([
      "holder:verify",
      "holder:wallets",
      "holder:refresh",
      "holder:status",
    ]);
    expect(JSON.stringify(reply)).not.toContain(address);
    expect(
      commands.find((c) => c.name === "panel")!.default_member_permissions,
    ).toBe(PermissionFlagsBits.Administrator.toString());
  });
  it("checks admin permissions at runtime before public publication", async () => {
    const event = {
      guildId: "guild",
      memberPermissions: { has: () => false },
      reply: vi.fn(),
    };
    await expect(
      panelCommand(event as unknown as ChatInputCommandInteraction),
    ).rejects.toThrow("adminOnly");
    expect(event.reply).not.toHaveBeenCalled();
    event.memberPermissions.has = () => true;
    await panelCommand(event as unknown as ChatInputCommandInteraction);
    expect(event.reply).toHaveBeenCalledWith(panelReply());
  });
  it("offers both networks privately without database or RPC work", async () => {
    const f = fixture("holder:verify");
    await f.run();
    expect(f.event.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(f.wallets.list).not.toHaveBeenCalled();
    expect(
      f.event.editReply.mock.calls[0]![0].components[0].toJSON().components,
    ).toHaveLength(2);
  });
  it.each([1, 137])(
    "opens network %s address form without deferring",
    async (chain) => {
      const f = fixture(`holder:add:${chain}`);
      await f.run();
      expect(f.event.deferReply).not.toHaveBeenCalled();
      expect(f.event.showModal.mock.calls[0]![0].toJSON().custom_id).toBe(
        `wallet:add:${chain}`,
      );
    },
  );
  it("shows only the clicking member's wallets with deletion controls", async () => {
    const f = fixture("holder:wallets");
    await f.run();
    expect(f.wallets.list).toHaveBeenCalledWith("guild", "clicker");
    const reply = f.event.editReply.mock.calls[0]![0];
    expect(reply.content).toContain(address);
    expect(reply.components[0].toJSON().components[0].custom_id).toBe(
      `holder:remove:${address}`,
    );
    expect(f.event.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
  });
  it("requires confirmation before any removal", async () => {
    const f = fixture(`holder:remove:${address}`);
    await f.run();
    expect(f.wallets.remove).not.toHaveBeenCalled();
    expect(f.event.editReply.mock.calls[0]![0].content).toContain(
      "Proof history is retained",
    );
  });
  it("scopes confirmations to the clicker, not any identity in a button", async () => {
    const f = fixture(`holder:confirm:${address}`);
    await f.run();
    expect(f.wallets.remove).toHaveBeenCalledWith("guild", "clicker", address);
    expect(f.roles.refresh).toHaveBeenCalledWith("guild", "clicker", true);
  });
  it("never refreshes on a failed removal, preventing role claims via stale controls", async () => {
    const f = fixture(`holder:confirm:${address}`);
    f.wallets.remove.mockResolvedValue(false);
    await f.run();
    expect(f.roles.refresh).not.toHaveBeenCalled();
  });
  it("queues reconciliation if role refresh after removal fails", async () => {
    const f = fixture(`holder:confirm:${address}`);
    f.roles.refresh.mockRejectedValue(new Error("outage"));
    await f.run();
    expect(f.roles.repo.queue).toHaveBeenCalledWith("guild", "clicker");
    expect(f.event.editReply.mock.calls[0]![0].content).toContain(
      "Wallet change saved",
    );
  });
  it("refreshes privately with mentions disabled", async () => {
    const f = fixture("holder:refresh");
    await f.run();
    expect(f.roles.refresh).toHaveBeenCalledWith("guild", "clicker");
    expect(f.event.editReply.mock.calls[0]![0].allowedMentions).toEqual({
      parse: [],
    });
  });
  it("status uses the read-only service and displays quantities", async () => {
    const f = fixture("holder:status");
    f.roles.inspect.mockResolvedValue({
      desired: ["role"],
      counts: new Map([["rule", 25n]]),
      rules: [{ id: "rule", roleId: "role", group: "apes", minimum: "20" }],
    } as never);
    await f.run();
    expect(f.roles.inspect).toHaveBeenCalledWith("guild", "clicker");
    expect(f.roles.refresh).not.toHaveBeenCalled();
    expect(
      f.event.editReply.mock.calls[0]![0].embeds[0].toJSON().fields[0].value,
    ).toContain("25 held · Eligible");
  });
  it("preserves pending proof submission in the private wallet list", async () => {
    const f = fixture("holder:wallets");
    f.wallets.list.mockResolvedValue({
      addresses: Array(5).fill(address),
      pending: {
        id: "11111111-1111-1111-1111-111111111111",
        address,
        chainId: 137,
        amountWei: "123456789",
        expiresAt: new Date(),
      },
    } as never);
    await f.run();
    const reply = f.event.editReply.mock.calls[0]![0];
    expect(reply.content.length).toBeLessThanOrEqual(2000);
    expect(reply.components).toHaveLength(3);
    expect(reply.components[0].toJSON().components).toHaveLength(5);
    expect(reply.components[1].toJSON().components[0].custom_id).toMatch(
      /^wallet:verify:/,
    );
  });
  it.each(["holder:unknown", "holder:confirm:not-an-address", "holder:add:56"])(
    "rejects malformed action %s",
    async (id) => {
      const f = fixture(id);
      await expect(f.run()).rejects.toThrow("notFound");
      expect(f.wallets.remove).not.toHaveBeenCalled();
    },
  );
  it("rejects interactions outside a guild before any data access", async () => {
    const f = fixture("holder:wallets", null);
    await expect(f.run()).rejects.toThrow("notFound");
    expect(f.wallets.list).not.toHaveBeenCalled();
  });
});
