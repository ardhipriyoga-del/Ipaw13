---
name: Vite proxy for Replit dev mode
description: emc-admission needs a Vite server.proxy to forward /api/* to the Express API server in dev mode on Replit.
---

# Vite proxy required for /api/* in Replit dev

## Rule
`artifacts/emc-admission/vite.config.ts` must include a `server.proxy` block forwarding `/api` to `http://localhost:8080` (the API server port).

## Why
The frontend calls relative `/api/cloud/*`, `/api/trakcare/*`, `/api/ai/*` URLs. Without a Vite proxy, these requests hit the Vite dev server itself and return 404 — they never reach the Express API server. The symptom is the app stuck on "Memuat aplikasi..." forever, because `syncUsersFromCloud()` in AuthContext.tsx is awaited before `isInitialized` is set, and the fetch never completes.

## How to apply
In `vite.config.ts` inside the `server:` block:
```ts
proxy: {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
},
```
This only applies in `vite dev` (not production builds), so it does not affect the Netlify build.

## Normal load time
The startup cloud sync (`syncUsersFromCloud`) calls GAS via the proxy. GAS takes ~4 seconds to respond. The login page appears after that delay — this is by design in the original app.
