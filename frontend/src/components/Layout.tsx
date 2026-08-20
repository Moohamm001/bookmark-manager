import { useAuth0 } from '@auth0/auth0-react';
import LogoutIcon from '@mui/icons-material/Logout';
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { Link, Outlet, useLocation } from 'react-router';
import { authConfig } from '../auth/auth-config';

const TABS = [
  { label: 'Collections', to: '/collections' },
  { label: 'Bookmarks', to: '/bookmarks' },
  { label: 'All', to: '/all' },
];

export function Layout() {
  const { user, logout } = useAuth0();
  const location = useLocation();

  const active = TABS.findIndex((t) => location.pathname.startsWith(t.to));

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Bookmarks
          </Typography>

          <Tabs value={active === -1 ? false : active} sx={{ flexGrow: 1 }}>
            {TABS.map((t) => (
              <Tab key={t.to} label={t.label} component={Link} to={t.to} />
            ))}
          </Tabs>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Tooltip title="Everything here is visible only to you">
              <Typography variant="body2" color="text.secondary">
                {user?.email ?? user?.sub}
              </Typography>
            </Tooltip>
            <Button
              size="small"
              startIcon={<LogoutIcon />}
              onClick={() =>
                logout({ logoutParams: { returnTo: new URL(authConfig.redirectUri).origin } })
              }
            >
              Sign out
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
