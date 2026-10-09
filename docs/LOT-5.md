# Lot 5 — Button-first member experience

## Delivered

- Admin-only `/panel publish`: permanent public membership card, no personal data.
- Restart-safe stateless buttons; all actions use the clicking member and guild.
- Private network selection, address modal and existing transaction proof modal.
- Private wallet listing, pending challenge recovery and confirmation before removal.
- Role refresh button and read-only NFT quantities/tier view.
- Same actions available from `/help`; slash command fallbacks retained.
- Existing service limits, proof ownership checks and role mutation gate reused.
- Error replies from member buttons offer navigation back to the main actions.

## Limits and acceptance

Redeploy commands before using `/panel publish`. No migration, auto-publication or live external calls are performed by this lot. Only one bot replica is supported. Status and refresh share a one-minute cooldown. Status uses indexed quantities, not an atomic on-chain snapshot. Removal deactivates a wallet; it does not erase proof history. Old panel cards must be replaced manually if their text changes. Native Discord UI is used; mobile/desktop rendering has not been verified against a live server.

On a dedicated server, publish as admin and confirm a non-admin cannot publish. Test each button as two members: private replies, no cross-account wallet visibility/removal or role refresh, both networks, pending proof restoration, confirmation/cancel, repeated clicks, expired proofs, provider failure and restart. Verify no addresses/holdings appear in the public channel. Confirm My status does not grant/remove roles or awaken a dormant member. Existing self-transfer acceptance and production-hardening requirements still apply.
