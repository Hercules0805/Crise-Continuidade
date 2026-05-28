/**
 * Domain Entity: Dependencia
 * Represents a dependency catalog entry (people, systems, suppliers) linked to processes.
 */
export interface Dependencia {
  id: string;           // UUID
  categoria: string;    // Category (people, systems, suppliers)
  nome: string;         // Name
  detalhes: string;     // Details/role (papel)
  setor: string;        // Sector/department
  empresa: string;      // Company
  telefone: string;     // Phone number
  email: string;        // Email address
  created_at: Date;
  updated_at: Date;
}
