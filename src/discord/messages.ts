// One catalog now; locale selection can be introduced without changing command logic.
export const messages = {
  en: {
    guildOnly: "Please use this command inside a Discord server.",
    unavailable: "This command is not available yet.",
    error: "Something went wrong. Please try again later.",
    help: [
      "**Holder Bot**",
      "Use /wallet add, /wallet list, /wallet remove, /wallet verify and /roles refresh. Responses are private. Administrators configure /rules and /settings.",
      "NFT roles use ERC-1155 copy quantities or ERC-721 counts across your verified wallets. Scheduled checks only remove ineligible roles. Use /roles refresh to claim roles again.",
      "Wallet verification uses a native self-transfer and requires network fees. Only standard externally owned wallets are supported in this version.",
      "Verification will use a self-transfer on Ethereum or Polygon. No wallet connection or spending approval is requested.",
      "Never share your recovery phrase or private key.",
    ].join("\n\n"),
  },
};
