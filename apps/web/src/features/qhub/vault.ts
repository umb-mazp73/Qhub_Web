export interface SavedCredential { identifier: string; password: string }

/**
 * Conexión guardada **en este dispositivo** (alternativa cuando el servidor no puede guardarla). Se cifra con una clave del
 * navegador que no se puede extraer; no viaja a ningún servidor y se borra con «Olvidar la conexión guardada».
 */
export interface CredentialVault {
  isSupported(): boolean;
  save(orgId: string, credential: SavedCredential): Promise<boolean>;
  load(orgId: string): Promise<SavedCredential | null>;
  has(orgId: string): Promise<boolean>;
  clear(orgId: string): Promise<void>;
}
