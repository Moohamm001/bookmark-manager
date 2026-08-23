import { Alert, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function Loading() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      {error instanceof Error ? error.message : String(error)}
    </Alert>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed' }}>
      <Stack spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle1" color="text.secondary">
          {title}
        </Typography>
        {hint && (
          <Typography variant="body2" color="text.disabled">
            {hint}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * rel=noreferrer so we do not leak our URLs to the target site. The href cannot be a
 * javascript: payload because the API rejects any non-http(s) URL at the write boundary.
 */
export function BookmarkLink({ url, caption }: { url: string; caption?: boolean }) {
  return (
    <Typography
      component="a"
      variant={caption ? 'caption' : 'body2'}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ color: 'primary.main', wordBreak: 'break-all' }}
    >
      {url}
    </Typography>
  );
}
