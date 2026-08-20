import { useAuth0 } from '@auth0/auth0-react';
import { Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { Link } from 'react-router';

/**
 * Where Auth0 lands after login, carrying `?code=…&state=…`.
 *
 * This component's job is to do NOTHING to the URL. That sounds trivial; it is the whole
 * bug this file exists to fix.
 *
 * The first version routed `/callback` straight to `<Navigate to="/collections" replace />`
 * on the theory that the SDK would consume the code first. It does not. React runs child
 * effects before parent effects, so `Navigate`'s effect rewrote the URL before
 * `Auth0Provider`'s effect ran `hasAuthParams()` — which reads `window.location.search` at
 * that moment. The SDK saw a clean URL, never exchanged the authorization code, and left the
 * user unauthenticated. `RequireAuth` then bounced them back to Auth0, so signing in
 * appeared to do nothing at all.
 *
 * So: render a spinner and wait. `Auth0Provider.onRedirectCallback` performs the navigation
 * once the code has actually been exchanged.
 */
export function CallbackPage() {
  const { error } = useAuth0();

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography variant="h5">Sign-in failed</Typography>
          <Typography color="text.secondary">{error.message}</Typography>
          <Button component={Link} to="/collections" variant="contained">
            Try again
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <CircularProgress />
        <Typography color="text.secondary">Completing sign-in…</Typography>
      </Stack>
    </Box>
  );
}
