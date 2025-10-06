#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use tempfile::NamedTempFile;

    use crate::services::file_service;

    #[test]
    fn read_file_content_success() {
        let mut tmp = NamedTempFile::new().expect("failed to create temp file");
        writeln!(tmp, "hello world").unwrap();
        let path = tmp.path().to_string_lossy().to_string();

        let content = file_service::read_file_content(&path).expect("should read file");
        assert!(content.contains("hello world"));
    }

    #[test]
    fn read_file_content_not_found() {
        let path = "/tmp/this-file-should-not-exist-123456.txt";
        let err = file_service::read_file_content(path).unwrap_err();
        assert!(err.contains("Failed to read file"));
    }
}
