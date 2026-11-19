# Scanner bridge (Bulk Scanner)

Browsers can't discover or talk to network scanners, so Toolbox › Bulk Scanner uses this tiny local helper.
It finds AirScan/eSCL scanners on your LAN (mDNS `_uscan._tcp`), runs scan jobs and streams the JPEG pages
to the page. It listens on `127.0.0.1:47321` only, stores nothing and has no dependencies (Node 18+).
Scans never leave your PC: PDFs and the ZIP are built in the browser, sessions are kept in IndexedDB.

```
node scanner-bridge/scanner-bridge.mjs        # or double-click start-scanner-bridge.cmd
```

| Env var | Default | |
|---|---|---|
| `SCANNER_BRIDGE_PORT` | `47321` | must match `BRIDGE` in `src/utilities/bulk-scanner/scanner.ts` |
| `SCANNER_BRIDGE_ORIGINS` | `https://toolbox.zacsvae.com` | extra allowed origins (localhost is always allowed) |

API: `GET /health`, `GET /scanners[?host=IP]`, `GET /capabilities?id=`, `POST /scan?id=` `{source, mode, dpi}` → NDJSON pages.
Scanners that don't show up (other subnet, mDNS blocked) can be added by IP in the UI.
