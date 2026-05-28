/**
 * Domain Entity: Token
 * Represents a one-time-use, time-limited link for external stakeholder evaluations.
 */
export interface Token {
  id: string;                    // UUID (also the token value)
  area_id: string;               // FK to Area
  processo_id: string | null;    // FK to Processo (null for area tokens)
  email: string;                 // Recipient email
  tipo: 'processo' | 'area';    // Token type
  usado: boolean;                // Used flag
  expires_at: Date;              // Expiration timestamp
  created_at: Date;
}
