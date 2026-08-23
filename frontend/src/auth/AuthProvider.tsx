import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { authConfig } from './auth-config';
import { createApiClient, type ApiClient } from '../api/client';

/**
 * Token storage is in memory (`cacheLocation="memory"`), stated explicitly rather than
 * relied on as a default: localStorage is readable by any script on the origin, so one XSS
 * anywhere becomes a stolen bearer token. The cost — re-authenticating on every hard
 * reload — is real and accepted. See DECISIONS.md ADR-002.
 *
 * `audience` is not optional: without it Auth0 returns an opaque token the API cannot
 * validate, and every call 401s (ADR-001).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <Auth0Provider
      domain={authConfig.domain}
      clientId={authConfig.clientId}
      cacheLocation="memory"
      useRefreshTokens={false}
      authorizationParams={{
        redirect_uri: authConfig.redirectUri,
        audience: authConfig.audience,
        scope: 'openid profile email',
      }}
      onRedirectCallback={(appState) =>
        navigate(appState?.returnTo ?? '/collections', { replace: true })
      }
    >
      {children}
    </Auth0Provider>
  );
}

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0();

  const api = useMemo(
    () =>
      createApiClient(getAccessTokenSilently, () => {
        void loginWithRedirect({ appState: { returnTo: window.location.pathname } });
      }),
    [getAccessTokenSilently, loginWithRedirect],
  );

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
