//! User/account endpoints used by the desktop: doc-versioning settings +
//! clear-all-revisions. Ported from `picora_doc_revisions.rs`.
//!
//! Read-only `GET /v1/user/me` and `GET /v1/user/me/usage` are intentionally
//! left to the consumer's bespoke parsing via the public low-level primitives
//! (`client.get(...)` + `client.http().send_json(...)`), because the desktop
//! quota parser does null-block + `usage_v2` detection the typed layer doesn't model.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::client::PicoraClient;
use crate::error::PicoraError;
use crate::http::unwrap_data;

/// Bound on the clear-revisions loop (server deletes ≤200 rows per call).
const MAX_CLEAR_ROUNDS: usize = 100;

/// Result of clearing all of the account's document revisions.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClearRevisionsResult {
    pub deleted: i64,
    pub freed_bytes: i64,
}

impl PicoraClient {
    /// `PATCH /v1/user/me` — update server-side doc-versioning settings. At
    /// least one field required; `max` (when present) must be 1–500.
    pub async fn update_doc_versioning(
        &self,
        enabled: Option<bool>,
        max: Option<u32>,
    ) -> Result<(), PicoraError> {
        if enabled.is_none() && max.is_none() {
            return Err(PicoraError::Config("No settings to update".into()));
        }
        if let Some(m) = max {
            if !(1..=500).contains(&m) {
                return Err(PicoraError::Validation(
                    "docVersioningMax must be between 1 and 500".into(),
                ));
            }
        }
        let mut body = serde_json::Map::new();
        if let Some(e) = enabled {
            body.insert("docVersioningEnabled".into(), e.into());
        }
        if let Some(m) = max {
            body.insert("docVersioningMax".into(), m.into());
        }
        // send_text discards the body; we only care about success/failure.
        self.http
            .send_text(
                self.patch("/v1/user/me").json(&Value::Object(body)),
                "update_user_settings",
            )
            .await
            .map(|_| ())
    }

    /// `DELETE /v1/user/me/doc-revisions` — clear ALL of the account's document
    /// revisions. The server processes ≤200 rows per call and signals
    /// `hasMore`; loop until done (bounded by [`MAX_CLEAR_ROUNDS`]).
    pub async fn clear_doc_revisions(&self) -> Result<ClearRevisionsResult, PicoraError> {
        let mut total_deleted = 0i64;
        let mut total_freed = 0i64;
        for _ in 0..MAX_CLEAR_ROUNDS {
            let v: Value = self
                .http
                .send_json(self.delete("/v1/user/me/doc-revisions"), "clear_revisions")
                .await?;
            let data = unwrap_data(&v);
            total_deleted += data.get("deleted").and_then(|x| x.as_i64()).unwrap_or(0);
            total_freed += data.get("freedBytes").and_then(|x| x.as_i64()).unwrap_or(0);
            if !data
                .get("hasMore")
                .and_then(|x| x.as_bool())
                .unwrap_or(false)
            {
                break;
            }
        }
        Ok(ClearRevisionsResult {
            deleted: total_deleted,
            freed_bytes: total_freed,
        })
    }
}
