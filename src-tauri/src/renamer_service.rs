use crate::models::CrossRefMetadata;
use regex::Regex;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::fs;

pub async fn process_and_rename(file_path: &Path) -> Result<Option<(PathBuf, CrossRefMetadata)>, String> {
    // Extract text from PDF
    let text = match pdf_extract::extract_text(file_path) {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };

    // Extract DOI via Regex
    let doi = match extract_doi(&text) {
        Some(d) => d,
        None => return Ok(None),
    };

    // Fetch Metadata
    let metadata = match fetch_metadata(&doi).await? {
        Some(m) => m,
        None => return Ok(None),
    };

    // Rename
    let clean_journal = metadata.journal.replace(' ', "");
    let safe_author = metadata.author.replace('/', "");
    let new_name = format!("{}_{}_{}.pdf", metadata.year, safe_author, clean_journal);
    let sanitized_name = sanitize_filename(&new_name);

    let mut new_path = file_path.to_path_buf();
    new_path.set_file_name(sanitized_name);

    if new_path.exists() {
        fs::remove_file(&new_path).await.map_err(|e| e.to_string())?;
    }
    fs::rename(file_path, &new_path).await.map_err(|e| e.to_string())?;

    Ok(Some((new_path, metadata)))
}

fn extract_doi(text: &str) -> Option<String> {
    let re = Regex::new(r"(10\.\d{4,9}/[-._;()/:a-zA-Z0-9]+)").unwrap();
    if let Some(caps) = re.captures(text) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }
    None
}

async fn fetch_metadata(doi: &str) -> Result<Option<CrossRefMetadata>, String> {
    let url = format!("https://api.crossref.org/works/{}", doi);
    let client = reqwest::Client::new();
    let res = client.get(url)
        .header("User-Agent", "Laira/1.0 (mailto:test@example.com)")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(None);
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    let message = match json["message"].as_object() {
        Some(m) => m,
        None => return Ok(None),
    };

    let title = message["title"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Title")
        .to_string();

    let author = message["author"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a["family"].as_str())
        .unwrap_or("Unknown")
        .to_string();

    let year = message["created"]["date-parts"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_u64())
        .map(|y| y.to_string())
        .unwrap_or_else(|| "0000".to_string());

    let journal = message["short-container-title"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .or_else(|| {
            message["container-title"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("UnknownJournal")
        .to_string();

    Ok(Some(CrossRefMetadata {
        title,
        author,
        year,
        journal,
    }))
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .filter(|&c| !r#"<>:"/\|?*"#.contains(c))
        .collect()
}

pub fn extract_introduction(file_path: &Path) -> Option<String> {
    let text = pdf_extract::extract_text(file_path).ok()?;
    
    // Naive extraction mirroring Swift version
    if let Some(index) = text.to_lowercase().find("introduction") {
        let start = index + "introduction".len();
        let end = std::cmp::min(start + 2000, text.len());
        Some(text[start..end].to_string())
    } else {
        Some(text.chars().take(2000).collect())
    }
}
