# Docker guide

One `Dockerfile` with named stages, one compose file per environment. Nothing is
templated — each compose file is meant to be read and edited directly.

## Compose files

| File                       | Services                     | Notes                                       |
| -------------------------- | ---------------------------- | ------------------------------------------- |
| `docker-compose.local.yml` | `postgres`, `api`            | Hot reload, source bind-mounted             |
| `docker-compose.dev.yml`   | `postgres`, `migrate`, `api` | Built image, no mounts, DB on loopback only |
| `docker-compose.stag.yml`  | `migrate`, `api`             | Managed database, restart `always`          |
| `docker-compose.prod.yml`  | `migrate`, `api`             | Managed database, restart `always`          |

Each sets `APP_ENV` and reads the matching `.env.<APP_ENV>` through `env_file`.
There is no compose template file — copy an existing one if you need a new
environment, and add the matching `.env.<name>` plus an `APP_ENV` value in
`src/config/load-dotenv.ts`.

## Image stages

| Stage       | Purpose                                                          |
| ----------- | ---------------------------------------------------------------- |
| `base`      | `node:24-alpine`, `WORKDIR /app`                                 |
| `deps`      | `npm ci` with dev dependencies                                   |
| `dev`       | Hot reload via `tsx watch`; used by `docker-compose.local.yml`   |
| `build`     | `prisma generate` → `type-check` → esbuild bundle                |
| `migrate`   | `build` plus a default command of `prisma migrate deploy`        |
| `prod-deps` | `npm ci --omit=dev --ignore-scripts`                             |
| `runner`    | Bundle + production `node_modules`, non-root, with a healthcheck |

`build` runs `npm run type-check` before bundling, so a type error fails the
image — esbuild alone would happily bundle broken types.

`prisma generate` needs a parseable `DATABASE_URL` even though it never connects,
so the Dockerfile passes a placeholder via the `BUILD_DATABASE_URL` arg. Real
values only ever arrive at run time.

The runtime image ships `node_modules` alongside `dist/`, because the bundle
leaves dependencies external (`packages: 'external'` in `esbuild.config.mjs`) —
Prisma's runtime and pino's transport workers resolve their own files at run time
and break if inlined.

## Local: the whole stack with hot reload

```bash
npm run docker:up      # build + start postgres and api, logs in the foreground
npm run docker:logs    # follow just the api
npm run docker:sh      # shell inside the api container
npm run docker:down    # stop
npm run docker:reset   # stop and delete the database volume
```

Prefer running the app on the host? `npm run db:up` starts only Postgres, and
`npm run dev` connects to it from outside.

### How the reload works

`tsx watch` uses chokidar, and the compose file sets `CHOKIDAR_USEPOLLING=true`
with `CHOKIDAR_INTERVAL=300`. On Linux bind mounts inotify would be enough, but it
does not cross the VM boundary on macOS or Windows, so polling is set
unconditionally — the cost is one `stat` sweep every 300 ms.

The bind mounts are narrow on purpose (`src`, `prisma`, `package.json`,
`tsconfig.json`, `prisma.config.ts`) and two paths are deliberately masked by
anonymous volumes:

```yaml
- /app/node_modules # platform-specific binaries, built inside the image
- /app/src/generated # Prisma client, generated inside the image
```

Without these the host's copies would shadow the container's, which breaks as
soon as the two platforms differ.

### After changing the schema

The generated client lives in a masked volume, so regenerate it _inside_ the
container:

```bash
docker compose -f docker-compose.local.yml exec api npx prisma migrate dev
```

`tsx watch` picks up the regenerated files and restarts on its own. If the
container's `node_modules` ever goes stale (a dependency added on the host),
rebuild and drop the anonymous volumes with `npm run docker:reset` followed by
`npm run docker:up`.

## dev, stag and prod

```bash
docker compose -f docker-compose.stag.yml up -d --build
docker compose -f docker-compose.stag.yml logs -f api
docker compose -f docker-compose.stag.yml down
```

The `migrate` service runs `prisma migrate deploy` to completion and exits; `api`
waits on `service_completed_successfully`, so schema changes always land before
the code that depends on them. A failed migration stops the API from starting at
all, which is the intended behaviour.

`stag` and `prod` have no `postgres` service — they expect a managed database, and
read `DATABASE_URL` from `.env.stag` / `.env.prod` or from the platform's
environment. Both accept these overrides:

| Variable     | Default  | Effect                   |
| ------------ | -------- | ------------------------ |
| `IMAGE_TAG`  | `latest` | Tag for the built images |
| `API_PORT`   | `3001`   | Published host port      |
| `API_CPUS`   | `1.0`    | CPU limit                |
| `API_MEMORY` | `512M`   | Memory limit             |

```bash
IMAGE_TAG=v1.4.0 API_PORT=8080 docker compose -f docker-compose.prod.yml up -d --build
```

## Configuration precedence

Highest wins:

1. `environment:` in the compose file
2. `env_file:` (`.env.<APP_ENV>`)
3. `.env.<APP_ENV>` read from disk by `src/config/load-dotenv.ts`
4. Defaults in the zod schema in `src/config/env.ts`

`.env*` files are in `.dockerignore` and never baked into an image — configuration
reaches a container only through compose or the platform. This is also why
`docker-compose.local.yml` overrides `DATABASE_URL` in `environment:`: inside the
compose network the database answers to `postgres`, not `localhost`.

## The runtime image

Runs as the non-root `node` user and declares a healthcheck that calls `/health`
through Node's global `fetch`, so the image needs no `curl` or `wget`.

`/health` is liveness and never touches the database. `/ready` is readiness and
issues a real `SELECT 1` — point orchestrator readiness probes at `/ready` and
liveness probes at `/health`. `server.ts` handles `SIGTERM` by draining in-flight
requests, closing the Prisma pool, then exiting, with `stop_grace_period: 30s`
against the 10 s internal timeout.

## Troubleshooting

**`short-name "postgres:17-alpine" did not resolve`** — Podman, which refuses
unqualified image names. Every image here is already fully qualified
(`docker.io/library/…`); keep it that way when adding services.

**Port 5433 already in use** — another Postgres is running. `npm run docker:down`
in the other project, or change the published port.

**Edits on the host do not reload** — confirm the file is under a bind-mounted
path, then check `docker compose -f docker-compose.local.yml logs api` for a
restart line. `src/generated/` is masked and will not propagate by design.

**`Cannot resolve environment variable: DATABASE_URL`** — a Prisma CLI command ran
with no env file and no `DATABASE_URL` set. Inside a container, run it through
`docker compose exec api` so the service environment applies.

**`npm error command sh -c husky` during build** — the `prepare` hook running
without dev dependencies. Already handled (`husky || true` plus
`--ignore-scripts`); if you see it, that fix has been reverted.
