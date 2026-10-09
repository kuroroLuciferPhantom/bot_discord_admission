import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
} from "discord.js";
import { formatUnits } from "viem";
import {
  chainPolicy,
  WalletError,
  type Challenge,
  type ChainId,
} from "../wallets/domain.js";
import type { WalletService } from "../wallets/service.js";
import type { RoleService } from "../roles/service.js";
async function refreshAfterChange(
  roles: RoleService | undefined,
  guildId: string,
  userId: string,
) {
  if (!roles) return "Role refresh is not configured.";
  try {
    await roles.refresh(guildId, userId, true);
    return "NFT roles refreshed.";
  } catch {
    return "Wallet change saved, but role refresh could not finish. Existing roles may remain. Use /roles refresh after a minute.";
  }
}

const errors: Record<WalletError["code"], string> = {
  invalidAddress:
    "Enter a valid EVM address. Mixed-case addresses must have a valid checksum.",
  invalidHash:
    "Enter a transaction hash starting with 0x followed by 64 hexadecimal characters.",
  unsupportedWallet:
    "Smart-contract and delegated wallets are not supported by this self-transfer verifier yet.",
  expired:
    "This challenge has expired or was cancelled. Start again with /wallet add.",
  notFound: "No active challenge was found for your account on this server.",
  unavailable:
    "The transaction is not available yet, or the network provider is unavailable. Try again before the challenge expires. Contact an admin if the network is not configured.",
  incorrectProof:
    "This transaction does not match your challenge or has already been used. Check the sender, recipient, network, exact amount and time window.",
  confirming:
    "The transaction needs more confirmations. Try again before the challenge expires.",
  limit: "You can verify up to five wallets per server. Remove a wallet first.",
  reserved:
    "This address or challenge amount is already reserved. Try again later.",
  alreadyLinked: "This address is already verified on your account.",
  rateLimited:
    "Too many requests. Wait a minute before trying again. New challenges are limited to ten per hour.",
  busy: "The verifier is busy. Please try again shortly.",
};
export function walletErrorMessage(error: unknown) {
  return error instanceof WalletError
    ? errors[error.code]
    : "Something went wrong. Please try again later.";
}

export function challengeReply(challenge: Challenge) {
  const policy = chainPolicy[challenge.chainId as ChainId];
  return {
    content: [
      `**Verify on ${policy.name}**`,
      `From: \`${challenge.address}\`\nTo: \`${challenge.address}\``,
      `Send exactly **${formatUnits(BigInt(challenge.amountWei), 18)} ${policy.symbol}**, using your wallet's normal send function. Copy every decimal digit; do not round.`,
      "Use the native coin, not a token transfer. Leave transaction data empty. Never send funds to the bot or anyone else.",
      `Expires: <t:${Math.floor(challenge.expiresAt.getTime() / 1000)}:R>. The transaction must be mined and verified before expiry, with at least ${policy.confirmations} confirmations. Network fees are spent; the self-transfer amount stays in your wallet.`,
      `Challenge: \`${challenge.id}\``,
      "After sending, press Submit transaction or use /wallet verify. A new challenge replaces your previous pending challenge.",
    ].join("\n\n"),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`wallet:verify:${challenge.id}`)
          .setLabel("Submit transaction")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
    allowedMentions: { parse: [] as const },
  };
}

function addModal(chainId: ChainId) {
  return new ModalBuilder()
    .setCustomId(`wallet:add:${chainId}`)
    .setTitle("Add your wallet")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("address")
          .setLabel("EVM address (never your private key)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(42)
          .setMaxLength(42),
      ),
    );
}

export async function walletCommand(
  interaction: ChatInputCommandInteraction,
  service: WalletService,
  roles?: RoleService,
) {
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const sub = interaction.options.getSubcommand();
  if (sub === "add") {
    const network = interaction.options.getString("network", true);
    if (!["ethereum", "polygon"].includes(network))
      throw new WalletError("unavailable");
    await interaction.showModal(addModal(network === "ethereum" ? 1 : 137));
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (sub === "list") {
    const result = await service.list(guildId, userId);
    const content = result.addresses.length
      ? "**Your verified wallets**\n" +
        result.addresses.map((address) => `\`${address}\``).join("\n")
      : "You have no verified wallets on this server.";
    if (result.pending) {
      const reply = challengeReply(result.pending);
      await interaction.editReply({
        ...reply,
        content: content + "\n\n" + reply.content,
      });
    } else await interaction.editReply(content);
  } else if (sub === "remove") {
    const removed = await service.remove(
      guildId,
      userId,
      interaction.options.getString("address", true),
    );
    await interaction.editReply(
      removed
        ? "Wallet removed. " +
            (await refreshAfterChange(roles, guildId, userId))
        : "No verified wallet was removed. Any matching pending challenge was cancelled.",
    );
  } else if (sub === "verify") {
    const address = await service.verify(
      guildId,
      userId,
      interaction.options.getString("challenge", true),
      interaction.options.getString("transaction", true),
    );
    await interaction.editReply(
      `Wallet verified: \`${address}\`. ` +
        (await refreshAfterChange(roles, guildId, userId)),
    );
  } else throw new WalletError("notFound");
}

export async function walletModal(
  interaction: ModalSubmitInteraction,
  service: WalletService,
  roles?: RoleService,
) {
  if (!interaction.guildId) throw new WalletError("notFound");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const parts = interaction.customId.split(":");
  if (parts[1] === "add" && ["1", "137"].includes(parts[2] ?? "")) {
    const challenge = await service.begin(
      interaction.guildId,
      interaction.user.id,
      interaction.fields.getTextInputValue("address"),
      Number(parts[2]) as ChainId,
    );
    await interaction.editReply(challengeReply(challenge));
  } else if (parts[1] === "proof" && parts[2]) {
    const address = await service.verify(
      interaction.guildId,
      interaction.user.id,
      parts[2],
      interaction.fields.getTextInputValue("transaction"),
    );
    await interaction.editReply(
      `Wallet verified: \`${address}\`. ` +
        (await refreshAfterChange(
          roles,
          interaction.guildId,
          interaction.user.id,
        )),
    );
  } else throw new WalletError("notFound");
}

export async function walletButton(
  interaction: ButtonInteraction,
  service: WalletService,
) {
  const id = interaction.customId.split(":")[2];
  if (!interaction.guildId || !id || !/^[0-9a-f-]{36}$/i.test(id))
    throw new WalletError("notFound");
  // No RPC/database work before showModal; proof submission validates guild and user ownership.
  void service;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`wallet:proof:${id}`)
      .setTitle("Submit self-transfer")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("transaction")
            .setLabel("Transaction hash (not an explorer URL)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(66)
            .setMaxLength(66),
        ),
      ),
  );
}
