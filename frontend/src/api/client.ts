import { authConfig } from '../auth/auth-config';

export interface Collection {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  notes: string | null;
  collectionId: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AllView {
  collections: (Collection & { bookmarks: Bookmark[] })[];
  uncategorised: Bookmark[];
}

export interface Me {
  id: string;
  auth0Sub: string;
  email: string;
}

/**
 * Mirrors the backend's single error shape (AllExceptionsFilter).
 *
 * `status: 0` means the request never reached the server at all — a network-level failure
 * rather than an HTTP response.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

type TokenGetter = () => Promise<string>;

/**
 * The only place a request to our API is constructed.
 *
 * The access token is fetched per request from the Auth0 SDK rather than captured once:
 * the SDK owns expiry and renewal, and a copy held in a module variable is a copy that
 * goes stale. Nothing here reads or writes localStorage — see the note in AuthProvider.
 */
export function createApiClient(getToken: TokenGetter, onUnauthorized: () => void) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let token: string;
    try {
      token = await getToken();
    } catch {
      // The SDK could not produce a token (session gone, silent auth blocked).
      onUnauthorized();
      throw new ApiError(401, 'Session expired — signing in again');
    }

    const url = `${authConfig.apiBaseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
    } catch (cause) {
      // A rejected fetch() is a NETWORK-level failure — the request never got a response.
      // The browser's message for all of them is the famously unhelpful "Failed to fetch",
      // which says nothing about which URL or why, so replace it with something a person
      // can act on. In practice it is almost always the first cause listed.
      throw new ApiError(
        0,
        `Could not reach the API at ${url}. Is the backend running? ` +
          `Start it with: cd backend && npm run dev  ` +
          `(other causes: wrong VITE_API_BASE_URL in frontend/.env, or CORS_ORIGIN in ` +
          `backend/.env not matching ${window.location.origin}).`,
        { cause },
      );
    }

    if (res.status === 401) {
      // The API rejected the token. Re-authenticate rather than showing a dead UI.
      onUnauthorized();
      throw new ApiError(401, 'Not authenticated');
    }

    if (res.status === 204) return undefined as T;

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const message = Array.isArray(body?.message)
        ? body.message.join(', ')
        : (body?.message ?? `Request failed with ${res.status}`);
      throw new ApiError(res.status, message);
    }

    return body as T;
  }

  const qs = (params: Record<string, string | number | boolean | undefined>): string => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') search.set(k, String(v));
    }
    const s = search.toString();
    return s ? `?${s}` : '';
  };

  return {
    me: () => request<Me>('/me'),

    listCollections: (params: { q?: string; limit?: number } = {}) =>
      request<Paginated<Collection>>(`/collections${qs({ limit: 100, ...params })}`),
    getCollection: (id: string) => request<Collection>(`/collections/${id}`),
    createCollection: (name: string) =>
      request<Collection>('/collections', { method: 'POST', body: JSON.stringify({ name }) }),
    renameCollection: (id: string, name: string) =>
      request<Collection>(`/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    deleteCollection: (id: string) => request<void>(`/collections/${id}`, { method: 'DELETE' }),
    collectionBookmarks: (id: string) =>
      request<Paginated<Bookmark>>(`/collections/${id}/bookmarks${qs({ limit: 100 })}`),

    listBookmarks: (
      params: { collectionId?: string; uncategorised?: boolean; q?: string; limit?: number } = {},
    ) => request<Paginated<Bookmark>>(`/bookmarks${qs({ limit: 100, ...params })}`),
    getBookmark: (id: string) => request<Bookmark>(`/bookmarks/${id}`),
    createBookmark: (input: {
      url: string;
      title: string;
      notes?: string | null;
      collectionId?: string | null;
    }) => request<Bookmark>('/bookmarks', { method: 'POST', body: JSON.stringify(input) }),
    updateBookmark: (id: string, input: Partial<Omit<Bookmark, 'id' | 'ownerId'>>) =>
      request<Bookmark>(`/bookmarks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteBookmark: (id: string) => request<void>(`/bookmarks/${id}`, { method: 'DELETE' }),

    all: () => request<AllView>('/all'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
