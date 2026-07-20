//! # picora-sdk (Rust)
//!
//! A Rust client for the Picora API, scoped to what the Moraya desktop app
//! (Tauri) needs. It collapses the `http_client` / `build_error` / `api_url` /
//! `validate_*` helpers that were copy-pasted across the desktop's Picora
//! command files into one reusable, tested crate.
//!
//! ```no_run
//! # async fn demo() -> Result<(), picora_sdk::PicoraError> {
//! let client = picora_sdk::PicoraClient::new("https://api.picora.me", "sk_live_…")?;
//! let kbs = client.kb_list().await?;
//! # Ok(()) }
//! ```
//!
//! Every method returns [`PicoraError`], whose `Display` is the sanitized,
//! user-facing message the desktop frontend already renders — so a Tauri
//! command migrates with a plain `.map_err(|e| e.to_string())`.

pub mod client;
pub mod error;
pub mod http;
pub mod resources;
pub mod validate;

pub use client::PicoraClient;
pub use error::PicoraError;
pub use validate::{validate_nanoid, validate_relative_path, MAX_RELATIVE_PATH_LEN};

// Ergonomic root re-exports of resource types.
pub use resources::docs::{Revision, RevisionContent, RevisionList};
pub use resources::kbs::{ConflictEntry, Kb, ManifestEntry, SyncBatchResult, SyncOp};
pub use resources::user::ClearRevisionsResult;
