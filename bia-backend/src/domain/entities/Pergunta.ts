/**
 * Domain Entity: Pergunta
 * Represents an evaluation question used in BIA assessments, grouped by category.
 */
export interface Pergunta {
  id: string;           // UUID
  categoria: string;    // Category grouping
  pergunta: string;     // Question text
  descricao: string;    // Description/help text
  ativa: boolean;       // Active flag
  ordem: number;        // Display order
  created_at: Date;
  updated_at: Date;
}
