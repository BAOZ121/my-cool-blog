-- TEST ONLY. Synthetic Vault interface, no encryption or real secrets.
-- This fixture tests lookup/access contracts, not hosted Vault encryption.
create schema vault;
create table vault.test_secrets(id uuid primary key,decrypted_secret text);
create view vault.decrypted_secrets as select id,decrypted_secret from vault.test_secrets;
revoke all on schema vault from public,anon,authenticated,service_role;
revoke all on vault.test_secrets,vault.decrypted_secrets from public,anon,authenticated,service_role;
