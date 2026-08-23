import { useAuth0 } from '@auth0/auth0-react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';

/**
 * Convenience, not security — every route it "protects" is one curl away from being called
 * directly. The real gate is the backend's global APP_GUARD. This just means a signed-out
 * user sees a login redirect instead of a page of failed requests.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, error, loginWithRedirect } = useAuth0();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      void loginWithRedirect({ appState: { returnTo: location.pathname } });
    }
  }, [isLoading, isAuthenticated, error, loginWithRedirect, location.pathname]);

  if (isAuthenticated) return <>{children}</>;

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <CircularProgress />
        <Typography color="text.secondary">
          {error ? error.message : 'Redirecting to sign in…'}
        </Typography>
      </Stack>
    </Box>
  );
}
