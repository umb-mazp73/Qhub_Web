import { ApiContext } from '@qhub/api-client';
import { AppSession } from '@/features/session/app-session';
import { ConnectToQhub, type TokenStore } from '@/features/qhub/connection';
import type { AuthRepository } from '@qhub/api-client';
import type { StaffRepository } from '@/features/staff';
import type { SecurityRepository } from '@/features/security/security';
import type { QhubLinkRepository } from '@/features/qhub/link';
import type { CredentialVault } from '@/features/qhub/vault';

export function buildTestSession(staff: StaffRepository, auth: AuthRepository, store: TokenStore, security?: SecurityRepository, link?: QhubLinkRepository, vault?: CredentialVault, context = new ApiContext()) {
  return { context, session: new AppSession(staff, new ConnectToQhub(auth, context, store, link, vault), context, security, link) };
}
