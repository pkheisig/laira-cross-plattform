export interface Paper {
  id: string;
  title: string;
  doi: string;
  pmid?: string;
  status: PaperStatus;
  local_path?: string;
  abstract_text?: string;
  introduction?: string;
}

export type PaperStatus =
  | "Pending"
  | "Downloading"
  | "Downloaded"
  | "Renaming"
  | "Renamed"
  | "Extracting"
  | "Ready"
  | { Error: string };

export enum KeywordLogic {
  AND = "AND",
  OR = "OR",
}

export enum SearchField {
  TitleAndAbstract = "TitleAndAbstract",
  Title = "Title",
  Abstract = "Abstract",
}

export enum WorkflowStep {
  TopicDefinition = 0,
  FetchingPapers = 1,
  DownloadingPDFs = 2,
  ProcessingPDFs = 3,
  ClaimVerification = 4,
  FinalReview = 5,
}

export interface Claim {
  id: string;
  text: string;
  verification_status: ClaimStatus;
  supporting_papers: string[];
}

export type ClaimStatus =
  | "Pending"
  | "Checking"
  | "Verified"
  | "Rejected"
  | { Error: string };

export interface CrossRefMetadata {
  title: string;
  author: string;
  year: string;
  journal: string;
}
