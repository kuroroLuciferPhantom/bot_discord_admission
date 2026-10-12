import { t } from "./i18n.js";
export function messages() {
  return {
    guildOnly: t("Please use this command inside a Discord server."),
    unavailable: t("This command is not available yet."),
    error: t("Something went wrong. Please try again later."),
    help: [
      "**Holder Bot**",
      t(
        "Use the buttons below or your server's member panel. Administrators can publish it with /panel publish. All member actions reply privately.",
      ),
      t(
        "Use /wallet add, /wallet list, /wallet remove, /wallet verify and /roles refresh. Responses are private. Administrators configure /rules and /settings.",
      ),
      t(
        "Holder roles use ERC-1155 copies, ERC-721 counts or ERC-20 token balances across your verified wallets. Administrators choose asset-type:erc20 for token rules and enter thresholds in tokens (e.g. 100.5). Scheduled checks only remove ineligible roles. Use /roles refresh to claim roles again.",
      ),
      t(
        "Wallet verification uses a native self-transfer and requires network fees. Only standard externally owned wallets are supported in this version.",
      ),
      t(
        "Verification will use a self-transfer on Ethereum or Polygon. No wallet connection or spending approval is requested.",
      ),
      t("Never share your recovery phrase or private key."),
    ].join("\n\n"),
  };
}
