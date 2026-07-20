# picora-sdk (Rust)

A Rust client for the [Picora](https://picora.me) API, scoped to what the
[Moraya](https://moraya.app) desktop app (Tauri) needs. It collapses the
`http_client` / `build_error` / `api_url` / `validate_*` helpers that were
previously copy-pasted across the desktop's Picora command files into one
reusable, tested crate.

Part of the multi-language [`picora-sdk`](https://github.com/zouwei/picora-sdk)
container repo (alongside `sdk-nodejs` / `sdk-python`).

## Install

Consumed via a **git tag dependency** (not published to crates.io):

```toml
[dependencies]
picora-sdk = { git = "https://github.com/zouwei/picora-sdk", tag = "rust-v0.1.0" }
```

## Usage

```rust
let client = picora_sdk::PicoraClient::new("https://api.picora.me", "sk_live_…")?;

// Typed resource methods
let kbs = client.kb_list().await?;
let manifest = client.kb_manifest(&kb.id).await?;
let revisions = client.doc_revisions(doc_id).await?;

// Low-level escape hatch for bespoke endpoints (same auth + error pipeline)
let usage: serde_json::Value =
    client.http().send_json(client.get("/v1/user/me/usage"), "usage").await?;
```

Every method returns `PicoraError`, whose `Display` is a sanitized, user-facing
message (never leaks bearer tokens, `sk_live_` prefixes, or raw bodies) — so a
Tauri command migrates with a plain `.map_err(|e| e.to_string())`.

## Scope

PC-focused subset: knowledge bases (list/create/manifest/sync/raw), documents
(revisions), user settings (doc-versioning / clear-revisions), plus the shared
HTTP core + validators. Grows toward fuller parity as consumers need it.

## Releasing

Push a `rust-v*` tag (matching `Cargo.toml`'s `version`); the
`publish-rust.yml` workflow builds, tests, packages, and creates a GitHub
Release with the `.crate` artifact.

## License

Apache-2.0
