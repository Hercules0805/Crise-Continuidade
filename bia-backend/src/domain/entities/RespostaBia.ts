/**
 * Domain Entity: RespostaBia
 * Represents an evaluation response containing scores for each question per process.
 */
export interface RespostaBia {
  id: string;           // UUID
  processo_id: string;  // FK to Processo
  respondente: string;  // Respondent email or name
  cargo: string;        // Respondent role
  scores: Record<string, number>;  // Question -> score mapping (JSONB)
  score_total: number;  // Calculated total score
  tier: string;         // Calculated tier
  created_at: Date;
}
