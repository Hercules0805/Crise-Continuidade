/**
 * Domain Entity: ConfigResposta
 * Configuration of answer options (label, value, color) per question category.
 */
export interface ConfigResposta {
  id: string;           // UUID
  categoria: string;    // Category grouping
  valor: string;        // Numeric value as string
  label: string;        // Display label
  cor: string;          // Text color
  background: string;   // Background color
  created_at: Date;
  updated_at: Date;
}
