import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { authConfig } from './auth-config';
import { createApiClient, type ApiClient } from '../api/client';

/**
 * Token storage: IN MEMORY (`cacheLocation="memory"`, the SDK default — stated explicitly
 * here so it is a decision rather than an accident).
 *
 * The access token never touches localStorage or sessionStorage. localStorage is readable
 * by any script on the origin, so a single XSS anywhere in the app — or in any dependency
 * — turns into a stolen bearer token for our API. A token in a closure dies with the tab.
 *
 * The honest cost: a full page reload loses the token, and the app must re-establish the
 * session. `useRefreshTokens` is off because the brief's scope is `openid profile email`
 * with no `offline_access`, so no refresh token is issued; the SDK falls back to silent
 * authentication in a hidden iframe, which browsers that block third-party cookies will
 * refuse. When that happens the user sees the Auth0 login page again rather than a broken
 * app. For a privacy-first app I would rather pay an occasional redirect than store a
 * bearer token where script can read it. See DECISIONS.md ADR-002.
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
        // Without this, Auth0 returns an OPAQUE access token that our API cannot validate
        // — every call would 401. This one line is the end-to-end consequence of the
        // token decision in Phase 0.
        audience: authConfig.audience,
        scope: 'openid profile email',
      }}
      onRedirectCallback={(appState) => {
        navigate(appState?.returnTo ?? '/collections', { replace: true });
      }}
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
      createApiClient(
        () => getAccessTokenSilently(),
        () => {
          void loginWithRedirect({
            appState: { returnTo: window.location.pathname },
          });
        },
      ),
    [getAccessTokenSilently, loginWithRedirect],
  );

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
