import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useApi } from '../auth/AuthProvider';
import { EmptyState, ErrorNote, Loading } from '../components/common';
import type { Bookmark, Collection } from '../api/client';

const UNCATEGORISED = '__uncategorised__';

export function BookmarksPage() {
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('collectionId') ?? '';
  const q = searchParams.get('q') ?? '';

  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Bookmark | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ url: '', title: '', notes: '', collectionId: '' });

  const load = useCallback(async () => {
    try {
      setError(null);
      const [b, c] = await Promise.all([
        api.listBookmarks({
          ...(filter === UNCATEGORISED
            ? { uncategorised: true }
            : filter
              ? { collectionId: filter }
              : {}),
          ...(q ? { q } : {}),
        }),
        api.listCollections(),
      ]);
      setBookmarks(b.data);
      setCollections(c.data);
    } catch (e) {
      setError(e);
      setBookmarks([]);
    }
  }, [api, filter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const create = async () => {
    try {
      await api.createBookmark({
        url: draft.url.trim(),
        title: draft.title.trim(),
        notes: draft.notes.trim() || null,
        collectionId: draft.collectionId || null,
      });
      setDraft({ url: '', title: '', notes: '', collectionId: '' });
      setCreating(false);
      await load();
    } catch (e) {
      setError(e);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteBookmark(id);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e);
    }
  };

  const collectionName = (id: string | null) =>
    id ? (collections.find((c) => c.id === id)?.name ?? 'Unknown') : null;

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Bookmarks</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
          New bookmark
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          select
          size="small"
          label="Collection"
          value={filter}
          onChange={(e) => setParam('collectionId', e.target.value)}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="">All bookmarks</MenuItem>
          <MenuItem value={UNCATEGORISED}>Uncategorised only</MenuItem>
          <Divider />
          {collections.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          label="Search title, notes or URL"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          sx={{ flexGrow: 1 }}
        />
      </Stack>

      <ErrorNote error={error} />

      {bookmarks === null ? (
        <Loading />
      ) : bookmarks.length === 0 ? (
        <EmptyState
          title="No bookmarks match"
          hint={filter || q ? 'Try clearing the filters.' : 'Save your first link.'}
        />
      ) : (
        <Stack spacing={1.5}>
          {bookmarks.map((b) => (
            <Card key={b.id} variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1">{b.title}</Typography>
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
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={collectionName(b.collectionId) ?? 'Uncategorised'}
                      />
                      <Button size="small" onClick={() => setSelected(b)}>
                        Details
                      </Button>
                    </Stack>
                  </Box>
                  <IconButton
                    size="small"
                    aria-label={`Delete ${b.title}`}
                    onClick={() => void remove(b.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Details */}
      <Dialog open={selected !== null} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>{selected?.title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Field label="URL" value={selected?.url ?? ''} />
            <Field label="Collection" value={collectionName(selected?.collectionId ?? null) ?? 'Uncategorised'} />
            <Field label="Notes" value={selected?.notes || '—'} />
            <Field
              label="Created"
              value={selected ? new Date(selected.createdAt).toLocaleString() : ''}
            />
            <Field
              label="Updated"
              value={selected ? new Date(selected.updatedAt).toLocaleString() : ''}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={() => selected && void remove(selected.id)}>
            Delete
          </Button>
          <Button onClick={() => setSelected(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create */}
      <Dialog open={creating} onClose={() => setCreating(false)} fullWidth maxWidth="sm">
        <DialogTitle>New bookmark</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              label="URL"
              placeholder="https://…"
              helperText="Must be an http or https URL"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            />
            <TextField
              label="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <TextField
              label="Notes"
              multiline
              minRows={2}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
            <TextField
              select
              label="Collection"
              value={draft.collectionId}
              onChange={(e) => setDraft({ ...draft, collectionId: e.target.value })}
            >
              <MenuItem value="">Uncategorised</MenuItem>
              {collections.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!draft.url.trim() || !draft.title.trim()}
            onClick={() => void create()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Box>
  );
}
