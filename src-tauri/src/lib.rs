mod models;
mod pubmed_service;
mod ai_service;
mod download_service;
mod renamer_service;

use models::{Paper, KeywordLogic, SearchField, CrossRefMetadata};
use std::path::PathBuf;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn search_pubmed(
    keywords: Vec<String>,
    logic: KeywordLogic,
    field: SearchField,
    max_results: usize,
) -> Result<Vec<Paper>, String> {
    pubmed_service::search_papers(keywords, logic, field, max_results).await
}

#[tauri::command]
async fn ai_generate_keywords(topic: String) -> Result<Vec<String>, String> {
    ai_service::generate_keywords(&topic).await
}

#[tauri::command]
async fn ai_verify_claim(claim: String, context: String) -> Result<bool, String> {
    ai_service::verify_claim(&claim, &context).await
}

#[tauri::command]
async fn download_paper(doi: String, download_dir: String) -> Result<Option<String>, String> {
    let path = PathBuf::from(download_dir);
    let result = download_service::download_pdf(&doi, &path).await?;
    Ok(result.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
async fn process_paper(file_path: String) -> Result<Option<(String, CrossRefMetadata, Option<String>)>, String> {
    let path = PathBuf::from(file_path);
    if let Some((new_path, metadata)) = renamer_service::process_and_rename(&path).await? {
        let intro = renamer_service::extract_introduction(&new_path);
        return Ok(Some((new_path.to_string_lossy().to_string(), metadata, intro)));
    }
    Ok(None)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv::dotenv().ok();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            if let Some(monitor) = window.current_monitor()? {
                let size = monitor.size();
                let width = (size.width as f64 * 0.75) as u32;
                let height = (size.height as f64 * 0.90) as u32;
                window.set_size(tauri::PhysicalSize::new(width, height))?;
                window.center()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            search_pubmed, 
            ai_generate_keywords, 
            ai_verify_claim,
            download_paper,
            process_paper
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
