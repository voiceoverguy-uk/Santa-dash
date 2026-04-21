# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### santa-dash-3d (web)
3D browser endless runner remake of the user's iOS game "Santa Dash". React Three Fiber, sprite-billboarded characters/obstacles on procedurally-generated 3D rooftop platforms.

- **Location**: `artifacts/santa-dash-3d/`
- **Stack**: React + Vite, three@0.184, @react-three/fiber@9, @react-three/drei
- **Game architecture**: 
  - `src/game/world.ts` — pure simulation (no React), mutated each frame via refs
  - `src/game/Game.tsx` — Canvas + input + per-frame loop driver
  - `src/game/store.ts` — minimal pub/sub store for HUD-only state (status, score, lives, distance)
  - `src/game/audio.ts` — randomized rotation across 6 sound pools (Ready/jump/chim/trip/ice/end), iOS unlock on first gesture
  - `src/game/{Santa,WorldRender,Background,Snow,CameraRig,HUD}.tsx` — render layers
- **Assets** (in `public/`): 82 santa sprite frames (run/fall/hit/hitIce, "with bag" set), 4 obstacles (chimney/snowman/ice/presents), 7 rooftop textures, 2 backgrounds, 46 audio mp3s
- **Controls**: Space / ↑ / W / tap to jump
- **High score**: localStorage `santaDash:hi`
- **No backend** — purely client-side
