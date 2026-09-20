# @gc/api

Hono on Cloudflare Workers. Talks to D1, imports `@gc/scoring` for every
points calculation -- this file should never contain scoring logic of its own.

## Local dev

`npm run dev` runs the real Workers runtime locally (Miniflare) against a
local D1 file. No Cloudflare account needed for this loop; nothing here talks
to the network. `npm run deploy` ships the identical code to a real URL in
seconds -- there is no separate "production build."

## Why Hono

Small, runs natively on Workers with no adapter layer, and its routing/types
read closely enough to Express that the shape stays legible without dragging
in Express's Node-specific assumptions that Workers doesn't have (no `http`
module, no filesystem, no long-lived process).
