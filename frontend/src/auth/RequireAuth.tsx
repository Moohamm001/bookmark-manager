import { useAuth0 } from '@auth0/auth0-react';
import { Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';

/**
 * Route gate.
 *
 * This is convenience, not security. The frontend cannot enforce anything — every route it
 * "protects" is just a fetch away from being called directly with curl. The real gate is
 * the backend's global APP_GUARD; this exists so a signed-out user sees a login screen
 * instead of a page full of failed requests.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, error, loginWithRedirect } = useAuth0();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      void loginWithRedirect({ appState: { returnTo: location.pathname } });
    }
  }, [isLoading, isAuthenticated, error, loginWithRedirect, location.pathname]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography variant="h5">Sign-in failed</Typography>
          <Typography color="text.secondary">{error.message}</Typography>
          <Button variant="contained" onClick={() => void loginWithRedirect()}>
            Try again
          </Button>
        </Stack>
      </Container>
    );
  }

  if (!isAuthenticated) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress />
          <Typography color="text.secondary">Redirecting to sign in…</Typography>
        </Stack>
      </Box>
    );
  }

  return <>{children}</>;
}
