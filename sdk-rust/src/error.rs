//! Error type + sanitized error-message construction.
//!
//! Ported verbatim from Moraya desktop's per-command `sanitize_status` /
//! `body_is_plan_limit` / `build_error_with_body` helpers (previously
//! copy-pasted across 6 Tauri command files). The `Display` of [`PicoraError`]
//! yields the user-facing string the desktop frontend already renders, so a
//! command can migrate with a plain `.map_err(|e| e.to_string())`.

use std::fmt;

/// Characters of a server error body surfaced to the user (rest truncated).
const MAX_BODY_CHARS: usize = 200;

/// A Picora client error. `Display` is the sanitized, user-facing message
/// (never leaks bearer tokens, `sk_live_` prefixes, or long raw bodies).
#[derive(Debug, Clone)]
pub enum PicoraError {
    /// Missing/empty base URL or token, or another client-side precondition.
    Config(String),
    /// Caller input (nanoid / relative path) rejected before the request left.
    Validation(String),
    /// Transport failure reaching Picora.
    Network,
    /// Picora returned a non-2xx response. `message` is already sanitized +
    /// context-tagged; `status` is the raw HTTP status for callers that branch
    /// on it (e.g. 404 → treat as "not found").
    Api { status: u16, message: String },
    /// A 2xx response whose body was not the expected JSON.
    InvalidJson,
}

impl fmt::Display for PicoraError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PicoraError::Config(m) | PicoraError::Validation(m) => write!(f, "{m}"),
            PicoraError::Network => write!(f, "Network error contacting Picora"),
            PicoraError::Api { message, .. } => write!(f, "{message}"),
            PicoraError::InvalidJson => write!(f, "Picora returned invalid JSON"),
        }
    }
}

impl std::error::Error for PicoraError {}

/// HTTP status → friendly, action-oriented message (context-tagged).
pub fn sanitize_status(status: u16, ctx: &str) -> String {
    match status {
        401 | 403 => format!("Picora authentication failed ({ctx})"),
        402 => format!("Picora quota exceeded — upgrade your plan ({ctx})"),
        404 => format!("Picora resource not found ({ctx})"),
        408 | 504 => format!("Picora request timed out ({ctx})"),
        409 => format!("Picora resource already exists ({ctx})"),
        422 => format!("Picora rejected request — validation failed ({ctx})"),
        429 => format!("Picora rate limit exceeded ({ctx})"),
        500..=599 => format!("Picora service unavailable ({ctx})"),
        _ => format!("Picora request failed with status {status} ({ctx})"),
    }
}

/// A 403 whose body describes a plan / quota / count limit is a PLAN-LIMIT
/// rejection (e.g. "KB count 5/5 reached for current plan"), not an auth
/// failure — the server reuses 403 for both. Detect it so the message reads as
/// a quota problem the user can act on, not a misleading "authentication failed".
fn body_is_plan_limit(body: &str) -> bool {
    let b = body.to_lowercase();
    b.contains("quota")
        || b.contains("reached")
        || b.contains("upgrade")
        || (b.contains("plan") && (b.contains("limit") || b.contains("count")))
}

/// Build a user-facing error from a non-2xx Picora response. Strips Bearer
/// tokens / `sk_live_` prefixes from the body, caps body length, collapses
/// whitespace, and falls back to the status-only message when the body is empty.
pub fn build_error_with_body(status: u16, body: &str, ctx: &str) -> String {
    let cleaned: String = body
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(MAX_BODY_CHARS)
        .collect();
    let cleaned = cleaned.replace("sk_live_", "sk_***_").replace("Bearer ", "Bearer ***");
    // Reclassify plan-limit 403s as quota (402) so they don't read as auth failures.
    let effective_status = if status == 403 && body_is_plan_limit(&cleaned) { 402 } else { status };
    if cleaned.is_empty() {
        sanitize_status(effective_status, ctx)
    } else {
        format!("{} — {}", sanitize_status(effective_status, ctx), cleaned)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_bearer_and_sk_live_from_body() {
        let msg = build_error_with_body(500, "Authorization: Bearer secret sk_live_abc", "ctx");
        assert!(!msg.contains("Bearer secret"));
        assert!(msg.contains("Bearer ***"));
        assert!(msg.contains("sk_***_abc"));
    }

    #[test]
    fn empty_body_falls_back_to_status_only() {
        assert_eq!(build_error_with_body(404, "", "kb_raw"), "Picora resource not found (kb_raw)");
    }

    #[test]
    fn plan_limit_403_reclassified_as_quota() {
        let msg = build_error_with_body(403, "KB count 5/5 reached for current plan", "kb_create");
        assert!(msg.contains("quota exceeded"));
        assert!(!msg.contains("authentication failed"));
    }

    #[test]
    fn plain_403_stays_auth_failure() {
        let msg = build_error_with_body(403, "forbidden", "kb_list");
        assert!(msg.contains("authentication failed"));
    }

    #[test]
    fn long_body_truncated() {
        let body = "x".repeat(500);
        // ctx has no 'x' so the count reflects only the (truncated) body.
        let msg = build_error_with_body(400, &body, "op");
        assert_eq!(msg.matches('x').count(), MAX_BODY_CHARS);
    }
}
