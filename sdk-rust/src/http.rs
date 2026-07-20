//! Shared reqwest transport — the single `http_client` + response-handling that
//! was copy-pasted across Moraya desktop's Picora command files.

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::error::{build_error_with_body, PicoraError};

/// Default request timeout, matching the desktop `DEFAULT_TIMEOUT_SECS`.
const DEFAULT_TIMEOUT_SECS: u64 = 60;

/// A shared reqwest client (connection pool + timeout). Cheap to clone.
#[derive(Clone)]
pub struct HttpCore {
    client: reqwest::Client,
}

impl HttpCore {
    pub fn new() -> Result<Self, PicoraError> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .map_err(|_| PicoraError::Config("Failed to initialize HTTP client".into()))?;
        Ok(Self { client })
    }

    pub fn reqwest(&self) -> &reqwest::Client {
        &self.client
    }

    /// Send a fully-built request (bearer already applied) and return the raw
    /// body text on 2xx, or a sanitized [`PicoraError::Api`] otherwise.
    pub async fn send_text(
        &self,
        req: reqwest::RequestBuilder,
        ctx: &str,
    ) -> Result<String, PicoraError> {
        let res = req.send().await.map_err(|_| PicoraError::Network)?;
        let status = res.status().as_u16();
        let ok = res.status().is_success();
        let body = res.text().await.unwrap_or_default();
        if !ok {
            return Err(PicoraError::Api {
                status,
                message: build_error_with_body(status, &body, ctx),
            });
        }
        Ok(body)
    }

    /// Send + parse the body into `T`.
    pub async fn send_json<T: DeserializeOwned>(
        &self,
        req: reqwest::RequestBuilder,
        ctx: &str,
    ) -> Result<T, PicoraError> {
        let body = self.send_text(req, ctx).await?;
        parse_json(&body)
    }
}

/// Parse a JSON body, mapping failure to [`PicoraError::InvalidJson`].
pub fn parse_json<T: DeserializeOwned>(body: &str) -> Result<T, PicoraError> {
    serde_json::from_str(body).map_err(|_| PicoraError::InvalidJson)
}

/// Extract a list from Picora's three historical response shapes:
/// bare `[...]`, `{ "data": [...] }`, or `{ "data": { "items": [...] } }`.
/// Returns an empty vec when none match (mirrors the desktop behavior).
pub fn extract_items(v: &Value) -> Vec<Value> {
    let data = v.get("data").unwrap_or(v);
    if let Some(items) = data.get("items").and_then(|i| i.as_array()) {
        items.clone()
    } else if let Some(arr) = data.as_array() {
        arr.clone()
    } else {
        Vec::new()
    }
}

/// Unwrap a `{ "data": ... }` envelope, falling back to the value itself when
/// there is no `data` key (some endpoints return the object bare).
pub fn unwrap_data(v: &Value) -> &Value {
    v.get("data").unwrap_or(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extract_items_handles_three_shapes() {
        assert_eq!(extract_items(&json!([{ "id": 1 }])).len(), 1);
        assert_eq!(extract_items(&json!({ "data": [{ "id": 1 }, { "id": 2 }] })).len(), 2);
        assert_eq!(extract_items(&json!({ "data": { "items": [{ "id": 1 }] } })).len(), 1);
        assert_eq!(extract_items(&json!({ "data": { "nope": true } })).len(), 0);
    }

    #[test]
    fn unwrap_data_prefers_data_key() {
        assert_eq!(unwrap_data(&json!({ "data": { "x": 1 } })), &json!({ "x": 1 }));
        assert_eq!(unwrap_data(&json!({ "x": 1 })), &json!({ "x": 1 }));
    }
}
