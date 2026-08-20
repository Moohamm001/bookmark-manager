import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiProvider, AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { AllPage } from './pages/AllPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { CollectionDetailPage, CollectionsPage } from './pages/CollectionsPage';

const theme = createTheme({
  palette: { mode: 'light', primary: { main: '#1f4b99' } },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
});

/**
 * BrowserRouter wraps AuthProvider because AuthProvider's onRedirectCallback calls
 * useNavigate — the router has to exist first. Getting this backwards produces a
 * "useNavigate outside a Router" crash that only fires on the callback round-trip, i.e.
 * only after a successful login.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ApiProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/collections" replace />} />
            {/* Auth0 redirects here after login. The SDK consumes the ?code= and then
                onRedirectCallback navigates onward, so this only ever renders briefly. */}
            <Route path="/callback" element={<Navigate to="/collections" replace />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/collections/:id" element={<CollectionDetailPage />} />
              <Route path="/bookmarks" element={<BookmarksPage />} />
              <Route path="/all" element={<AllPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/collections" replace />} />
          </Routes>
        </ApiProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
