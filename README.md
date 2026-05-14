# ATM10 Refined Storage Web Dashboard

Web dashboard for the existing CC:Tweaked `info.lua` Refined Storage monitor. The local Minecraft monitor keeps working; the ComputerCraft computer optionally connects outbound to the web server over `wss://.../cc/ws`.

## Quick Start

1. Copy `.env.example` to `.env` and replace every `replace_with...` value.
2. Start the local stack:

```powershell
docker compose up -d --build
```

3. Open `http://localhost:8080`.
4. Log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`.
5. In `info.lua`, set:

```lua
CONFIG.web.enabled = true
CONFIG.web.url = "wss://your-domain.example/cc/ws"
CONFIG.web.deviceId = "atm10-main"
CONFIG.web.token = "the DEVICE_TOKEN from .env"
```

For local LAN testing without HTTPS, use `ws://<server-ip>:8080/cc/ws`.

## VPS HTTPS

Point your domain to the VPS, set `DOMAIN` and `CORS_ORIGIN=https://your-domain` in `.env`, then run:

```powershell
docker compose --profile https up -d --build
```

Caddy terminates HTTPS and proxies to the web container. The web container proxies `/api/*` and `/cc/*` to the API container, including WebSocket upgrades.

## Runtime Model

- Server config wins on reconnect.
- Lua saves received runtime config into `atm10_dashboard_config.json`.
- Browser commands are queued in Postgres and sent to the online ComputerCraft device.
- Raw snapshots are retained for 24 hours; metric points and alerts are retained for 30 days.

## Important Files

- `info.lua`: existing CC:Tweaked monitor plus optional WebSocket sync.
- `api/src/server.ts`: Fastify API, auth, browser events, and `/cc/ws` device socket.
- `api/prisma/schema.prisma`: Postgres schema.
- `web/src/main.tsx`: React dashboard.
- `docker-compose.yml`: Postgres, API, web, optional Caddy.
