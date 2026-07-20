//! Document endpoints: server-side revision history (Picora v0.74.0).
//! Types + behavior ported from Moraya desktop's `picora_doc_revisions.rs`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::client::PicoraClient;
use crate::error::PicoraError;
use crate::http::unwrap_data;
use crate::validate::validate_nanoid;

/// One revision record (revNumber descending, pruned to the account max).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub id: String,
    pub rev_number: i64,
    pub size_bytes: i64,
    /// "upload" | "sync" | "restore".
    pub origin: String,
    pub source_hash: String,
    pub created_at: String,
}

/// A document's revision list plus total bytes.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RevisionList {
    pub revisions: Vec<Revision>,
    pub total_bytes: i64,
}

/// One revision's full markdown content plus metadata.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RevisionContent {
    pub content: String,
    pub rev_number: i64,
    pub source_hash: String,
    pub created_at: String,
}

impl PicoraClient {
    /// `GET /v1/docs/{id}/revisions` — a document's server-side revision history.
    pub async fn doc_revisions(&self, doc_id: &str) -> Result<RevisionList, PicoraError> {
        validate_nanoid(doc_id.trim(), "document id")?;
        let path = format!("/v1/docs/{}/revisions", doc_id.trim());
        let v: Value = self
            .http
            .send_json(self.get(&path), "doc_revisions")
            .await?;
        serde_json::from_value(unwrap_data(&v).clone()).map_err(|_| PicoraError::InvalidJson)
    }

    /// `GET /v1/docs/{id}/revisions/{revId}` — one revision's content + metadata.
    pub async fn doc_revision_content(
        &self,
        doc_id: &str,
        rev_id: &str,
    ) -> Result<RevisionContent, PicoraError> {
        validate_nanoid(doc_id.trim(), "document id")?;
        validate_nanoid(rev_id.trim(), "revision id")?;
        let path = format!("/v1/docs/{}/revisions/{}", doc_id.trim(), rev_id.trim());
        let v: Value = self
            .http
            .send_json(self.get(&path), "doc_revision_content")
            .await?;
        serde_json::from_value(unwrap_data(&v).clone()).map_err(|_| PicoraError::InvalidJson)
    }
}
