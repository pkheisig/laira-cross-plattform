use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Paper {
    pub id: Uuid,
    pub title: String,
    pub doi: String,
    pub pmid: Option<String>,
    pub status: PaperStatus,
    pub local_path: Option<String>,
    pub abstract_text: Option<String>,
    pub introduction: Option<String>,
    pub metadata: Option<CrossRefMetadata>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum PaperStatus {
    Pending,
    Downloading,
    Downloaded,
    Renaming,
    Renamed,
    Extracting,
    Ready,
    Error(String),
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct CrossRefMetadata {
    pub title: String,
    pub author: String,
    pub year: String,
    pub journal: String,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Claim {
    pub id: Uuid,
    pub text: String,
    pub verification_status: ClaimStatus,
    pub supporting_papers: Vec<Uuid>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ClaimStatus {
    Pending,
    Checking,
    Verified,
    Rejected,
    Error(String),
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum KeywordLogic {
    AND,
    OR,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum SearchField {
    TitleAndAbstract,
    Title,
    Abstract,
}

impl SearchField {
    pub fn pubmed_tag(&self) -> &str {
        match self {
            SearchField::TitleAndAbstract => "[Title/Abstract]",
            SearchField::Title => "[Title]",
            SearchField::Abstract => "[Abstract]",
        }
    }
}
