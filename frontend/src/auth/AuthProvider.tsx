import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { authConfig } from './auth-config';
import { createApiClient, type ApiClient } from '../api/client';

// Memory-only tokens: localStorage is script-readable, so one XSS steals the bearer. Cost is
// re-auth on hard reload (ADR-002). `audience` is required or Auth0 returns an opaque token.
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
