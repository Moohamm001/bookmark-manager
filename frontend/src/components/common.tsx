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
  const message = error instanceof Error ? error.message : String(error);
  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      {message}
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
