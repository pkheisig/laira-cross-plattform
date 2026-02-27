import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Paper, KeywordLogic, SearchField, WorkflowStep, Claim, CrossRefMetadata } from "../types";
import "../BauhausStyle.css";

export function Workflow() {
  const [step, setStep] = useState<WorkflowStep>(WorkflowStep.TopicDefinition);
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  const showToast = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  };

  // Step 1 Actions
  async function generateKeywords() {
    setIsProcessing(true);
    setStatus("Generating keywords via AI...");
    try {
      const result = await invoke<string[]>("ai_generate_keywords", { topic });
      setKeywords(result.join(", "));
      setStatus("Keywords generated.");
      showToast("Keywords generated successfully.");
    } catch (e) {
      setStatus(`Error: ${e}`);
      showToast("Error generating keywords.", true);
    } finally {
      setIsProcessing(false);
    }
  }

  // Step 2 Actions
  async function searchPapers() {
    setIsProcessing(true);
    setStatus("Searching PubMed...");
    try {
      const keywordList = keywords.split(",").map(k => k.trim()).filter(k => k !== "");
      const results = await invoke<Paper[]>("search_pubmed", {
        keywords: keywordList,
        logic: KeywordLogic.AND,
        field: SearchField.TitleAndAbstract,
        maxResults: 15
      });
      setPapers([...papers, ...results]);
      setStatus(`Found ${results.length} new papers. Total: ${papers.length + results.length}`);
      showToast(`Found ${results.length} papers.`);
    } catch (e) {
      setStatus(`Error: ${e}`);
      showToast("Error searching PubMed.", true);
    } finally {
      setIsProcessing(false);
    }
  }

  // Step 3 Actions
  async function downloadPDFs() {
    setIsProcessing(true);
    setStatus("Downloading PDFs...");
    const updatedPapers = [...papers];
    let dlCount = 0;
    for (let i = 0; i < updatedPapers.length; i++) {
      if (updatedPapers[i].status === "Pending") {
        setStatus(`Downloading ${i + 1}/${updatedPapers.length}...`);
        try {
          const localPath = await invoke<string | null>("download_paper", {
            doi: updatedPapers[i].doi,
            downloadDir: "./downloads"
          });
          if (localPath) {
            updatedPapers[i].status = "Downloaded";
            updatedPapers[i].local_path = localPath;
            dlCount++;
          } else {
            updatedPapers[i].status = { Error: "Download failed" } as any;
          }
        } catch (e) {
          updatedPapers[i].status = { Error: String(e) } as any;
        }
        setPapers([...updatedPapers]);
      }
    }
    setIsProcessing(false);
    setStatus("PDF Downloads Complete.");
    showToast(`Downloaded ${dlCount} PDFs.`);
  }

  // Step 4 Actions
  async function processPDFs() {
    setIsProcessing(true);
    setStatus("Processing PDFs...");
    const updatedPapers = [...papers];
    for (let i = 0; i < updatedPapers.length; i++) {
      if (updatedPapers[i].status === "Downloaded" && updatedPapers[i].local_path) {
        setStatus(`Renaming ${i + 1}/${updatedPapers.length}...`);
        try {
          const result = await invoke<[string, CrossRefMetadata, string] | null>("process_paper", {
            filePath: updatedPapers[i].local_path
          });
          if (result) {
            const [newPath, metadata, intro] = result;
            updatedPapers[i].local_path = newPath;
            updatedPapers[i].status = "Ready";
            updatedPapers[i].introduction = intro;
          }
        } catch (e) {
          console.error(e);
          updatedPapers[i].status = { Error: String(e) } as any;
        }
        setPapers([...updatedPapers]);
      }
    }
    setIsProcessing(false);
    setStatus("PDF Processing Complete.");
    showToast("Processed PDFs successfully.");
  }

  // Step 5 Actions
  async function verifyClaims() {
    setIsProcessing(true);
    setStatus("Verifying claims...");
    const updatedClaims = [...claims];
    for (let i = 0; i < updatedClaims.length; i++) {
      updatedClaims[i].verification_status = "Checking";
      setClaims([...updatedClaims]);
      
      let isSupported = false;
      const supporting: string[] = [];
      
      for (const paper of papers) {
        if (paper.status === "Ready" && paper.introduction) {
          try {
            const result = await invoke<boolean>("ai_verify_claim", {
              claim: updatedClaims[i].text,
              context: paper.introduction
            });
            if (result) {
              isSupported = true;
              supporting.push(paper.id);
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
      
      updatedClaims[i].verification_status = isSupported ? "Verified" : "Rejected";
      updatedClaims[i].supporting_papers = supporting;
      setClaims([...updatedClaims]);
    }
    setIsProcessing(false);
    setStatus("Verification Complete.");
    showToast("Verification complete.");
  }

  const renderStepIndicator = (s: WorkflowStep, title: string) => (
    <button className="step-indicator" onClick={() => setStep(s)}>
      <div className={`step-circle ${step === s ? 'active' : ''}`} />
      <div className={`step-text ${step === s ? 'active' : ''}`}>{title}</div>
    </button>
  );

  return (
    <div className="laira-container">
      {/* Sidebar */}
      <div className="sidebar">
        <h1 className="sidebar-title">LAIRA</h1>
        <div className="sidebar-divider" />
        <div className="sidebar-steps">
          {renderStepIndicator(WorkflowStep.TopicDefinition, "Keywords")}
          {renderStepIndicator(WorkflowStep.FetchingPapers, "Fetch DOIs")}
          {renderStepIndicator(WorkflowStep.DownloadingPDFs, "Download")}
          {renderStepIndicator(WorkflowStep.ProcessingPDFs, "Process Metadata")}
          {renderStepIndicator(WorkflowStep.ClaimVerification, "AI Verification")}
          {renderStepIndicator(WorkflowStep.FinalReview, "Review")}
        </div>
        
        <div className="status-box">
          {isProcessing && <div style={{ marginBottom: "10px", color: "var(--bauhaus-blue)" }}>Processing...</div>}
          <div style={{ color: isProcessing ? "var(--bauhaus-blue)" : "inherit" }}>{status}</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {step === WorkflowStep.TopicDefinition && (
          <div>
            <h2 className="page-title">Generate Keywords</h2>
            <div className="bauhaus-card" style={{ borderLeftColor: "var(--bauhaus-blue)" }}>
              <p style={{ fontWeight: "bold" }}>Describe your research topic:</p>
              <textarea 
                className="bauhaus-textarea"
                value={topic} 
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What do you want to research?"
                style={{ height: "150px" }}
              />
              <div style={{ textAlign: "right" }}>
                <button className="bauhaus-button blue" onClick={generateKeywords} disabled={isProcessing || !topic}>
                  Ask AI for Keywords
                </button>
              </div>
            </div>

            <div className="bauhaus-card" style={{ borderLeftColor: "var(--bauhaus-red)" }}>
              <p style={{ fontWeight: "bold" }}>Keywords (Comma-separated)</p>
              <textarea 
                className="bauhaus-textarea"
                value={keywords} 
                onChange={(e) => setKeywords(e.target.value)}
                style={{ height: "120px" }}
              />
              <div style={{ textAlign: "right" }}>
                <button className="bauhaus-button" onClick={() => setStep(WorkflowStep.FetchingPapers)}>
                  Next Step
                </button>
              </div>
            </div>
          </div>
        )}

        {step === WorkflowStep.FetchingPapers && (
          <div>
            <h2 className="page-title">Fetch & Manage Papers</h2>
            <div style={{ display: "flex", gap: "30px" }}>
              <div className="bauhaus-card" style={{ flex: 1, borderLeftColor: "var(--bauhaus-blue)" }}>
                <p style={{ fontWeight: "bold", fontSize: "18px" }}>Search PubMed</p>
                <input 
                  className="bauhaus-input"
                  value={keywords} 
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Keywords (comma separated)"
                />
                <div style={{ textAlign: "right" }}>
                  <button className="bauhaus-button blue" onClick={searchPapers} disabled={isProcessing || !keywords}>
                    Search Now
                  </button>
                </div>
              </div>
              <div className="bauhaus-card" style={{ flex: 1, borderLeftColor: "var(--bauhaus-yellow)" }}>
                <p style={{ fontWeight: "bold", fontSize: "18px" }}>Manual DOIs</p>
                <textarea 
                  className="bauhaus-textarea"
                  placeholder="Enter DOIs (one per line)"
                  style={{ height: "100px" }}
                />
                <div style={{ textAlign: "right" }}>
                  <button className="bauhaus-button">Add DOIs</button>
                </div>
              </div>
            </div>

            {papers.length > 0 && (
              <div className="bauhaus-card" style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
                <p style={{ fontWeight: "bold", fontSize: "18px" }}>Queued Papers ({papers.length})</p>
                <div style={{ flexGrow: 1, overflowY: "auto", minHeight: "400px" }}>
                  {papers.map(p => (
                    <div key={p.id} className="paper-item">
                      <div>
                        <div style={{ fontWeight: "bold" }}>{p.title}</div>
                        <div style={{ fontSize: "12px" }}>DOI: {p.doi}</div>
                      </div>
                      <div className={`status-badge ${p.status === "Ready" ? "ready" : typeof p.status !== "string" ? "error" : ""}`}>
                        {typeof p.status === "string" ? p.status : "Error"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
              <button className="bauhaus-button white" onClick={() => setStep(WorkflowStep.TopicDefinition)}>Back</button>
              <button className="bauhaus-button" onClick={() => setStep(WorkflowStep.DownloadingPDFs)}>Next Step</button>
            </div>
          </div>
        )}

        {step === WorkflowStep.DownloadingPDFs && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <h2 className="page-title">Download PDFs</h2>
            <div style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
              <button className="bauhaus-button red" onClick={downloadPDFs} disabled={isProcessing}>Download All DOIs</button>
              <button className="bauhaus-button white">Add Local PDFs Instead</button>
            </div>

            <div className="bauhaus-card" style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
              <p style={{ fontWeight: "bold", fontSize: "18px" }}>Download Queue ({papers.length})</p>
              <div style={{ flexGrow: 1, overflowY: "auto", minHeight: "500px" }}>
                {papers.map(p => (
                  <div key={p.id} className="paper-item">
                    <div>
                      <div style={{ fontWeight: "bold" }}>{p.title}</div>
                      <div style={{ fontSize: "12px" }}>DOI: {p.doi}</div>
                    </div>
                    <div className={`status-badge ${p.status === "Downloaded" ? "ready" : typeof p.status !== "string" ? "error" : ""}`}>
                      {typeof p.status === "string" ? p.status : "Error"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
              <button className="bauhaus-button white" onClick={() => setStep(WorkflowStep.FetchingPapers)}>Back</button>
              <button className="bauhaus-button" onClick={() => setStep(WorkflowStep.ProcessingPDFs)}>Next Step</button>
            </div>
          </div>
        )}

        {step === WorkflowStep.ProcessingPDFs && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <h2 className="page-title">Process Metadata & Extract</h2>
            <div style={{ marginBottom: "30px" }}>
              <button className="bauhaus-button blue" onClick={processPDFs} disabled={isProcessing}>Rename Files & Extract Text</button>
            </div>

            <div className="bauhaus-card" style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
              <p style={{ fontWeight: "bold", fontSize: "18px" }}>Processing Queue</p>
              <div style={{ flexGrow: 1, overflowY: "auto", minHeight: "500px" }}>
                {papers.map(p => (
                  <div key={p.id} className="paper-item">
                    <div>
                      <div style={{ fontWeight: "bold" }}>{p.title}</div>
                      <div style={{ fontSize: "12px" }}>{p.status === "Ready" ? "Ready for AI" : "Pending"}</div>
                    </div>
                    <div className={`status-badge ${p.status === "Ready" ? "ready" : ""}`}>
                      {typeof p.status === "string" ? p.status : "Error"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
              <button className="bauhaus-button white" onClick={() => setStep(WorkflowStep.DownloadingPDFs)}>Back</button>
              <button className="bauhaus-button" onClick={() => setStep(WorkflowStep.ClaimVerification)}>Next Step</button>
            </div>
          </div>
        )}

        {step === WorkflowStep.ClaimVerification && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <h2 className="page-title">AI Claim Verification</h2>
            <div className="bauhaus-card" style={{ borderLeftColor: "var(--bauhaus-blue)" }}>
              <p style={{ fontWeight: "bold" }}>Add Claim</p>
              <div style={{ display: "flex", gap: "10px" }}>
                <input 
                  className="bauhaus-input"
                  placeholder="E.g., CRISPR-Cas9 significantly reduces..." 
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const text = e.currentTarget.value;
                      if (text) {
                        setClaims([...claims, { id: crypto.randomUUID(), text, verification_status: "Pending", supporting_papers: [] }]);
                        e.currentTarget.value = "";
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <button className="bauhaus-button" onClick={verifyClaims} disabled={isProcessing}>Verify Claims against PDFs</button>
            </div>

            <div className="bauhaus-card" style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flexGrow: 1, overflowY: "auto", minHeight: "400px" }}>
                {claims.map(c => (
                  <div key={c.id} className="paper-item" style={{ borderLeftWidth: "6px" }}>
                    <div>
                      <div style={{ fontWeight: "bold" }}>{c.text}</div>
                      {c.supporting_papers.length > 0 && <div style={{ color: "var(--bauhaus-blue)", fontSize: "12px", fontWeight: "bold", marginTop: "5px" }}>Supported by {c.supporting_papers.length} paper(s)</div>}
                    </div>
                    <div className={`status-badge ${c.verification_status === "Verified" ? "ready" : c.verification_status === "Rejected" ? "error" : ""}`}>
                      {typeof c.verification_status === 'string' ? c.verification_status : 'Error'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
              <button className="bauhaus-button white" onClick={() => setStep(WorkflowStep.ProcessingPDFs)}>Back</button>
              <button className="bauhaus-button" onClick={() => setStep(WorkflowStep.FinalReview)}>Next Step</button>
            </div>
          </div>
        )}

        {step === WorkflowStep.FinalReview && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <h2 className="page-title">Final Report</h2>
            <div className="bauhaus-card" style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flexGrow: 1, overflowY: "auto", minHeight: "500px" }}>
                {claims.filter(c => c.verification_status === "Verified").map(c => (
                  <div key={c.id} style={{ marginBottom: "25px", padding: "15px", border: "2px solid var(--bauhaus-black)" }}>
                    <div style={{ fontWeight: "bold", fontSize: "16px", marginBottom: "10px" }}>{c.text}</div>
                    <div style={{ paddingLeft: "20px" }}>
                      {c.supporting_papers.map(id => (
                        <div key={id} style={{ fontSize: "14px", marginBottom: "5px" }}>- {papers.find(p => p.id === id)?.title}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
              <button className="bauhaus-button white" onClick={() => setStep(WorkflowStep.ClaimVerification)}>Back</button>
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="bauhaus-button">Export TXT</button>
                <button className="bauhaus-button red">Export PDF</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.isError ? 'error' : ''}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
