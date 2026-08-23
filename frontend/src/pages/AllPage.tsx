import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InboxIcon from '@mui/icons-material/Inbox';
import { Box, Chip, List, ListItem, ListItemText, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useApi } from '../auth/AuthProvider';
import { useAsync } from '../lib/useAsync';
import { BookmarkLink, EmptyState, ErrorNote, Loading } from '../components/common';
import type { Bookmark } from '../api/client';

/**
 * Bonus page: collections with their bookmarks nested. One request to GET /all rather than
 * N+1 from the client — the nesting is the server's job because only the server can scope it.
 */
export function AllPage() {
  const api = useApi();
  const { data: view, error } = useAsync(() => api.all(), [api]);

  if (error) return <ErrorNote error={error} />;
  if (!view) return <Loading />;

  const isEmpty = view.collections.length === 0 && view.uncategorised.length === 0;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Everything
      </Typography>

      {isEmpty ? (
        <EmptyState title="Nothing saved yet" />
      ) : (
        <Stack spacing={3}>
          {view.collections.map((c) => (
            <Section
              key={c.id}
              icon={<FolderOpenIcon fontSize="small" />}
              title={c.name}
              bookmarks={c.bookmarks}
              emptyText="No bookmarks in this collection"
            />
          ))}
          {view.uncategorised.length > 0 && (
            <Section
              icon={<InboxIcon fontSize="small" />}
              title="Uncategorised"
              bookmarks={view.uncategorised}
            />
          )}
        </Stack>
      )}
    </Box>
  );
}

function Section({
  icon,
  title,
  bookmarks,
  emptyText,
}: {
  icon: ReactNode;
  title: string;
  bookmarks: Bookmark[];
  emptyText?: string;
}) {
  return (
    <Paper variant="outlined">
      <Stack direction="row" spacing={1} sx={{ p: 2, pb: 1, alignItems: 'center' }}>
        {icon}
        <Typography variant="h6">{title}</Typography>
        <Chip size="small" label={bookmarks.length} />
      </Stack>

      {bookmarks.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ px: 2, pb: 2 }}>
          {emptyText}
        </Typography>
      ) : (
        <List dense disablePadding>
          {bookmarks.map((b) => (
            <ListItem key={b.id} divider>
              <ListItemText primary={b.title} secondary={<BookmarkLink url={b.url} caption />} />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
