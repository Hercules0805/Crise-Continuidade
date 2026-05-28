/**
 * Domain Entity: ConfigPerfil
 * User profile/permission configuration.
 */
export interface ConfigPerfil {
  id: string;           // UUID
  email: string;        // User email (unique)
  nome: string;         // User name
  area: string;         // User's area/department
  admin: boolean;       // Admin flag
  created_at: Date;
  updated_at: Date;
}
