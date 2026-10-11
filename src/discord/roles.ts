import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { RoleError, ruleInput, ruleQuantity } from "../roles/domain.js";
import { normalizeAddress } from "../wallets/domain.js";
import type { RoleService } from "../roles/service.js";

export function roleErrorMessage(error: RoleError) {
  const messages: Record<RoleError["code"], string> = {
    adminOnly: "Only server administrators can manage rules and settings.",
    invalidRule:
      "Invalid rule. NFT thresholds use positive integers; ERC-20 thresholds use exact positive token quantities within the token's decimal precision, with no token-ID filter. A group must use the same asset type, contract, filter and decimals. Roles and thresholds must be unique.",
    notFound: "No matching rule exists on this server.",
    provider:
      "Token or NFT data is unavailable, incomplete or invalid. ERC-20 tokens must expose decimals(). Existing roles were preserved. Try again later.",
    permissions:
      "The bot needs Manage Roles and a role above all managed roles. Managed, everyone and administrative roles are not eligible.",
    busy: "A refresh or change is already running, or you refreshed too recently. Wait a minute and retry.",
    changed:
      "Wallets or rules changed during the check. Existing roles were preserved; refresh again.",
    partial:
      "Discord could not complete all role changes. Some changes may have succeeded. Fix bot permissions and refresh again.",
    limit: "This server is limited to twenty role rules in this version.",
    memberGone: "This member is no longer on the server.",
  };
  return messages[error.code];
}
export async function roleCommand(
  interaction: ChatInputCommandInteraction,
  service: RoleService,
) {
  const guildId = interaction.guildId!,
    userId = interaction.user.id;
  if (
    interaction.commandName !== "roles" &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  )
    throw new RoleError("adminOnly");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  if (interaction.commandName === "roles") {
    const result = await service.refresh(guildId, userId);
    await interaction.editReply({
      content: result.desired.length
        ? `Roles refreshed. Eligible roles: ${result.desired.map((id) => `<@&${id}>`).join(", ")}`
        : "Roles refreshed. You do not currently qualify for a configured role.",
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (interaction.commandName === "settings") {
    if (sub === "status") {
      const status = await service.repo.status(guildId);
      await interaction.editReply(
        `Scheduler: ${service.schedulerEnabled ? "enabled" : "disabled"}\nActive members: ${status.active}\nDormant members: ${status.dormant}\nDue checks: ${status.due}\nRetrying: ${status.retrying}\nLatest successful check: ${status.lastSuccess ? "<t:" + Math.floor(status.lastSuccess.getTime() / 1000) + ":R>" : "none"}`,
      );
      return;
    }
    await service.gate.run(guildId, async () => {
      if (sub === "role-stacking")
        await service.repo.settings(guildId, {
          roleStacking: interaction.options.getBoolean("enabled", true),
        });
      else if (sub === "check-frequency") {
        const checks = interaction.options.getInteger("times-per-week", true);
        if (![1, 2].includes(checks)) throw new RoleError("invalidRule");
        await service.repo.settings(guildId, { checksPerWeek: checks });
      } else throw new RoleError("invalidRule");
    });
    await interaction.editReply(
      sub === "check-frequency"
        ? "Frequency saved. Active role holders will be checked at the configured interval when the scheduler is enabled."
        : "Role stacking saved. Changes apply on the next role refresh.",
    );
    return;
  }
  if (sub === "list") {
    const snapshot = await service.repo.snapshot(guildId, userId);
    const page = interaction.options.getInteger("page") ?? 1;
    const lines = snapshot.rules
      .slice((page - 1) * 5, page * 5)
      .map(
        (r) =>
          `\`${r.id}\` — ${r.group}: **${ruleQuantity(r, r.minimum)} ${r.assetType === "ERC20" ? "tokens" : "NFT"}** → <@&${r.roleId}>\n${r.chainId === 1 ? "Ethereum" : "Polygon"} · ${r.assetType} · \`${r.contract}\` · ${r.assetType === "ERC20" ? "decimals: " + r.decimals : "IDs: " + (r.tokenIds.length ? r.tokenIds.length + " selected" : "all")}`,
      );
    await interaction.editReply({
      content:
        `Rules page ${page} · stacking: ${snapshot.settings.roleStacking ? "enabled" : "disabled"}\n\n` +
        (lines.join("\n\n") || "No rules on this page.").slice(0, 1800) +
        (lines.join("\n\n").length > 1800
          ? "\n… See rules.json for exact quantities and complete rules."
          : ""),
      allowedMentions: { parse: [] },
      files: [
        new AttachmentBuilder(
          Buffer.from(
            JSON.stringify(
              snapshot.rules.slice((page - 1) * 5, page * 5).map((r) => ({
                ...r,
                minimumTokens: ruleQuantity(r, r.minimum),
              })),
              null,
              2,
            ),
          ),
          { name: "rules.json" },
        ),
      ],
    });
    return;
  }
  await service.gate.run(guildId, async () => {
    if (sub === "remove")
      await service.repo.remove(
        guildId,
        interaction.options.getString("id", true),
      );
    else if (sub === "add" || sub === "edit") {
      const network = interaction.options.getString("network", true);
      if (!["ethereum", "polygon"].includes(network))
        throw new RoleError("invalidRule");
      const kind = interaction.options.getString("asset-type") ?? "nft";
      if (!["nft", "erc20"].includes(kind)) throw new RoleError("invalidRule");
      const assetType = kind === "erc20" ? "ERC20" : "NFT";
      const tokenIds =
        interaction.options
          .getString("token-ids")
          ?.split(",")
          .map((id) => id.trim()) ?? [];
      if (assetType === "ERC20" && tokenIds.length)
        throw new RoleError("invalidRule");
      let contract: string;
      try {
        contract = normalizeAddress(
          interaction.options.getString("contract", true),
        );
      } catch {
        throw new RoleError("invalidRule");
      }
      const chainId = network === "ethereum" ? 1 : 137;
      const input = ruleInput({
        group: interaction.options.getString("group", true),
        chainId,
        contract,
        minimum: interaction.options.getString("minimum", true),
        roleId: interaction.options.getRole("role", true).id,
        tokenIds,
        assetType,
        decimals:
          assetType === "ERC20"
            ? await service.tokenDecimals(guildId, chainId, contract)
            : null,
      });
      await service.gateway.validate(guildId, input.roleId);
      const rule = await service.repo.save(
        guildId,
        input,
        sub === "edit" ? interaction.options.getString("id", true) : undefined,
      );
      await interaction.editReply(
        `Rule saved: \`${rule.id}\`. Members can use /roles refresh to apply it.`,
      );
      return;
    } else throw new RoleError("invalidRule");
    await interaction.editReply(
      "Rule removed. Its role will be removed from members on their next refresh unless another rule uses it.",
    );
  });
}
