# picora-sdk (Rust)

A Rust client for the [Picora](https://picora.me) API, scoped to what the Moraya desktop app
(Tauri) needs — not a full port of the public API surface like the Node.js SDK.

It collapses the `http_client` / `build_error` / `api_url` / `validate_*` helpers that were
copy-pasted across the desktop's Picora command files into one reusable, tested crate. Every
method returns [`PicoraError`], whose `Display` is the sanitized, user-facing message the
desktop frontend already renders — so a Tauri command migrates with a plain
`.map_err(|e| e.to_string())`.

## Install

```toml
[dependencies]
picora-sdk = { git = "https://github.com/zouwei/picora-sdk", package = "picora-sdk" }
```

Not yet published to crates.io — pull via git until the crate stabilizes.

## Quickstart

```rust,no_run
# async fn demo() -> Result<(), picora_sdk::PicoraError> {
let client = picora_sdk::PicoraClient::new("https://api.picora.me", "sk_live_…")?;
let kbs = client.kb_list().await?;
# Ok(()) }
```

## Scope

Currently covers the Knowledge Base surface (`kb_list`, manifest, sync, raw) the desktop app
consumes. Unlike `sdk-nodejs`, this crate does **not** track full public-API coverage in CI —
resources are added as the desktop app needs them.

## Build & test

```bash
cd sdk-rust
cargo build
cargo test
```

## License

Apache-2.0.
