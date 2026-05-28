# ORANGEBOX Vault Recovery

ORANGEBOX stores connector credentials in one encrypted file:

- `credentials.enc`
- default root: `%APPDATA%\com.atomeons.orangebox.command`
- override root: `ORANGEBOX_DATA_ROOT`

The vault can be decrypted only with the same key source used when it was created. Key source order is:

1. OS keyring entry `orangebox / vault-master-key` when optional `keytar` is available.
2. `ORANGEBOX_VAULT_KEY` passphrase, derived with PBKDF2.
3. local key file `.vault.key` in the data root.

## Recovery Command

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs vault-recovery
node C:\AtomEons\orangebox\scripts\obx.mjs vault-recovery --json
```

The command first asks the running sidecar for `GET /api/v4/vault/recovery`. If the sidecar is not running, it probes the local vault module directly.

## API

```http
GET /api/v4/vault/recovery
```

The response returns:

- status: `empty`, `ok`, `key_missing`, or `recovery_required`
- key source label only, never key bytes
- vault path and local key path metadata
- corrupt backup metadata if present
- connected service metadata when decryptable
- recommended recovery actions

The recovery probe is intentionally read-only:

- `mutates_vault: false`
- `returns_secret_material: false`
- it does not rename `credentials.enc`
- it does not write a new key
- it does not call provider APIs

## Status Meanings

`empty`

No encrypted vault exists yet. Normal connector setup can create one.

`ok`

The active key source decrypts `credentials.enc`. ORANGEBOX can list connected services without exposing token material.

`key_missing`

An encrypted vault exists but no available key source was found. Restore the original OS keyring entry, `ORANGEBOX_VAULT_KEY`, or `.vault.key`.

`recovery_required`

A key source exists but cannot decrypt the vault. This usually means the wrong passphrase/key file/keyring entry is active. Do not delete `credentials.enc`; restore the original key source and rerun the command.

## Lost-Key Rule

If the key is permanently lost, old encrypted credentials cannot be recovered. Copy `credentials.enc` somewhere safe for audit, then reconnect services through ORANGEBOX setup/connectors. Do not fake recovery by editing provider state or receipting green.

## Verification

The implementation was verified with temporary data roots:

- empty vault returns `status=empty`
- connected test vault returns `status=ok`, `service_count=1`
- wrong key returns `status=recovery_required`
- wrong-key probe leaves `credentials.enc` in place
- route smoke returns no secret material
- CLI `vault-recovery --json` returns service metadata only

