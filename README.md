# super-foods-be

Express 5 + TypeScript + Prisma 7 backend for Universal Super Foods. Serves the
`super-foods-fe` storefront.

- **[DEV.md](./DEV.md)** — setup, workflow, conventions, adding a feature
- **[DOCKER.md](./DOCKER.md)** — images, compose files, hot reload, deploys

## Stack

| Concern     | Choice                                                            |
| ----------- | ----------------------------------------------------------------- |
| Runtime     | Node 20+, ESM (`"type": "module"`)                                |
| HTTP        | Express 5 (async errors propagate natively), helmet, cors         |
| Database    | PostgreSQL via Prisma 7 + the `@prisma/adapter-pg` driver adapter |
| Build       | esbuild → a single `dist/server.js`, dependencies left external   |
| Type safety | `tsc --noEmit` (esbuild does not type-check), strict mode         |
| Lint/format | ESLint 9 flat config with type-aware rules, Prettier              |
| Tests       | Vitest + supertest                                                |
| Config      | One `.env` file per environment, zod-validated; pino for logs     |

## Quick start

```bash
npm install
npm run db:up          # Postgres on :5433
npm run db:migrate     # apply migrations, regenerate the client
npm run dev            # http://localhost:3001
```

`.env.local` already points at that Postgres. Check it:
`curl localhost:3001/health` and `curl localhost:3001/ready`.

Everything in containers instead, with hot reload: `npm run docker:up`.

## Layout

```
Dockerfile                  multi-stage: dev (hot reload), build, migrate, runner
docker-compose.<env>.yml    one per environment: local, dev, stag, prod
.env.<env>                  per-environment config, all gitignored
prisma/schema.prisma        models; connection URL lives in prisma.config.ts
src/
  server.ts                 port binding, signals, graceful shutdown
  app.ts                    createApp() — middleware + routers, no listen()
  config/load-dotenv.ts     resolves APP_ENV, loads .env.<APP_ENV>
  config/env.ts             zod-validated process.env; throws at boot if invalid
  lib/                      logger, prisma, http-error
  middleware/               not-found, error-handler
  modules/health/           router + controller + test — the shape to copy
  generated/prisma/         generated client (gitignored)
```

## Environments

`APP_ENV` (`local` | `dev` | `stag` | `prod` | `test`) selects `.env.<APP_ENV>`.
It comes from the shell or the deploy platform, and falls back to `NODE_ENV` when
unset — `production` → `prod`, `test` → `test`, else `local`. Details in
[DEV.md](./DEV.md#environments).

## Notes

- **esbuild does not type-check.** `npm run type-check` is the gate; `npm run ci`
  runs type-check → lint → format:check → test.
- **Dependencies stay external** in the bundle. Prisma's runtime and pino's
  transport workers resolve their own files at run time and break if inlined, so
  deploys need `node_modules` (`npm ci --omit=dev`) alongside `dist/`.
- **Prisma 7 needs a driver adapter.** The connection string is read by
  `prisma.config.ts` for CLI commands and by `src/lib/prisma.ts` for the app;
  `schema.prisma` no longer carries a `url`.
- **`prisma.config.ts` shares the app's env loader**, so CLI and server always
  agree on which database they point at.
- Imports are relative and carry explicit `.ts` extensions so tsc, tsx, esbuild
  and vitest resolve them identically.
