// One catalog now; locale selection can be introduced without changing command logic.
export const messages = {
  en: {
    guildOnly: "Please use this command inside a Discord server.",
    unavailable: "This command is not available yet.",
    error: "Something went wrong. Please try again later.",
    help: [
      "**Holder Bot — setup preview**",
      "This version provides the bot foundation only. Wallet verification and role rules are not available yet.",
      "Coming next: /wallet add, /wallet list, /wallet remove and /roles refresh.",
      "Verification will use a self-transfer on Ethereum or Polygon. No wallet connection or spending approval is requested.",
      "Never share your recovery phrase or private key.",
    ].join("\n\n"),
  },
};
