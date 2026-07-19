# picora-sdk (Python)

🚧 **Planned** — the Python SDK for the Picora API is not yet implemented.

It will implement the same public OpenAPI contract as [`sdk-nodejs`](../sdk-nodejs), vendoring a
snapshot of `picora-assets/docs/api/openapi.json` under `spec/` and enforcing the same bidirectional
coverage gate. Target package name on PyPI: `picora-sdk`.

Scope reference (mirrors `@picora/sdk` v0.3.0):

- Four auth modes: API Key, static OAuth token, OAuth session with rotation-safe auto-refresh, first-party session
- Authorization Code + PKCE (S256), Device Flow (RFC 8628), token revocation (RFC 7009), OIDC discovery
- Full resource coverage: media (images/videos/audio + TUS resumable uploads), docs & KBs (sync/manifest),
  collections & episodes, AIGC pipelines, billing, orgs, and platform endpoints

Tracking iteration: `picora-assets/iterations/` (a future `v0.8x.0-sdk-python-*.md`).
