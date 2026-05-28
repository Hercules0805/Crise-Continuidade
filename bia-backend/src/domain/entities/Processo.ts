/**
 * Domain Entity: Processo
 * Represents a business process subject to BIA evaluation.
 * Contains BIA, BCP, and DRP data.
 */
export interface Processo {
  id: string;                          // UUID
  area_id: string;                     // FK to Area
  processo: string;                    // Process name
  descricao: string;                   // Impact description
  dependencia: string;                 // Critical dependency
  rto: string;                         // Recovery Time Objective
  rpo: string;                         // Recovery Point Objective
  mtpd: string;                        // Maximum Tolerable Period of Disruption
  biaHomologada: string;               // BIA approval status
  tier: string;                        // Tier classification
  bcpStatus: string;                   // BCP status
  descricaoFuncional: string;          // Functional description
  impactoIndisponibilidade: object;    // JSON - unavailability impact
  bcpObjetivo: string;                 // BCP objective
  bcpEscopo: string;                   // BCP scope
  bcpContatos: object[];               // JSON - BCP contacts
  bcpRiscos: object[];                 // JSON - BCP risks
  bcpPreventivas: object[];            // JSON - BCP preventive actions
  drpStatus: string;                   // DRP status
  drpObjetivo: string;                 // DRP objective
  drpEscopo: string;                   // DRP scope
  drpProcedimentos: string;            // DRP procedures
  drpCriterios: string;                // DRP criteria
  created_at: Date;
  updated_at: Date;
}
