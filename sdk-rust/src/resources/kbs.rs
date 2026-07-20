//! Knowledge Base endpoints: list / create / manifest / sync / raw.
//! Types + wire behavior ported verbatim from Moraya desktop's `kb_sync.rs`.

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

use crate::client::PicoraClient;
use crate::error::PicoraError;
use crate::http::{extract_items, unwrap_data};
use crate::validate::validate_relative_path;

/// A Knowledge Base record.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Kb {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub doc_count: i64,
    pub size_bytes: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// One manifest entry (a KB document's metadata, no content).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub relative_path: String,
    pub source_hash: String,
    pub size_bytes: i64,
    pub updated_at: String,
    /// Server document id — the key into the doc-revisions API. Older servers
    /// omit it; serialize only when present.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc_id: Option<String>,
}

/// One sync operation: `op` is "upsert" or "delete". Optional fields use
/// `skip_serializing_if` because Picora's validator rejects `null` for them —
/// only "present string" or "absent" are accepted (delete ops carry only
/// op + relativePath; first-sync upserts have no baseUpdatedAt).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncOp {
    pub op: String,
    pub relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_updated_at: Option<String>,
}

/// A sync conflict the server could not auto-resolve.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConflictEntry {
    pub relative_path: String,
    pub local_updated_at: String,
    pub remote_updated_at: String,
    pub local_size_bytes: i64,
    pub remote_size_bytes: i64,
    pub local_preview: String,
    pub remote_preview: String,
    pub local_hash: String,
    pub remote_hash: String,
}

/// Result of a batch sync: applied relative paths + unresolved conflicts.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SyncBatchResult {
    pub applied: Vec<String>,
    pub conflicts: Vec<ConflictEntry>,
}

/// Deserialize a typed list from Picora's three response shapes.
fn parse_list<T: DeserializeOwned>(v: &Value) -> Result<Vec<T>, PicoraError> {
    serde_json::from_value(Value::Array(extract_items(v))).map_err(|_| PicoraError::InvalidJson)
}

impl PicoraClient {
    /// `GET /v1/kbs` — list all Knowledge Bases for the authenticated user.
    pub async fn kb_list(&self) -> Result<Vec<Kb>, PicoraError> {
        let v: Value = self.http.send_json(self.get("/v1/kbs"), "kb_list").await?;
        parse_list(&v)
    }

    /// `POST /v1/kbs` — create a KB. `slug` is omitted from the body when
    /// `None`/empty (Picora rejects `null` string fields).
    pub async fn kb_create(&self, name: &str, slug: Option<&str>) -> Result<Kb, PicoraError> {
        let mut body = serde_json::json!({ "name": name });
        if let Some(s) = slug.filter(|s| !s.is_empty()) {
            body["slug"] = Value::String(s.to_string());
        }
        let v: Value = self
            .http
            .send_json(self.post("/v1/kbs").json(&body), "kb_create")
            .await?;
        serde_json::from_value(unwrap_data(&v).clone()).map_err(|_| PicoraError::InvalidJson)
    }

    /// `GET /v1/kbs/{id}/manifest` — the KB's document manifest (3 response
    /// shapes). Caller-supplied `kb_id` goes straight into the path; the server
    /// rejects unknown ids, so no extra validation here (matches desktop).
    pub async fn kb_manifest(&self, kb_id: &str) -> Result<Vec<ManifestEntry>, PicoraError> {
        let path = format!("/v1/kbs/{kb_id}/manifest");
        let v: Value = self.http.send_json(self.get(&path), "manifest").await?;
        parse_list(&v)
    }

    /// `POST /v1/kbs/{id}/sync` — batch upsert/delete. Every op's relative path
    /// is validated before the request leaves.
    pub async fn kb_sync_batch(
        &self,
        kb_id: &str,
        ops: &[SyncOp],
    ) -> Result<SyncBatchResult, PicoraError> {
        for op in ops {
            validate_relative_path(&op.relative_path)?;
        }
        let path = format!("/v1/kbs/{kb_id}/sync");
        let body = serde_json::json!({ "ops": ops });
        let v: Value = self
            .http
            .send_json(self.post(&path).json(&body), "sync-batch")
            .await?;
        let data = unwrap_data(&v);
        Ok(SyncBatchResult {
            applied: serde_json::from_value(
                data.get("applied").cloned().unwrap_or(Value::Array(vec![])),
            )
            .unwrap_or_default(),
            conflicts: serde_json::from_value(
                data.get("conflicts")
                    .cloned()
                    .unwrap_or(Value::Array(vec![])),
            )
            .unwrap_or_default(),
        })
    }

    /// `GET /v1/kbs/{id}/raw?path=…` — a single doc's raw markdown (returns the
    /// body text, not JSON). The relative path is validated first.
    pub async fn kb_raw(&self, kb_id: &str, relative_path: &str) -> Result<String, PicoraError> {
        validate_relative_path(relative_path)?;
        let path = format!("/v1/kbs/{kb_id}/raw");
        let req = self.get(&path).query(&[("path", relative_path)]);
        self.http.send_text(req, "raw").await
    }
}
