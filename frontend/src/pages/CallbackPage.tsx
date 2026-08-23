import { useAuth0 } from '@auth0/auth0-react';
import { Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';

// Must NOT touch the URL: redirecting on render strips ?code= before the SDK reads it.
export function CallbackPage() {
  const { error, loginWithRedirect } = useAuth0();

  if (!error) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress />
          <Typography color="text.secondary">Completing sign-in…</Typography>
        </Stack>
      </Box>
    );
  }

  // The PKCE transaction is single-use, so a replayed /callback gives "Invalid state".
  const invalidState = /invalid state/i.test(error.message);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="h5">Sign-in failed</Typography>
        <Typography color="text.secondary">
          {invalidState
            ? 'This sign-in link has already been used. It is single-use by design — that is what stops someone replaying a captured login.'
            : error.message}
        </Typography>
        <Button
          variant="contained"
          onClick={() => void loginWithRedirect({ appState: { returnTo: '/collections' } })}
        >
          Sign in again
        </Button>
        {invalidState && (
          <Typography variant="caption" color="text.disabled">
            Original error: {error.message}
          </Typography>
        )}
      </Stack>
    </Container>
  );
}
