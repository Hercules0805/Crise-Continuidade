/**
 * Domain Entity: Area
 * Represents a department or organizational unit that owns business processes.
 */
export interface Area {
  id: string;           // UUID
  nome: string;         // Department name
  responsavel: string;  // Responsible person
  email: string;        // Contact email
  solucao: string;      // Solution/product
  created_at: Date;
  updated_at: Date;
}
