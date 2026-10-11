# Lot 6 — Private guild Alchemy credentials

Admin commands: `/settings alchemy`, `/settings alchemy-status`, `/settings alchemy-remove confirm:true`. Configuration uses a private, blank modal; both command and submission check Administrator. Ethereum/Polygon RPC + NFT access are validated before a transactional replacement. Validation reads only, with eight-second deadlines, fixed HTTPS hosts and redirects refused. Errors are sanitized; keys are never echoed, logged or included in component IDs.

PostgreSQL stores only AES-256-GCM envelopes with random 96-bit nonces, authenticated guild-specific AAD and 128-bit tags. A canonical Base64 256-bit `ALCHEMY_ENCRYPTION_KEY` stays on the host. Removal/replacement increments the guild configuration revision. The same guild gate excludes refresh and credential changes in this single-replica MVP.

NFT reads (manual/status/scheduled) and self-transfer RPC readers resolve the guild credential once per request. With no override they use host fallbacks; unreadable overrides fail closed, never silently consuming global quotas. Dormant scheduled members still skip provider resolution. Stored credentials are not cached in long-lived provider maps.

## Activation and recovery

Apply migrations, configure/back up the host encryption secret separately, restart/recreate the service and redeploy commands. Test in a dedicated guild with an authorized admin. Validate private replies, permission revocation between opening/submitting, invalid key/quota/network failure preserving the old key, two-guild isolation, replacement without restart, proof verification using the new key and explicit removal restoring fallback. Live Discord/Alchemy acceptance remains required; tests use synthetic secrets and mocked HTTP only.

Discord receives submitted keys: modals are private, not end-to-end encrypted or masked password storage. Host process memory contains decrypted keys during requests. Losing the master secret makes stored keys unreadable; changing it is not rotation. Replacement or explicit override removal can recover a guild, but full cryptographic key rotation is not implemented. Database backups may contain old encrypted keys after removal; follow retention policy and revoke compromised keys at Alchemy. No commercial monitoring, billing, quotas dashboard or distributed gate is added.
