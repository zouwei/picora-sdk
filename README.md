# @picora/sdk

Official TypeScript SDK for [Picora](https://picora.me) — the AI-workflow resource hosting platform (images, videos, audio, Markdown KBs).

```bash
npm install @picora/sdk
# or
pnpm add @picora/sdk
```

## Quickstart

```ts
import { createPicoraClient, PicoraApiError, PicoraRateLimitError } from '@picora/sdk'

const picora = createPicoraClient({
  apiKey: process.env.PICORA_API_KEY,        // sk_live_... created in https://center.picora.me/integration
  // Or use an OAuth access token instead:
  // oauthToken: process.env.PICORA_OAUTH_TOKEN,
})

try {
  const me = await picora.auth.me()
  console.log('Signed in as', me.email, '— plan:', me.plan)

  const subscription = await picora.auth.subscription()
  console.log('Storage limit:', subscription.limits.img_storage_bytes)

  const images = await picora.images.list({ pageSize: 20 })
  for (const img of images.items) {
    console.log(img.url)
  }

  const apps = await picora.apps.list()
  console.log('Authorized apps:', apps.map((a) => a.clientName).join(', '))
} catch (err) {
  if (err instanceof PicoraRateLimitError) {
    console.warn(`Rate limited; retry in ${err.retryAfterSec}s`)
  } else if (err instanceof PicoraApiError) {
    console.error(`API error ${err.status} ${err.code}: ${err.message}`)
  } else {
    throw err
  }
}
```

## Configuration

```ts
createPicoraClient({
  apiKey: 'sk_live_...',            // mutually exclusive with oauthToken
  oauthToken: undefined,
  baseUrl: 'https://api.picora.me', // default; use 'https://api.picora.cn' for the China deployment
  timeout: 30_000,                   // ms; default 30s
  fetch: globalThis.fetch,           // override for SSR / mocking
  retryOnRateLimit: true,            // default true; auto-retries 429 up to 3 times with exponential backoff
  retryOnServerError: true,          // default true; auto-retries 5xx up to 2 times
  userAgent: 'MyApp/1.0',            // SDK appends '@picora/sdk/<version>'
  debug: false,
})
```

## Error model

| HTTP                | SDK class                | Auto-retry                                  |
|---------------------|--------------------------|---------------------------------------------|
| 200/201/204         | (success)                | —                                           |
| 400/401/403/404/422 | `PicoraApiError`         | No                                          |
| 429                 | `PicoraRateLimitError`   | Yes, 3 attempts (exponential 1s/2s/4s)      |
| 500–504             | `PicoraApiError`         | Yes, 2 attempts (500ms / 1500ms)            |
| Network failure     | `PicoraNetworkError`     | Yes, 2 attempts (network errors only)       |
| Timeout             | `PicoraNetworkError`     | No (user-cancelled via AbortController)     |

`PicoraApiError` exposes `status`, `code`, `message`, `meta`, and `requestId` for support correlation.

## Namespaces (v0.1.0)

- `auth.me()` — current user
- `auth.subscription()` — plan, features, limits
- `images.list()` / `images.get(id)` / `images.delete(id)` — image management
- `apps.list()` / `apps.revoke(clientId)` — OAuth apps authorized on your account (v0.30 first-party SSO)

`videos`, `audio`, `docs`, `kbs`, `mcp` namespaces are scheduled for `@picora/sdk@0.2.0` together with full OpenAPI codegen.

## Supported runtimes

- Node.js ≥ 18 (native `fetch` + `AbortController`)
- Cloudflare Workers
- Bun
- Modern browsers (CORS configured for `picora.me`, `picora.cn`, `web.moraya.app`, and `localhost`)

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for third-party attributions.
