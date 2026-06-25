-- One-time, host-side reveal of the instance recovery phrase.
--
-- The recovery phrase is the encoding of AUDITY_ENCRYPTION_KEY, so it is not a
-- separate secret. These columns record whether the phrase has already been
-- revealed once (by the installer or a single CLI call). After that the CLI tool
-- refuses to reprint it (irreversible seal); the running app never exposes it.
--
-- Reset on key rotation is handled in code (ensureKeyMeta): when the fingerprint
-- changes, a NEW key generation gets its own single reveal.

alter table encryption_key_meta add column if not exists phrase_revealed_at timestamptz;
alter table encryption_key_meta add column if not exists phrase_revealed_source text;
