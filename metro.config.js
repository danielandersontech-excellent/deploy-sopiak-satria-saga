/**
 * METRO CONFIG - with API Proxy
 * 
 * MASALAH: HP bisa konek ke Metro (port 8081) tapi TIDAK bisa ke Backend (port 3000)
 *          karena Windows Firewall memblokir port 3000 dari device luar.
 * 
 * SOLUSI:  Proxy semua request /api/* dan /ping melalui Metro (port 8081)
 *          ke backend di localhost:3000 (internal, tidak kena firewall).
 * 
 * FLOW:    HP → Metro:8081/api/auth/login → proxy → localhost:3000/api/auth/login → Backend
 */
const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');

const config = getDefaultConfig(__dirname);

const BACKEND_PORT = 3000;

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => {
    return (req, res, next) => {
      // Proxy /api/* and /ping requests to backend
      if (req.url.startsWith('/api/') || req.url.startsWith('/ping') || req.url.startsWith('/uploads/')) {
        
        const proxyOpts = {
          hostname: '127.0.0.1',
          port: BACKEND_PORT,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${BACKEND_PORT}`,
          },
        };

        const proxyReq = http.request(proxyOpts, (proxyRes) => {
          // Copy status and headers from backend response
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
          console.log(`[Proxy] ❌ Backend error: ${err.message}. Pastikan backend berjalan di port ${BACKEND_PORT}`);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: `Backend tidak berjalan. Jalankan: cd backend && npm run dev`,
            detail: err.message,
          }));
        });

        // Forward request body to backend
        req.pipe(proxyReq, { end: true });
        return;
      }

      // Everything else goes to Metro bundler as normal
      return metroMiddleware(req, res, next);
    };
  },
};

module.exports = config;