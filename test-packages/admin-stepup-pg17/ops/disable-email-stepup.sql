-- OPERATOR-ONLY, separately authorized rollback. Preserves data and original MFA.
-- Every config UPDATE bumps generation: old challenges/admissions/grants stay invalid.
begin;
update community_private.community_admin_stepup_config
set enabled=false,transport_configured=false,hmac_secret_id=null
where singleton;
commit;
