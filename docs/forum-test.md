# Forum and message board test

## Unified forum navigation

The sidebar now has one **Forum** entry at `/test/forum-v1/`. Inside the forum, **Discussions** and **Message board** are native section links. Existing `/test/forum-v1/#discussion` and `/test/forum-v1/#message-board` URLs continue to open their respective sections, including reloads and browser Back/Forward.

Both the connected UI and the browser-local demo use this layout. This navigation change keeps the existing topic/message API paths, account controls, server permissions and demo storage keys. It does not migrate or delete content. When JavaScript is unavailable, both section headings remain reachable by their native fragments; interactive community features still require JavaScript.

This change adds only `/test/forum-v1/` to the existing Hugo site. It uses the native Stack base template, DEX sidebar, color-scheme switch, and footer. It does not add a production navigation entry or change any article.

The page has `testpage: true`, `noindex, nofollow`, `build.list: never`, and `sitemap.disable: true`. These prevent ordinary indexing/list inclusion; they are not access controls. A deployment to the main DEX domain makes this test URL publicly reachable to anyone who knows it.

## Preview behavior

- Forum: topic list, category filter, text search, latest/reply-count sorting, local topic creation and replies.
- Message board: separate panel for local short notes, with local hide/restore moderation.
- Demo roles: visitor, member, moderator. These are interface demonstrations, never authenticated accounts.
- Moderator forum tools: local pin/unpin, lock/unlock, hide/restore.
- Email/password and Google sign-in controls are disabled and labelled as not connected. No real credentials are accepted.
- Demo content is stored in this browser only. It is not shared across visitors or sent to DEX. If storage is blocked the current visit still works.
- Untrusted displayed text is escaped before insertion. No request is made to an authentication service or forum API.

## Production boundaries

Do not use demo roles, localStorage data, or front-end role checks as production authentication, authorization, or shared persistence. Before real launch replace them with a supported identity service and server-enforced data permissions. Require verified email, secure OAuth callback handling, administrator assignment outside user-editable profile fields, rate limits, content moderation and backups. Do not automatically merge identities based on unverified email addresses.

Provider selection, Google OAuth client, SMTP delivery, database policy, administrator identity, privacy notice and production release require separate configuration and approval. No credentials or provider project identifiers are included in this change.

## Validation

- `node --check assets/js/forum-test.js`
- `node --test tests/forum-test.test.mjs`
- `node --test tests/*.test.mjs`
- `hugo --environment production --minify --panicOnWarning`
- `python3 scripts/validate_site.py public`

The focused tests use a DOM fixture; they are not visual or browser end-to-end coverage. The local browser runner cannot launch in the current environment because its socket operation is unavailable. Browser QA remains pending. After an approved test deployment, verify both color schemes and mobile widths, keyboard dialog dismissal, repeated posting, local persistence, filtering and both moderation flows.

## Publishing scope

Deploying under `https://thedexs.com/test/forum-v1/` requires an approved update to the existing production source branch and its normal Cloudflare Pages build. A separate Sites-hosted preview is not a substitute for this path. No production publication is included in this local change.
