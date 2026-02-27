use regex::Regex;
use reqwest::{Client, header};
use std::path::{Path, PathBuf};
use tokio::fs;

const MIRRORS: &[&str] = &[
    "https://sci-hub.se",
    "https://sci-hub.st",
    "https://sci-hub.ru",
    "http://sci-hub.wf",
    "https://sci-hub.cat",
];

pub async fn download_pdf(doi: &str, output_directory: &Path) -> Result<Option<PathBuf>, String> {
    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
        .build()
        .map_err(|e| e.to_string())?;

    for mirror in MIRRORS {
        let url = format!("{}/{}", mirror, doi);
        
        let res = match client.get(&url).send().await {
            Ok(r) => r,
            Err(_) => continue,
        };

        if res.status().is_success() {
            let content_type = res.headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");

            if content_type == "application/pdf" || content_type == "application/octet-stream" {
                let bytes = res.bytes().await.map_err(|e| e.to_string())?;
                return save_pdf(&bytes, doi, output_directory).await.map(Some);
            }

            if let Ok(html_string) = res.text().await {
                if let Some(pdf_url_string) = extract_pdf_link(&html_string) {
                    let pdf_url = if pdf_url_string.starts_with("//") {
                        format!("https:{}", pdf_url_string)
                    } else {
                        pdf_url_string
                    };

                    if let Ok(pdf_res) = client.get(&pdf_url).send().await {
                        if pdf_res.status().is_success() {
                            if let Ok(bytes) = pdf_res.bytes().await {
                                return save_pdf(&bytes, doi, output_directory).await.map(Some);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

fn extract_pdf_link(html: &str) -> Option<String> {
    let iframe_re = Regex::new(r#"(?i)<iframe[^>]+id=["']pdf[^>]+src=["']([^"']+)["']"#).unwrap();
    if let Some(caps) = iframe_re.captures(html) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    let embed_re = Regex::new(r#"(?i)<embed[^>]+id=["']pdf[^>]+src=["']([^"']+)["']"#).unwrap();
    if let Some(caps) = embed_re.captures(html) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    None
}

async fn save_pdf(bytes: &[u8], doi: &str, output_directory: &Path) -> Result<PathBuf, String> {
    let safe_name = doi.replace('/', "_").replace('.', "_");
    let file_name = format!("paper_{}.pdf", safe_name);
    let file_path = output_directory.join(file_name);

    if !output_directory.exists() {
        fs::create_dir_all(output_directory).await.map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, bytes).await.map_err(|e| e.to_string())?;
    Ok(file_path)
}
