export interface GeneratedContentSavedRecord {
  id: string;
  table: string;
}

/**
 * F-118 R-25 — warning de fabricación content-side. Campo OPCIONAL (omitido en el camino
 * feliz), como `generation_warning`/`social_proof_warning`: ningún consumidor rompe.
 * La forma se declara ESTRUCTURALMENTE (`kind`/`tier` sueltos) para que el tipo de la
 * frontera HTTP no dependa del seam puro; la UI estrecha con un cast en el borde, igual que
 * hace F-098 con `compliance_warning` → `MissingFact[]`.
 */
export interface GenerateContentFabricationWarning {
  signals: { kind: string; tier: string; value: string; digits: string }[];
  tier: string;
  retried: boolean;
}

export interface GenerateContentResponse {
  success: boolean;
  step: string;
  content: Record<string, unknown>;
  raw_text: string;
  saved?: GeneratedContentSavedRecord | null;
  prompt_version?: string;
  fabrication_warning?: GenerateContentFabricationWarning;
}

export interface GenerateContentParams {
  step: string;
  clientId: string;
  inputData?: Record<string, unknown>;
  save?: boolean;
}
