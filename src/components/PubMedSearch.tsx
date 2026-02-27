import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Paper, KeywordLogic, SearchField } from "../types";

export function PubMedSearch() {
  const [keywords, setKeywords] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    try {
      const keywordList = keywords.split(",").map((k) => k.trim()).filter((k) => k !== "");
      const results = await invoke<Paper[]>("search_pubmed", {
        keywords: keywordList,
        logic: KeywordLogic.AND,
        field: SearchField.TitleAndAbstract,
        maxResults: 10,
      });
      setPapers(results);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "20px", textAlign: "left" }}>
      <h2>PubMed Search</h2>
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="Enter keywords (comma separated)..."
          style={{ flex: 1, padding: "8px" }}
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {papers.map((paper) => (
          <li key={paper.id} style={{ marginBottom: "15px", borderBottom: "1px solid #ccc", paddingBottom: "10px" }}>
            <strong>{paper.title}</strong>
            <br />
            <small>DOI: {paper.doi} | PMID: {paper.pmid}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
