import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InboxIcon from '@mui/icons-material/Inbox';
import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useApi } from '../auth/AuthProvider';
import { EmptyState, ErrorNote, Loading } from '../components/common';
import type { AllView, Bookmark } from '../api/client';

/**
 * Bonus page (§3.4): collections with their bookmarks nested, rather than two lists.
 *
 * One request to `GET /all`, not N+1 client-side fetches — the nesting is the server's job
 * because only the server can scope it. See BookmarksService.listAllGrouped, where the
 * nested include carries its own ownerId.
 */
export function AllPage() {
  const api = useApi();
  const [view, setView] = useState<AllView | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        setView(await api.all());
      } catch (e) {
        setError(e);
      }
    })();
  }, [api]);

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
              count={c.bookmarks.length}
              bookmarks={c.bookmarks}
              emptyText="No bookmarks in this collection"
            />
          ))}

          {view.uncategorised.length > 0 && (
            <Section
              icon={<InboxIcon fontSize="small" />}
              title="Uncategorised"
              count={view.uncategorised.length}
              bookmarks={view.uncategorised}
              emptyText=""
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
  count,
  bookmarks,
  emptyText,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  bookmarks: Bookmark[];
  emptyText: string;
}) {
  return (
    <Paper variant="outlined">
      <Stack direction="row" spacing={1} sx={{ p: 2, pb: 1, alignItems: 'center' }}>
        {icon}
        <Typography variant="h6">{title}</Typography>
        <Chip size="small" label={count} />
      </Stack>

      {bookmarks.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ px: 2, pb: 2 }}>
          {emptyText}
        </Typography>
      ) : (
        <List dense disablePadding>
          {bookmarks.map((b) => (
            <ListItem key={b.id} divider>
              <ListItemText
                primary={b.title}
                secondary={
                  <Typography
                    component="a"
                    variant="caption"
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: 'primary.main', wordBreak: 'break-all' }}
                  >
                    {b.url}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
