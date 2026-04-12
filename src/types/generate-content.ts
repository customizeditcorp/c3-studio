export interface GeneratedContentSavedRecord {
  id: string;
  table: string;
}

export interface GenerateContentResponse {
  success: boolean;
  step: string;
  content: Record<string, unknown>;
  raw_text: string;
  saved?: GeneratedContentSavedRecord | null;
  prompt_version?: string;
}

export interface GenerateContentParams {
  step: string;
  clientId: string;
  inputData?: Record<string, unknown>;
  save?: boolean;
}
