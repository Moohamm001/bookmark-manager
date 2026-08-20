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
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApi } from '../auth/AuthProvider';
import { EmptyState, ErrorNote, Loading } from '../components/common';
import type { Bookmark, Collection } from '../api/client';

export function CollectionsPage() {
  const api = useApi();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Collection | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api.listCollections();
      setCollections(res.data);
    } catch (e) {
      setError(e);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    try {
      await api.createCollection(name.trim());
      setName('');
      setCreating(false);
      await load();
    } catch (e) {
      setError(e);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.deleteCollection(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e);
      setPendingDelete(null);
    }
  };

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
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) void create();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim()} onClick={() => void create()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pendingDelete !== null} onClose={() => setPendingDelete(null)}>
        <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The bookmarks inside will <strong>not</strong> be deleted — they become
            uncategorised and stay in your bookmarks list.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** View one collection, with the bookmarks it holds. */
export function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        setError(null);
        const [c, b] = await Promise.all([api.getCollection(id), api.collectionBookmarks(id)]);
        setCollection(c);
        setBookmarks(b.data);
      } catch (e) {
        setError(e);
      }
    })();
  }, [api, id]);

  return (
    <Box>
      <Button component={Link} to="/collections" sx={{ mb: 2 }}>
        ← All collections
      </Button>

      <ErrorNote error={error} />

      {!collection || bookmarks === null ? (
        error ? null : (
          <Loading />
        )
      ) : (
        <>
          <Typography variant="h4" sx={{ mb: 1 }}>
            {collection.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {bookmarks.length} bookmark{bookmarks.length === 1 ? '' : 's'}
          </Typography>

          {bookmarks.length === 0 ? (
            <EmptyState title="Nothing in this collection yet" />
          ) : (
            <Stack spacing={1.5}>
              {bookmarks.map((b) => (
                <Card key={b.id} variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1">{b.title}</Typography>
                    {/* rel=noreferrer: do not leak our URLs to the target site. The backend
                        already restricts stored URLs to http(s), so this href cannot be a
                        javascript: payload. */}
                    <Typography
                      variant="body2"
                      component="a"
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ color: 'primary.main', wordBreak: 'break-all' }}
                    >
                      {b.url}
                    </Typography>
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
