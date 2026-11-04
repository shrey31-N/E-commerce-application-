import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy API calls to the services running locally.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/users': 'http://localhost:3001',
      '/api/products': 'http://localhost:3002',
      '/api/orders': 'http://localhost:3003',
    },
  },
});
