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

/** Mirrors the backend error shape. `status: 0` = never reached the server. */
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

/** Token is fetched per request: the SDK owns expiry, and a cached copy goes stale. */
export function createApiClient(getToken: TokenGetter, onUnauthorized: () => void) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let token: string;
    try {
      token = await getToken();
    } catch {
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
      // "Failed to fetch" names neither the URL nor the reason; say something actionable.
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
    listCollections: (params: { q?: string; limit?: number } = {}) =>
      request<Paginated<Collection>>(`/collections${qs({ limit: 100, ...params })}`),
    getCollection: (id: string) => request<Collection>(`/collections/${id}`),
    createCollection: (name: string) =>
      request<Collection>('/collections', { method: 'POST', body: JSON.stringify({ name }) }),
    deleteCollection: (id: string) => request<void>(`/collections/${id}`, { method: 'DELETE' }),
    collectionBookmarks: (id: string) =>
      request<Paginated<Bookmark>>(`/collections/${id}/bookmarks${qs({ limit: 100 })}`),

    listBookmarks: (
      params: { collectionId?: string; uncategorised?: boolean; q?: string; limit?: number } = {},
    ) => request<Paginated<Bookmark>>(`/bookmarks${qs({ limit: 100, ...params })}`),
    createBookmark: (input: {
      url: string;
      title: string;
      notes?: string | null;
      collectionId?: string | null;
    }) => request<Bookmark>('/bookmarks', { method: 'POST', body: JSON.stringify(input) }),
    deleteBookmark: (id: string) => request<void>(`/bookmarks/${id}`, { method: 'DELETE' }),

    all: () => request<AllView>('/all'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
