// One catalog now; locale selection can be introduced without changing command logic.
export const messages = {
  en: {
    guildOnly: "Please use this command inside a Discord server.",
    unavailable: "This command is not available yet.",
    error: "Something went wrong. Please try again later.",
    help: [
      "**Holder Bot — wallet verification preview**",
      "Use /wallet add, /wallet list, /wallet remove and /wallet verify. Responses are private. NFT role rules are not available yet.",
      "Wallet verification uses a native self-transfer and requires network fees. Only standard externally owned wallets are supported in this version.",
      "Verification will use a self-transfer on Ethereum or Polygon. No wallet connection or spending approval is requested.",
      "Never share your recovery phrase or private key.",
    ].join("\n\n"),
  },
};
