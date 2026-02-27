use crate::models::{Paper, PaperStatus, KeywordLogic, SearchField};
use serde_json::Value;
use uuid::Uuid;

pub const BASE_URL: &str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";

pub async fn search_papers(
    keywords: Vec<String>,
    logic: KeywordLogic,
    field: SearchField,
    max_results: usize,
) -> Result<Vec<Paper>, String> {
    if keywords.is_empty() {
        return Ok(vec![]);
    }

    let tag = field.pubmed_tag();
    let formatted_keywords: Vec<String> = keywords
        .into_iter()
        .map(|k| {
            let trimmed = k.trim();
            if trimmed.contains(' ') {
                format!("\"{}\"{}", trimmed, tag)
            } else {
                format!("{}{}", trimmed, tag)
            }
        })
        .collect();

    let join_string = match logic {
        KeywordLogic::AND => " AND ",
        KeywordLogic::OR => " OR ",
    };

    let query = formatted_keywords.join(join_string);
    let encoded_query = urlencoding::encode(&query);

    let url = format!(
        "{}esearch.fcgi?db=pubmed&term={}&retmax={}&retmode=json",
        BASE_URL, encoded_query, max_results
    );

    let client = reqwest::Client::new();
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;

    let id_list = json["esearchresult"]["idlist"]
        .as_array()
        .ok_or("Failed to parse idlist")?
        .iter()
        .filter_map(|id| id.as_str().map(|s| s.to_string()))
        .collect::<Vec<String>>();

    if id_list.is_empty() {
        return Ok(vec![]);
    }

    fetch_details(id_list).await
}

async fn fetch_details(pmids: Vec<String>) -> Result<Vec<Paper>, String> {
    let ids_string = pmids.join(",");
    let url = format!(
        "{}esummary.fcgi?db=pubmed&id={}&retmode=json",
        BASE_URL, ids_string
    );

    let client = reqwest::Client::new();
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    let json: Value = res.json().await.map_err(|e| e.to_string())?;

    let result = json["result"]
        .as_object()
        .ok_or("Failed to parse result")?;

    let mut papers = Vec::new();

    for pmid in pmids {
        if let Some(paper_data) = result.get(&pmid) {
            let title = paper_data["title"]
                .as_str()
                .unwrap_or("Unknown Title")
                .to_string();
            let mut doi = String::new();

            if let Some(article_ids) = paper_data["articleids"].as_array() {
                for id_data in article_ids {
                    if id_data["idtype"].as_str() == Some("doi") {
                        doi = id_data["value"].as_str().unwrap_or("").to_string();
                        break;
                    }
                }
            }

            if !doi.is_empty() {
                papers.push(Paper {
                    id: Uuid::new_v4(),
                    title,
                    doi,
                    pmid: Some(pmid),
                    status: PaperStatus::Pending,
                    local_path: None,
                    abstract_text: None,
                    introduction: None,
                    metadata: None,
                });
            }
        }
    }

    Ok(papers)
}
