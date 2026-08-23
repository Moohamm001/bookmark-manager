import { useAuth0 } from '@auth0/auth0-react';
import { Box, Button, CircularProgress, Container, Stack, Typography } from '@mui/material';

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
/**
 * "Invalid state" is the one failure worth explaining rather than just reporting.
 *
 * Before redirecting to Auth0 the SDK stores the PKCE transaction — the `state` and the
 * `code_verifier` — in sessionStorage, then matches it against what comes back. The
 * transaction is SINGLE-USE and deleted once consumed. So this error means the callback ran
 * without a matching transaction, which in practice is almost always a replayed `/callback`
 * URL: a reload, a bookmarked callback link, a back-button, or a dev-server hot reload
 * landing on the callback.
 *
 * It is not a misconfiguration, and it is not the user's fault, so the recovery is simply to
 * start a fresh login rather than making them decode the message.
 */
function explain(message: string): string {
  if (/invalid state/i.test(message)) {
    return (
      'This sign-in link has already been used. It is single-use by design — that is what ' +
      'stops someone replaying a captured login. Start a fresh sign-in below.'
    );
  }
  return message;
}

export function CallbackPage() {
  const { error, loginWithRedirect } = useAuth0();

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Typography variant="h5">Sign-in failed</Typography>
          <Typography color="text.secondary">{explain(error.message)}</Typography>
          {/*
            Starts a NEW transaction rather than navigating to a protected route. Routing to
            /collections instead would leave the SDK's `error` set, so RequireAuth would show
            its own "Sign-in failed" and the user would have to click Try again twice.
          */}
          <Button
            variant="contained"
            onClick={() => void loginWithRedirect({ appState: { returnTo: '/collections' } })}
          >
            Sign in again
          </Button>
          <Typography variant="caption" color="text.disabled">
            Original error: {error.message}
          </Typography>
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
