import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // MUST be 3000. The tenant has http://localhost:3000/callback registered as the only
    // allowed callback URL, and Auth0 rejects any redirect_uri that is not an exact match
    // (verified in Phase 0: an unregistered redirect_uri renders Auth0's error page).
    // strictPort so a port collision fails loudly instead of silently breaking login.
    port: 3000,
    strictPort: true,
  },
});
