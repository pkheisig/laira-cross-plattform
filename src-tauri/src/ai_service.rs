use serde_json::{json, Value};
use std::env;

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

fn get_api_key() -> String {
    env::var("OPENROUTER_API_KEY").unwrap_or_else(|_| "".to_string())
}

fn get_model() -> String {
    env::var("OPENROUTER_MODEL").unwrap_or_else(|_| "google/gemini-2.5-flash".to_string())
}

pub async fn verify_claim(claim: &str, context: &str) -> Result<bool, String> {
    let api_key = get_api_key();
    if api_key.is_empty() || api_key == "sk-or-v1-your-key-here" {
        println!("No OpenRouter API key found. Mocking AI verification.");
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        return Ok(true); // Mocking true for simplicity
    }

    let client = reqwest::Client::new();
    let prompt = format!(
        "Does the following text support the claim: '{}'?
Text: {}

Answer ONLY with 'YES' or 'NO'.",
        claim, context
    );

    let body = json!({
        "model": get_model(),
        "messages": [
            { "role": "user", "content": prompt }
        ]
    });

    let res = client.post(OPENROUTER_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        println!("OpenRouter API Error: {}", error_text);
        return Ok(false);
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("");

    Ok(content.to_uppercase().contains("YES"))
}

pub async fn generate_keywords(topic: &str) -> Result<Vec<String>, String> {
    let api_key = get_api_key();
    if api_key.is_empty() || api_key == "sk-or-v1-your-key-here" {
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        return Ok(vec!["CRISPR".to_string(), "Gene Editing".to_string(), "Off-target".to_string()]);
    }

    let client = reqwest::Client::new();
    let prompt = format!(
        "Generate a list of 3-5 precise, highly relevant single keywords or short phrases to search PubMed for the following topic: '{}'.
Return ONLY a comma-separated list of keywords. Do not include any other text or explanations.",
        topic
    );

    let body = json!({
        "model": get_model(),
        "messages": [
            { "role": "user", "content": prompt }
        ]
    });

    let res = client.post(OPENROUTER_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let error_text = res.text().await.unwrap_or_default();
        println!("OpenRouter API Error: {}", error_text);
        return Ok(vec![]);
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("");

    let keywords = content
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(keywords)
}
