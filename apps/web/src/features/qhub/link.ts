import type { Result } from '@qhub/core';
import type { AuthToken } from '@qhub/api-client';

/**
 * Conexión de la organización con Qhub guardada **en el servidor**: se conecta una sola vez y después el servidor
 * entrega tokens a los integrantes sin que la contraseña de Qhub vuelva al navegador.
 */
export interface QhubLinkRepository {
  /** Token de la API para el usuario actual (404 `not_found` si la organización aún no está conectada). */
  issueToken(orgId: string): Promise<Result<AuthToken>>;
  /** Valida la cuenta Qhub y la guarda en el servidor (solo administradores). No publica en el móvil. */
  connect(orgId: string, identifier: string, password: string): Promise<Result<void>>;
  /** Hace visible la organización en la app móvil (exige estar conectada). */
  publish(orgId: string): Promise<Result<void>>;
  /** La oculta del móvil y conserva la conexión. */
  unpublish(orgId: string): Promise<Result<void>>;
  /** Olvida la conexión guardada (y oculta la organización del móvil). */
  disconnect(orgId: string): Promise<Result<void>>;
}
