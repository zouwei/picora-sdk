# @picora/sdk

Official TypeScript SDK for [Picora](https://picora.me) — the AI-workflow resource hosting platform (images, videos, audio, Markdown docs & knowledge bases, collections, AIGC pipelines).

**v0.3.0 covers 100% of the public Picora API** (228 operations across 30+ namespaces), enforced in CI by a bidirectional OpenAPI coverage gate against the vendored contract snapshot in [`spec/openapi-public.json`](./spec/openapi-public.json).

```bash
npm install @picora/sdk
# or
pnpm add @picora/sdk
```

Requires Node.js ≥ 18 (native `fetch`). This release targets Node.js; browser / edge builds are planned.

## Quickstart

```ts
import { createPicoraClient, PicoraApiError, PicoraRateLimitError } from '@picora/sdk'

const picora = createPicoraClient({
  apiKey: process.env.PICORA_API_KEY,   // sk_live_... created in https://center.picora.me/integration
})

const me = await picora.auth.me()
console.log('Signed in as', me.email, '— plan:', me.plan)

const images = await picora.images.list({ pageSize: 20 })
for (const img of images.items) console.log(img.url)
```

## Authentication — four modes

```ts
// 1. API Key (tool integrations; scope-limited, see center.picora.me)
createPicoraClient({ apiKey: 'sk_live_...' })

// 2. Static OAuth access token (no auto-refresh)
createPicoraClient({ oauthToken: accessToken })

// 3. OAuth session with automatic refresh (token rotation safe)
import { createOAuthTokenProvider, MemoryTokenStorage } from '@picora/sdk'
import { FileTokenStorage } from '@picora/sdk/node'
const session = createOAuthTokenProvider({
  clientId: 'my_app',
  storage: new FileTokenStorage(),   // or MemoryTokenStorage / KeychainTokenStorage / your own
})
createPicoraClient({ session })

// 4. First-party JWT session (email + password / email OTP)
import { createJwtSession } from '@picora/sdk'
const jwt = createJwtSession()
await jwt.login('user@example.com', 'P@ssw0rd')
createPicoraClient({ session: jwt })
```

Auth building blocks are exported for custom flows:

- **Authorization Code + PKCE**: `createAuthorizationRequest()` → redirect user → `exchangeAuthorizationCode()`; low-level `buildAuthorizationUrl` / `generateCodeVerifier` / `computeCodeChallenge` (RFC 7636 S256)
- **Device flow** (RFC 8628, CLI/desktop): `startDeviceFlow()` + `session.poll()`
- **Refresh & revocation**: `refreshAccessToken()` (rotation-aware), `revokeToken()` (RFC 7009)
- **Discovery**: `fetchOidcConfiguration()` / `fetchAuthorizationServerMetadata()` / `fetchJwks()` / `fetchUserinfo()`
- The refresh implementations follow a strict **rotation invariant**: the new token pair is persisted to `TokenStorage` *before* the new access token is handed out — replaying a rotated refresh token causes the server to revoke the whole token chain.
- On terminal auth failures (`invalid_grant`, empty storage) the SDK throws `PicoraReauthRequiredError` — re-run the authorization flow.

## Namespaces (v0.3.0 — full public API)

| Namespace | Endpoints |
|---|---|
| `auth` | register / login / OTP / SMS / Firebase / WeChat / refresh / verify / password reset / export tokens |
| `user` | profile, usage, identities, avatar, password, account deletion |
| `apps`, `oauth` | authorized apps; OAuth client registration / consent / device verify / revoke-all |
| `images` | upload (multipart), list, batch ops, hash dedupe (`exists`), signed URLs, incremental `syncState` |
| `uploads` | TUS 1.0 resumable uploads (create / append / status / capabilities / abort) |
| `videos`, `audio`, `media` | video (async transcode), audio, unified media list / batch delete |
| `docs` | Markdown docs CRUD, raw content, `raw:batch`, revisions (list / get / restore) |
| `kbs` | knowledge bases CRUD, sync (batch ops), manifest (ETag / 304), tree delete, conflicts |
| `collections`, `collectionTypes`, `episodes` | collections, episode CRUD + `episodes.sync` (idempotent asset sync) |
| `aigc` | projects / episodes / contents / assets / batch jobs / templates / generate |
| `aiTools`, `credit`, `agreements` | AI image toolkit, credit wallet, AIGC terms |
| `billing`, `campaigns` | plans, checkout, orders, subscription; promo campaigns & coupons |
| `notifications`, `tickets` | in-app notifications; support tickets |
| `domains`, `watermarkTemplates`, `storageTier` | custom domains, watermark templates, storage tiering + bulk delete |
| `orgs`, `insights`, `migration`, `backup` | organizations, analytics, migration jobs, backups |
| `publish`, `publishedPages`, `mcp`, `system` | multi-platform publishing, published pages, MCP catalog/usage, health |

Escape hatch: `picora.http.request(...)` calls any endpoint with the same retry/auth/decoding stack.

Pagination helper:

```ts
import { paginateAll } from '@picora/sdk'
for await (const doc of paginateAll((p) => picora.docs.list(p), { limit: 100 })) {
  console.log(doc.id)
}
```

## Error model

| HTTP | SDK class | Auto-retry |
|---|---|---|
| 400/401/403/404/422 | `PicoraApiError` | No |
| 401 (session modes) | refresh + retry once; terminal → `PicoraReauthRequiredError` | — |
| 429 | `PicoraRateLimitError` | 3 attempts (1s/2s/4s, honors `Retry-After`) |
| 500–504 | `PicoraApiError` | 2 attempts (500ms/1.5s) |
| Network failure | `PicoraNetworkError` | 2 attempts |

Non-idempotent calls (uploads, checkout, job creation, TUS `append`) disable auto-retry internally. `PicoraApiError` exposes `status` / `code` / `message` / `meta` / `requestId`.

## Contract synchronization (contributors)

This package lives in the `sdk-nodejs/` directory of the multi-language [`picora-sdk`](../README.md) repository. It vendors the public OpenAPI contract at `spec/openapi-public.json` and enforces a **bidirectional coverage gate** in CI (`src/__tests__/openapi-coverage.test.ts`): every spec operation must be covered by a registered SDK method, and every registered method must exist in the spec.

Sync chain: `picora-service` (source of truth, `openapi:split`) → `picora-assets/docs/api/openapi.json` (contract distribution point) → this package (`pnpm spec:sync` copies from `../../picora-assets/docs/api/`, then implement / clean up and keep the gate green). Run `pnpm spec:check` before committing in the multi-repo workspace.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
