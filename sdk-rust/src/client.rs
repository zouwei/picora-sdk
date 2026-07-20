//! The `PicoraClient` — constructed once per (base URL, bearer token) pair.
//! Resource methods (`kb_list`, `doc_revisions`, …) are implemented in the
//! `resources` submodules via `impl PicoraClient` blocks.

use crate::error::PicoraError;
use crate::http::HttpCore;

/// A configured Picora API client. Holds a shared HTTP core, the API base URL,
/// and the bearer token. Cheap to clone (the reqwest pool is `Arc`-backed).
///
/// Moraya desktop constructs one per Tauri command from the `(apiBase, apiKey)`
/// the frontend passes in, so credentials never leave the Rust process.
#[derive(Clone)]
pub struct PicoraClient {
    pub(crate) http: HttpCore,
    pub(crate) base_url: String,
    pub(crate) token: String,
}

impl PicoraClient {
    /// Build a client. Fails fast on an empty base URL or token (matching the
    /// desktop `validate_creds` precondition).
    pub fn new(base_url: impl Into<String>, token: impl Into<String>) -> Result<Self, PicoraError> {
        let base_url = base_url.into();
        let token = token.into();
        if base_url.trim().is_empty() {
            return Err(PicoraError::Config("Picora endpoint is empty".into()));
        }
        if token.trim().is_empty() {
            return Err(PicoraError::Config("Picora API key is empty".into()));
        }
        Ok(Self {
            http: HttpCore::new()?,
            base_url: base_url.trim().to_string(),
            token: token.trim().to_string(),
        })
    }

    /// The shared HTTP core — exposed so consumers can drive bespoke endpoints
    /// (`client.http().send_json(client.get(path), ctx)`) with the same
    /// error-sanitizing pipeline as the typed methods.
    pub fn http(&self) -> &HttpCore {
        &self.http
    }

    /// Join the base URL with a path (`api_url` from the desktop helpers).
    pub fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }

    /// A bearer-authorized GET request builder for `path`.
    pub fn get(&self, path: &str) -> reqwest::RequestBuilder {
        self.http
            .reqwest()
            .get(self.url(path))
            .bearer_auth(&self.token)
    }

    /// A bearer-authorized POST request builder for `path`.
    pub fn post(&self, path: &str) -> reqwest::RequestBuilder {
        self.http
            .reqwest()
            .post(self.url(path))
            .bearer_auth(&self.token)
    }

    /// A bearer-authorized PATCH request builder for `path`.
    pub fn patch(&self, path: &str) -> reqwest::RequestBuilder {
        self.http
            .reqwest()
            .patch(self.url(path))
            .bearer_auth(&self.token)
    }

    /// A bearer-authorized DELETE request builder for `path`.
    pub fn delete(&self, path: &str) -> reqwest::RequestBuilder {
        self.http
            .reqwest()
            .delete(self.url(path))
            .bearer_auth(&self.token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_creds() {
        assert!(PicoraClient::new("", "tok").is_err());
        assert!(PicoraClient::new("https://api.picora.me", "").is_err());
    }

    #[test]
    fn url_join_normalizes_slashes() {
        let c = PicoraClient::new("https://api.picora.me/", "tok").unwrap();
        assert_eq!(c.url("/v1/kbs"), "https://api.picora.me/v1/kbs");
        assert_eq!(c.url("v1/kbs"), "https://api.picora.me/v1/kbs");
    }
}
