# Picora SDKs

Official client SDKs for the [Picora](https://picora.me) API — the AI-workflow resource hosting platform (images, videos, audio, Markdown docs & knowledge bases, collections, AIGC pipelines).

This repository is a **multi-language container**: each language SDK lives in its own top-level directory and versions/releases independently.

| Directory | Package | Status |
|---|---|---|
| [`sdk-nodejs/`](./sdk-nodejs) | [`@picora/sdk`](https://www.npmjs.com/package/@picora/sdk) (npm) | ✅ Active — full public API coverage (236 operations, v0.4.0) |
| [`sdk-python/`](./sdk-python) | `picora-sdk` (PyPI) | 🚧 Planned |
| [`sdk-rust/`](./sdk-rust) | `picora-sdk` (git-only, not on crates.io yet) | 🧩 Scoped — Moraya desktop (Tauri) consumer subset, not tracked against the full public API |

## Contract source of truth

All SDKs implement the same public OpenAPI contract, distributed via the three-stage sync chain:

```
picora-service  apps/api/openapi.json  (hand-maintained source of truth)
      │  pnpm openapi:split → openapi-public.json → sync to assets
      ▼
picora-assets   docs/api/openapi.json  (public contract distribution point)
      │  each SDK vendors a snapshot + coverage gate
      ▼
picora-sdk      sdk-<lang>/spec/openapi-public.json  (vendored snapshot)
```

Each SDK enforces a bidirectional coverage gate in CI: every spec operation must map to an SDK method, and vice versa. See the per-language README for build/test/release instructions.

## Working on the Node.js SDK

```bash
cd sdk-nodejs
pnpm install
pnpm spec:check   # verify vendored contract snapshot is fresh
pnpm test         # includes the OpenAPI coverage gate
pnpm run build
```

## License

Apache-2.0. See [`sdk-nodejs/LICENSE`](./sdk-nodejs/LICENSE) and per-directory `NOTICE`.
