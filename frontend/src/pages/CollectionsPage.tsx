import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApi } from '../auth/AuthProvider';
import { useAsync } from '../lib/useAsync';
import { BookmarkLink, EmptyState, ErrorNote, Loading } from '../components/common';
import type { Collection } from '../api/client';

export function CollectionsPage() {
  const api = useApi();
  const { data, error, setError, reload } = useAsync(() => api.listCollections(), [api]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await reload();
    } catch (e) {
      setError(e);
    }
  };

  const collections = data?.data ?? null;

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Collections</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
          New collection
        </Button>
      </Stack>

      <ErrorNote error={error} />

      {collections === null ? (
        <Loading />
      ) : collections.length === 0 ? (
        <EmptyState title="No collections yet" hint="Create one to start organising your bookmarks." />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
          }}
        >
          {collections.map((c) => (
            <Card key={c.id} variant="outlined">
              <CardActionArea component={Link} to={`/collections/${c.id}`}>
                <CardContent>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" noWrap>
                        {c.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Created {new Date(c.createdAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      aria-label={`Delete ${c.name}`}
                      onClick={(e) => {
                        // Inside a CardActionArea Link: stop both the navigation and the bubble.
                        e.preventDefault();
                        e.stopPropagation();
                        setPendingDelete(c);
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} fullWidth maxWidth="xs">
        <DialogTitle>New collection</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!name.trim()}
            onClick={() =>
              void run(async () => {
                await api.createCollection(name.trim());
                setName('');
                setCreating(false);
              })
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The bookmarks inside will <strong>not</strong> be deleted — they become uncategorised
            and stay in your bookmarks list.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() =>
              void run(async () => {
                if (pendingDelete) await api.deleteCollection(pendingDelete.id);
                setPendingDelete(null);
              })
            }
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** View one collection, with the bookmarks it holds. */
export function CollectionDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const api = useApi();
  const { data, error } = useAsync(
    async () => ({
      collection: await api.getCollection(id),
      bookmarks: (await api.collectionBookmarks(id)).data,
    }),
    [api, id],
  );

  return (
    <Box>
      <Button component={Link} to="/collections" sx={{ mb: 2 }}>
        ← All collections
      </Button>

      <ErrorNote error={error} />

      {!data ? (
        error ? null : (
          <Loading />
        )
      ) : (
        <>
          <Typography variant="h4" sx={{ mb: 1 }}>
            {data.collection.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {data.bookmarks.length} bookmark{data.bookmarks.length === 1 ? '' : 's'}
          </Typography>

          {data.bookmarks.length === 0 ? (
            <EmptyState title="Nothing in this collection yet" />
          ) : (
            <Stack spacing={1.5}>
              {data.bookmarks.map((b) => (
                <Card key={b.id} variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1">{b.title}</Typography>
                    <BookmarkLink url={b.url} />
                    {b.notes && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {b.notes}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
