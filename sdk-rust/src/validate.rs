//! Input validators (ported verbatim from Moraya desktop's `validate_nanoid` /
//! `validate_relative_path`) — reject unsafe values before they reach a URL
//! path segment or the sync API.

use crate::error::PicoraError;

/// Maximum length of a KB-relative document path.
pub const MAX_RELATIVE_PATH_LEN: usize = 1024;

/// Validate that a caller-supplied relative path is safe:
///   - not empty
///   - length ≤ [`MAX_RELATIVE_PATH_LEN`]
///   - does not start with `/`
///   - no backslashes (must be POSIX-style)
///   - does not contain `..` segments
pub fn validate_relative_path(path: &str) -> Result<(), PicoraError> {
    if path.is_empty() {
        return Err(PicoraError::Validation(
            "Relative path must not be empty".into(),
        ));
    }
    if path.len() > MAX_RELATIVE_PATH_LEN {
        return Err(PicoraError::Validation(format!(
            "Relative path exceeds maximum length of {MAX_RELATIVE_PATH_LEN}"
        )));
    }
    if path.starts_with('/') {
        return Err(PicoraError::Validation(
            "Relative path must not start with '/'".into(),
        ));
    }
    if path.contains('\\') {
        return Err(PicoraError::Validation(
            "Relative path must use forward slashes only".into(),
        ));
    }
    for segment in path.split('/') {
        if segment == ".." {
            return Err(PicoraError::Validation(
                "Relative path must not contain '..' segments".into(),
            ));
        }
    }
    Ok(())
}

/// Server ids are nanoid(21): alphanumeric plus `-` and `_`. Reject anything
/// else before it reaches a URL path segment.
pub fn validate_nanoid(id: &str, label: &str) -> Result<(), PicoraError> {
    if id.len() != 21
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(PicoraError::Validation(format!("Invalid {label} format")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_traversal() {
        assert!(validate_relative_path("notes/../secret.md").is_err());
    }

    #[test]
    fn rejects_absolute_and_backslash_and_empty() {
        assert!(validate_relative_path("/abs.md").is_err());
        assert!(validate_relative_path("a\\b.md").is_err());
        assert!(validate_relative_path("").is_err());
    }

    #[test]
    fn accepts_normal_posix_path() {
        assert!(validate_relative_path("notes/2026/plan.md").is_ok());
    }

    #[test]
    fn nanoid_must_be_21_valid_chars() {
        assert!(validate_nanoid("aBcD_efgh-ijklmnop123", "document id").is_ok()); // 21
        assert!(validate_nanoid("tooShort", "document id").is_err());
        assert!(validate_nanoid("has spaces in there!!", "document id").is_err());
    }
}
