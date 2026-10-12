import { t } from "./i18n.js";
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
    adminOnly: t("Only server administrators can manage rules and settings."),
    invalidRule: t(
      "Invalid rule. NFT thresholds use positive integers; ERC-20 thresholds use exact positive token quantities within the token's decimal precision, with no token-ID filter. A group must use the same asset type, contract, filter and decimals. Roles and thresholds must be unique.",
    ),
    notFound: t("No matching rule exists on this server."),
    provider: t(
      "Token or NFT data is unavailable, incomplete or invalid. ERC-20 tokens must expose decimals(). Existing roles were preserved. Try again later.",
    ),
    permissions: t(
      "The bot needs Manage Roles and a role above all managed roles. Managed, everyone and administrative roles are not eligible.",
    ),
    busy: t(
      "A refresh or change is already running, or you refreshed too recently. Wait a minute and retry.",
    ),
    changed: t(
      "Wallets or rules changed during the check. Existing roles were preserved; refresh again.",
    ),
    partial: t(
      "Discord could not complete all role changes. Some changes may have succeeded. Fix bot permissions and refresh again.",
    ),
    limit: t("This server is limited to twenty role rules in this version."),
    memberGone: t("This member is no longer on the server."),
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
        ? t(
            "Roles refreshed. Eligible roles: {0}",
            result.desired.map((id) => `<@&${id}>`).join(", "),
          )
        : t(
            "Roles refreshed. You do not currently qualify for a configured role.",
          ),
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (interaction.commandName === "settings") {
    if (sub === "status") {
      const status = await service.repo.status(guildId);
      await interaction.editReply(
        t(
          "Scheduler: {0}\nActive members: {1}\nDormant members: {2}\nDue checks: {3}\nRetrying: {4}\nLatest successful check: {5}",
          service.schedulerEnabled ? t("enabled") : t("disabled"),
          status.active,
          status.dormant,
          status.due,
          status.retrying,
          status.lastSuccess
            ? "<t:" + Math.floor(status.lastSuccess.getTime() / 1000) + ":R>"
            : t("none"),
        ),
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
        ? t(
            "Frequency saved. Active role holders will be checked at the configured interval when the scheduler is enabled.",
          )
        : t("Role stacking saved. Changes apply on the next role refresh."),
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
          `\`${r.id}\` — ${r.group}: **${ruleQuantity(r, r.minimum)} ${r.assetType === "ERC20" ? "tokens" : "NFT"}** → <@&${r.roleId}>\n${r.chainId === 1 ? "Ethereum" : "Polygon"} · ${r.assetType} · \`${r.contract}\` · ${r.assetType === "ERC20" ? t("decimals: ") + r.decimals : t("IDs: ") + (r.tokenIds.length ? r.tokenIds.length + t(" selected") : t("all"))}`,
      );
    await interaction.editReply({
      content:
        t(
          "Rules page {0} · stacking: {1}\n\n",
          page,
          snapshot.settings.roleStacking ? t("enabled") : t("disabled"),
        ) +
        (lines.join("\n\n") || t("No rules on this page.")).slice(0, 1800) +
        (lines.join("\n\n").length > 1800
          ? t("\n… See rules.json for exact quantities and complete rules.")
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
        t(
          "Rule saved: `{0}`. Members can use /roles refresh to apply it.",
          rule.id,
        ),
      );
      return;
    } else throw new RoleError("invalidRule");
    await interaction.editReply(
      t(
        "Rule removed. Its role will be removed from members on their next refresh unless another rule uses it.",
      ),
    );
  });
}
