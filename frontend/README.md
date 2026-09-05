# Frontend

React/Vite frontend for the IEEE ITSS Conference Status Dashboard.

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5191
```

npm uses the public registry by default. To use an approved mirror, set
`NPM_CONFIG_REGISTRY` in the current process before running `npm ci`.

The development server proxies `/api` requests to the FastAPI backend on port `8029`.
