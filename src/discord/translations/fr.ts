// English is the canonical fallback catalog. Placeholders must match in both languages.
export const french = {
  "Verify wallet": "Vérifier un wallet",
  "My wallets": "Mes wallets",
  "Refresh roles": "Actualiser les rôles",
  "My status": "Mon statut",
  "Your holder membership": "Vos rôles de détenteur",
  "Verify your wallets and unlock your holder roles.\n\n**1. Verify wallet** — prove ownership with a self-transfer.\n**2. Refresh roles** — claim the roles you qualify for.\n**My wallets** — manage your verified addresses.\n**My status** — view NFT and ERC-20 quantities and eligible tiers.":
    "Vérifiez vos wallets et obtenez vos rôles de détenteur.\n\n**1. Vérifier un wallet** — prouvez sa propriété par un transfert vers vous-même.\n**2. Actualiser les rôles** — obtenez les rôles auxquels vous êtes éligible.\n**Mes wallets** — gérez vos adresses vérifiées.\n**Mon statut** — consultez vos quantités de NFT et de tokens ERC-20 et les paliers éligibles.",
  "Private replies • No wallet connection • No signature or spending approval":
    "Réponses privées • Aucune connexion de wallet • Aucune signature ni autorisation de dépense",
  "Choose your verification network. Your address and proof will stay private. Self-transfers cost network gas; never send funds to the bot.":
    "Choisissez le réseau de vérification. Votre adresse et votre preuve resteront privées. Les transferts vers vous-même coûtent des frais réseau ; n’envoyez jamais de fonds au bot.",
  "Remove wallet {0}": "Retirer le wallet {0}",
  "**Your verified wallets**\n": "**Vos wallets vérifiés**\n",
  "You have no verified wallets on this server.":
    "Vous n’avez aucun wallet vérifié sur ce serveur.",
  "Remove `{0}`? This may remove your holder roles. Proof history is retained; this is not data erasure.":
    "Retirer `{0}` ? Cela peut retirer vos rôles de détenteur. L’historique des preuves est conservé ; il ne s’agit pas d’un effacement des données.",
  "Confirm removal": "Confirmer le retrait",
  Cancel: "Annuler",
  "Wallet removed. ": "Wallet retiré. ",
  "No verified wallet was removed. Any matching pending challenge was cancelled.":
    "Aucun wallet vérifié n’a été retiré. Tout défi en attente correspondant a été annulé.",
  "Roles refreshed: ": "Rôles actualisés : ",
  "Roles refreshed. You do not currently qualify for a configured role.":
    "Rôles actualisés. Vous n’êtes actuellement éligible à aucun rôle configuré.",
  "Your holder eligibility": "Votre éligibilité aux rôles",
  "Quantities are summed across your verified wallets. This view does not change roles. Use Refresh roles to claim them. Status and refresh share a one-minute cooldown.":
    "Les quantités de vos wallets vérifiés sont additionnées. Cette vue ne modifie pas vos rôles. Utilisez Actualiser les rôles pour les obtenir. Le statut et l’actualisation partagent un délai d’une minute.",
  "NFT balances are indexed. ERC-20 balances use an on-chain block snapshot.":
    "Les soldes NFT sont indexés. Les soldes ERC-20 utilisent un instantané d’un bloc de la blockchain.",
  "No holder role rules have been configured on this server yet.":
    "Aucune règle de rôle de détenteur n’est encore configurée sur ce serveur.",
  "<@&{0}> · {1}{2} held · {3}": "<@&{0}> · {1}{2} détenus · {3}",
  Eligible: "Éligible",
  "Not selected": "Non sélectionné",
  "\nMinimum: {0} tokens · {1} decimals":
    "\nMinimum : {0} tokens · {1} décimales",
  "More rules": "Autres règles",
  "{0} additional rules. Open status.json for all exact quantities and thresholds.":
    "{0} règles supplémentaires. Ouvrez status.json pour toutes les quantités et tous les seuils exacts.",
  "Role refresh is not configured.":
    "L’actualisation des rôles n’est pas configurée.",
  "Holder roles refreshed.": "Rôles de détenteur actualisés.",
  "Wallet change saved, but role refresh could not finish. Existing roles may remain. Use /roles refresh after a minute.":
    "La modification du wallet est enregistrée, mais l’actualisation des rôles n’a pas pu aboutir. Des rôles existants peuvent subsister. Utilisez /roles refresh après une minute.",
  "Enter a valid EVM address. Mixed-case addresses must have a valid checksum.":
    "Saisissez une adresse EVM valide. Les adresses mêlant majuscules et minuscules doivent avoir une somme de contrôle valide.",
  "Enter a transaction hash starting with 0x followed by 64 hexadecimal characters.":
    "Saisissez un hash de transaction commençant par 0x suivi de 64 caractères hexadécimaux.",
  "Smart-contract and delegated wallets are not supported by this self-transfer verifier yet.":
    "Les wallets de smart contracts et les wallets délégués ne sont pas encore pris en charge par cette vérification par transfert vers soi-même.",
  "This challenge has expired or was cancelled. Start again with /wallet add.":
    "Ce défi a expiré ou a été annulé. Recommencez avec /wallet add.",
  "No active challenge was found for your account on this server.":
    "Aucun défi actif n’a été trouvé pour votre compte sur ce serveur.",
  "The transaction is not available yet, or the network provider is unavailable. Try again before the challenge expires. Contact an admin if the network is not configured.":
    "La transaction n’est pas encore disponible ou le fournisseur réseau est indisponible. Réessayez avant l’expiration du défi. Contactez un administrateur si le réseau n’est pas configuré.",
  "This transaction does not match your challenge or has already been used. Check the sender, recipient, network, exact amount and time window.":
    "Cette transaction ne correspond pas à votre défi ou a déjà été utilisée. Vérifiez l’expéditeur, le destinataire, le réseau, le montant exact et le délai.",
  "The transaction needs more confirmations. Try again before the challenge expires.":
    "La transaction nécessite davantage de confirmations. Réessayez avant l’expiration du défi.",
  "You can verify up to five wallets per server. Remove a wallet first.":
    "Vous pouvez vérifier jusqu’à cinq wallets par serveur. Retirez d’abord un wallet.",
  "This address or challenge amount is already reserved. Try again later.":
    "Cette adresse ou ce montant de défi est déjà réservé. Réessayez plus tard.",
  "This address is already verified on your account.":
    "Cette adresse est déjà vérifiée sur votre compte.",
  "Too many requests. Wait a minute before trying again. New challenges are limited to ten per hour.":
    "Trop de demandes. Attendez une minute avant de réessayer. Les nouveaux défis sont limités à dix par heure.",
  "The verifier is busy. Please try again shortly.":
    "Le service de vérification est occupé. Réessayez dans un instant.",
  "Something went wrong. Please try again later.":
    "Une erreur est survenue. Réessayez plus tard.",
  "**Verify on {0}**": "**Vérification sur {0}**",
  "From: `{0}`\nTo: `{1}`": "De : `{0}`\nVers : `{1}`",
  "Send exactly **{0} {1}**, using your wallet's normal send function. Copy every decimal digit; do not round.":
    "Envoyez exactement **{0} {1}** avec la fonction d’envoi habituelle de votre wallet. Copiez toutes les décimales ; n’arrondissez pas.",
  "Use the native coin, not a token transfer. Leave transaction data empty. Never send funds to the bot or anyone else.":
    "Utilisez la monnaie native, pas un transfert de token. Laissez les données de transaction vides. N’envoyez jamais de fonds au bot ni à une autre personne.",
  "Expires: <t:{0}:R>. The transaction must be mined and verified before expiry, with at least {1} confirmations. Network fees are spent; the self-transfer amount stays in your wallet.":
    "Expiration : <t:{0}:R>. La transaction doit être incluse dans un bloc et vérifiée avant l’expiration, avec au moins {1} confirmations. Les frais réseau sont dépensés ; le montant transféré vers vous-même reste dans votre wallet.",
  "Challenge: `{0}`": "Défi : `{0}`",
  "After sending, press Submit transaction or use /wallet verify. A new challenge replaces your previous pending challenge.":
    "Après l’envoi, cliquez sur Soumettre la transaction ou utilisez /wallet verify. Un nouveau défi remplace le précédent défi en attente.",
  "Submit transaction": "Soumettre la transaction",
  "Add your wallet": "Ajouter votre wallet",
  "EVM address (never your private key)":
    "Adresse EVM (jamais votre clé privée)",
  "Wallet verified: `{0}`. ": "Wallet vérifié : `{0}`. ",
  "Submit self-transfer": "Soumettre le transfert",
  "Transaction hash (not an explorer URL)": "Hash de transaction (pas un lien)",
  "Only server administrators can manage rules and settings.":
    "Seuls les administrateurs du serveur peuvent gérer les règles et les paramètres.",
  "Invalid rule. NFT thresholds use positive integers; ERC-20 thresholds use exact positive token quantities within the token's decimal precision, with no token-ID filter. A group must use the same asset type, contract, filter and decimals. Roles and thresholds must be unique.":
    "Règle invalide. Les seuils NFT sont des entiers positifs ; les seuils ERC-20 sont des quantités positives exactes respectant la précision du token, sans filtre d’identifiants. Utilisez un point décimal (ex. 100.5). Un groupe doit utiliser le même type d’actif, contrat, filtre et nombre de décimales. Les rôles et les seuils doivent être uniques.",
  "No matching rule exists on this server.":
    "Aucune règle correspondante n’existe sur ce serveur.",
  "Token or NFT data is unavailable, incomplete or invalid. ERC-20 tokens must expose decimals(). Existing roles were preserved. Try again later.":
    "Les données de tokens ou de NFT sont indisponibles, incomplètes ou invalides. Les tokens ERC-20 doivent exposer decimals(). Les rôles existants ont été conservés. Réessayez plus tard.",
  "The bot needs Manage Roles and a role above all managed roles. Managed, everyone and administrative roles are not eligible.":
    "Le bot a besoin de la permission Gérer les rôles et d’un rôle placé au-dessus de tous les rôles à gérer. Les rôles gérés par une intégration, everyone et les rôles administratifs sont exclus.",
  "A refresh or change is already running, or you refreshed too recently. Wait a minute and retry.":
    "Une actualisation ou une modification est en cours, ou votre dernière actualisation est trop récente. Attendez une minute puis réessayez.",
  "Wallets or rules changed during the check. Existing roles were preserved; refresh again.":
    "Les wallets ou les règles ont changé pendant la vérification. Les rôles existants ont été conservés ; actualisez à nouveau.",
  "Discord could not complete all role changes. Some changes may have succeeded. Fix bot permissions and refresh again.":
    "Discord n’a pas pu terminer toutes les modifications de rôles. Certaines ont pu réussir. Corrigez les permissions du bot puis actualisez à nouveau.",
  "This server is limited to twenty role rules in this version.":
    "Ce serveur est limité à vingt règles de rôles dans cette version.",
  "This member is no longer on the server.":
    "Ce membre n’est plus sur le serveur.",
  "Roles refreshed. Eligible roles: {0}":
    "Rôles actualisés. Rôles éligibles : {0}",
  "Scheduler: {0}\nActive members: {1}\nDormant members: {2}\nDue checks: {3}\nRetrying: {4}\nLatest successful check: {5}":
    "Planificateur : {0}\nMembres actifs : {1}\nMembres inactifs : {2}\nVérifications à effectuer : {3}\nNouvelles tentatives : {4}\nDernière vérification réussie : {5}",
  enabled: "activé",
  disabled: "désactivé",
  none: "aucune",
  "Frequency saved. Active role holders will be checked at the configured interval when the scheduler is enabled.":
    "Fréquence enregistrée. Les détenteurs de rôles actifs seront vérifiés à l’intervalle configuré lorsque le planificateur sera activé.",
  "Role stacking saved. Changes apply on the next role refresh.":
    "Cumul des rôles enregistré. Les modifications s’appliqueront à la prochaine actualisation des rôles.",
  "Rules page {0} · stacking: {1}\n\n": "Règles, page {0} · cumul : {1}\n\n",
  "decimals: ": "décimales : ",
  "IDs: ": "Identifiants : ",
  " selected": " sélectionnés",
  all: "tous",
  "No rules on this page.": "Aucune règle sur cette page.",
  "\n… See rules.json for exact quantities and complete rules.":
    "\n… Consultez rules.json pour les quantités exactes et les règles complètes.",
  "Rule saved: `{0}`. Members can use /roles refresh to apply it.":
    "Règle enregistrée : `{0}`. Les membres peuvent utiliser /roles refresh pour l’appliquer.",
  "Rule removed. Its role will be removed from members on their next refresh unless another rule uses it.":
    "Règle supprimée. Son rôle sera retiré aux membres à leur prochaine actualisation, sauf si une autre règle l’utilise.",
  "The bot owner must configure ALCHEMY_ENCRYPTION_KEY on the host before server keys can be saved.":
    "Le propriétaire du bot doit configurer ALCHEMY_ENCRYPTION_KEY sur l’hôte avant de pouvoir enregistrer des clés de serveur.",
  "Enter an Alchemy API key only, not an endpoint URL. No spaces or special characters.":
    "Saisissez uniquement une clé API Alchemy, pas une URL de point d’accès. Aucun espace ni caractère spécial.",
  "The key could not be validated for Ethereum and Polygon RPC/NFT access. Check access, quotas and network availability. Your previous configuration was not changed.":
    "La clé n’a pas pu être validée pour l’accès RPC/NFT sur Ethereum et Polygon. Vérifiez les accès, les quotas et la disponibilité réseau. Votre configuration précédente n’a pas été modifiée.",
  "The saved key cannot be decrypted. Contact the bot owner. Global fallback will not be used for this saved configuration.":
    "La clé enregistrée ne peut pas être déchiffrée. Contactez le propriétaire du bot. La configuration globale ne sera pas utilisée en remplacement de cette configuration enregistrée.",
  "Server Alchemy API key": "Clé API Alchemy du serveur",
  "API key (private; processed by Discord)":
    "Clé API (privée ; traitée par Discord)",
  "Server Alchemy key: {0}.\nEncrypted storage: {1}.\nSaved keys are never displayed. A saved key takes precedence for NFT/ERC-20 checks and wallet proofs on Ethereum and Polygon.":
    "Clé Alchemy du serveur : {0}.\nStockage chiffré : {1}.\nLes clés enregistrées ne sont jamais affichées. Une clé enregistrée est prioritaire pour les vérifications NFT/ERC-20 et les preuves de wallet sur Ethereum et Polygon.",
  configured: "configurée",
  "not configured; host fallback applies if available":
    "non configurée ; configuration de l’hôte utilisée si disponible",
  "Server key removed. Host fallback applies if available. The key was not revoked at Alchemy; revoke it there if needed.":
    "Clé du serveur supprimée. La configuration de l’hôte est utilisée si disponible. La clé n’a pas été révoquée chez Alchemy ; révoquez-la là-bas si nécessaire.",
  "Alchemy key validated and saved encrypted for this server. Ethereum and Polygon NFT/ERC-20 checks and wallet proofs now use this key. It will never be displayed. No restart is required.":
    "Clé Alchemy validée et enregistrée chiffrée pour ce serveur. Les vérifications NFT/ERC-20 et les preuves de wallet sur Ethereum et Polygon utilisent désormais cette clé. Elle ne sera jamais affichée. Aucun redémarrage n’est nécessaire.",
  "Please use this command inside a Discord server.":
    "Utilisez cette commande dans un serveur Discord.",
  "This command is not available yet.":
    "Cette commande n’est pas encore disponible.",
  "Use the buttons below or your server's member panel. Administrators can publish it with /panel publish. All member actions reply privately.":
    "Utilisez les boutons ci-dessous ou le panneau des membres de votre serveur. Les administrateurs peuvent le publier avec /panel publish. Toutes les actions des membres donnent une réponse privée.",
  "Use /wallet add, /wallet list, /wallet remove, /wallet verify and /roles refresh. Responses are private. Administrators configure /rules and /settings.":
    "Utilisez /wallet add, /wallet list, /wallet remove, /wallet verify et /roles refresh. Les réponses sont privées. Les administrateurs configurent /rules et /settings.",
  "Holder roles use ERC-1155 copies, ERC-721 counts or ERC-20 token balances across your verified wallets. Administrators choose asset-type:erc20 for token rules and enter thresholds in tokens (e.g. 100.5). Scheduled checks only remove ineligible roles. Use /roles refresh to claim roles again.":
    "Les rôles de détenteur utilisent les copies ERC-1155, les quantités ERC-721 ou les soldes ERC-20 de vos wallets vérifiés. Les administrateurs choisissent asset-type:erc20 pour les règles de tokens et saisissent les seuils en tokens avec un point décimal (ex. 100.5). Les vérifications planifiées retirent uniquement les rôles devenus inéligibles. Utilisez /roles refresh pour obtenir à nouveau vos rôles.",
  "Wallet verification uses a native self-transfer and requires network fees. Only standard externally owned wallets are supported in this version.":
    "La vérification des wallets utilise un transfert de monnaie native vers vous-même et nécessite des frais réseau. Seuls les wallets standards contrôlés par une clé sont pris en charge dans cette version.",
  "Verification will use a self-transfer on Ethereum or Polygon. No wallet connection or spending approval is requested.":
    "La vérification utilise un transfert vers vous-même sur Ethereum ou Polygon. Aucune connexion de wallet ni autorisation de dépense n’est demandée.",
  "Never share your recovery phrase or private key.":
    "Ne partagez jamais votre phrase de récupération ni votre clé privée.",
  "Server language saved: {0}. Publish a new /panel publish to update public text. Private replies prefer each member's Discord language.":
    "Langue du serveur enregistrée : {0}. Publiez un nouveau panneau avec /panel publish pour actualiser le texte public. Les réponses privées privilégient la langue Discord de chaque membre.",
  English: "anglais",
  French: "français",
} as const;
