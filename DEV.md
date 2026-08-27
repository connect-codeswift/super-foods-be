# Developer guide

Express 5 + TypeScript + Prisma 7 API. This file covers working on the code;
[DOCKER.md](./DOCKER.md) covers the containers.

## Prerequisites

- Node 20+ (24 is what CI and the images use)
- Docker or Podman with the compose plugin, for Postgres
- No global installs — everything runs through `npm run`

## First run

```bash
npm install
npm run db:up          # Postgres on :5433
npm run db:migrate     # apply migrations, regenerate the client
npm run dev            # http://localhost:3001
```

`.env.local` is already pointed at that Postgres, so there is nothing to fill in.
Check it worked:

```bash
curl localhost:3001/health   # {"status":"ok",...}
curl localhost:3001/ready    # {"status":"ready","database":"up"}
```

Prefer to develop with the app in a container too? `npm run docker:up` — see
[DOCKER.md](./DOCKER.md).

## Environments

Config is one file per environment, chosen by `APP_ENV`:

| `APP_ENV` | File         | For                                        |
| --------- | ------------ | ------------------------------------------ |
| `local`   | `.env.local` | Your machine, against the compose Postgres |
| `dev`     | `.env.dev`   | Shared development environment             |
| `stag`    | `.env.stag`  | Staging                                    |
| `prod`    | `.env.prod`  | Production                                 |
| `test`    | (none)       | Vitest injects its own env                 |

`APP_ENV` comes from the shell or the deploy platform, never from a `.env` file —
that would be circular. Unset, it falls back to `NODE_ENV`: `production` → `prod`,
`test` → `test`, anything else → `local`. So `npm run dev` needs no flags, and a
production box never quietly loads `.env.local`.

```bash
npm run dev                        # .env.local
APP_ENV=stag npm run db:migrate    # migrate staging
APP_ENV=prod npm start             # built bundle against prod
```

Real process env always beats the file, and a missing file is not an error — that
is what makes platform-injected variables work with no file present. Every
`.env.*` is gitignored except `.env.example`, the template to copy. Env is parsed
and validated once in `src/config/env.ts`; a missing or malformed variable throws
at boot with the offending key named, rather than surfacing as `undefined` later.

## Scripts

| Script                | Does                                               |
| --------------------- | -------------------------------------------------- |
| `npm run dev`         | `tsx watch` — reloads on change, no build step     |
| `npm run build`       | esbuild bundle to `dist/server.js` with sourcemaps |
| `npm start`           | Run the built bundle                               |
| `npm run type-check`  | `tsc --noEmit`                                     |
| `npm run lint`        | ESLint (`lint:fix` to autofix)                     |
| `npm run format`      | Prettier write (`format:check` to verify)          |
| `npm test`            | Vitest once (`test:watch`, `test:coverage`)        |
| `npm run db:up/down`  | Start/stop the local Postgres container            |
| `npm run db:migrate`  | `prisma migrate dev` (`db:deploy` for stag/prod)   |
| `npm run db:generate` | Regenerate the client into `src/generated/prisma`  |
| `npm run db:studio`   | Prisma Studio                                      |
| `npm run docker:*`    | Full stack in containers — see DOCKER.md           |
| `npm run ci`          | type-check → lint → format:check → test            |

## Layout

```
.github/workflows/ci.yml    runs `npm run ci` + a docker build on every PR
prisma/schema.prisma        models; connection URL lives in prisma.config.ts
prisma/seed.ts              idempotent dev data (`npm run db:seed`)
src/
  server.ts                 port binding, signals, graceful shutdown
  app.ts                    createApp() — middleware + routers, no listen()
  config/load-dotenv.ts     resolves APP_ENV, loads .env.<APP_ENV>
  config/env.ts             zod-validated process.env; throws at boot if invalid
  lib/logger.ts             pino (pretty in development)
  lib/prisma.ts             PrismaClient + pg driver adapter
  lib/http-error.ts         HttpError and status helpers
  middleware/               request-id, not-found, error-handler, validate
  modules/health/           router + controller + test — the shape to copy
  generated/prisma/         generated client (gitignored)
```

## Adding a feature

Create `src/modules/<name>/` with three files mirroring `modules/health/`:

- `<name>.router.ts` — an Express `Router`, routes only
- `<name>.controller.ts` — handlers; throw `HttpError` (or the helpers in
  `lib/http-error.ts`) for anything the client should see
- `<name>.test.ts` — supertest against `createApp()`

Then mount it in `createApp()`:

```ts
app.use('/api/v1/<name>', <name>Router)
```

Express 5 forwards rejected promises to the error handler on its own, so `async`
handlers need no `try/catch` and no wrapper — throw and let it propagate.

### Validating input

Never read `req.body` or `req.query` raw. Put a zod schema in front:

```ts
const createUser = z.object({ email: z.email(), name: z.string().min(1) })

router.post('/', validate({ body: createUser }), (_req, res) => {
  const { email, name } = validated(res, createUser)
  ...
})
```

A parse failure throws a `ZodError`, which the error handler turns into a 400
listing the offending fields. `validate()` accepts `body`, `query` and `params`.

Results land on `res.locals`, not on the request: Express 5 defines `req.query`
as a getter with no setter, so parsed values cannot be written back. `validated()`
reads them, typed from the same schema object you passed in.

### Errors, request ids and rate limits

Every response carries an `X-Request-Id`. An inbound one is reused, so an id set
by a gateway follows the request through; otherwise a UUID is minted. Error
responses repeat it in the envelope:

```json
{ "error": { "message": "...", "requestId": "..." } }
```

That id is on every log line for the request, so a user quoting it points
straight at the failure — which matters because production replaces 5xx messages
with a flat `Internal Server Error`.

All routes except `/health` and `/ready` are rate limited per IP
(`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`). Probes are deliberately exempt so an
orchestrator cannot throttle itself. The limiter is skipped entirely under
`NODE_ENV=test` so a fast suite cannot trip it.

## Database changes

```bash
# edit prisma/schema.prisma, then:
npm run db:migrate           # names + applies a migration, regenerates the client
npm run db:seed              # optional: idempotent dev data from prisma/seed.ts
```

Commit the generated folder under `prisma/migrations/` — it is the migration
history. `src/generated/` is gitignored and rebuilt by `db:generate`.

Deployed environments run `prisma migrate deploy` (never `migrate dev`); in
Docker the `migrate` service does this before the API starts.

## Conventions

- **Imports are relative with explicit `.ts` extensions.** One resolution rule
  that tsc, tsx, esbuild and vitest all agree on — no path aliases to keep in
  sync across four tools.
- **esbuild does not type-check.** `npm run type-check` is the gate; `npm run ci`
  runs it first.
- **Env is read once**, in `src/config/env.ts`. Import `env` from there rather
  than touching `process.env` anywhere else.
- **`createApp()` never calls `listen()`** — that lives in `server.ts`, which is
  what lets tests mount the app directly.
- Prettier and ESLint are wired to not fight; a pre-commit hook runs both on
  staged files.

## Before you push

```bash
npm run ci
```

The pre-commit hook (husky + lint-staged) already fixes and formats staged files,
but it does not type-check or run tests. `npm run ci` does all four.

GitHub Actions runs the same `npm run ci` on every PR into `main`, `stag` or
`dev`, plus a second job that builds the production image — that one catches
breakage the first cannot see, like a production dependency tree that fails to
install. Coverage thresholds in `vitest.config.ts` are a ratchet set just under
current coverage; raise them as the suite grows.

## Branches

```
main ← stag ← dev ← <your-name>
```

Work on your own branch, PR into `dev`. `dev` is promoted to `stag`, `stag` to
`main`. Start a new one from `dev`:

```bash
git fetch && git switch -c <your-name> origin/dev
```

## Troubleshooting

**`Invalid environment (APP_ENV=…, file …)`** — the named key is missing or
malformed in that file. Compare against `.env.example`.

**`CORS_ORIGIN: must list explicit origins in production, not "*"`** — a wildcard
origin with `NODE_ENV=production` is refused at boot. Name the real frontend
origins in `.env.stag` / `.env.prod`; both still ship placeholders.

**`APP_ENV must be one of local, dev, stag, prod, test`** — typo in the exported
variable.

**`/ready` returns 500** — Postgres is not reachable. `npm run db:up`, then check
`docker ps`.

**`Can't reach database server at stag-host:5432`** — `.env.stag` and `.env.dev`
ship with placeholder credentials. Fill in real ones.

**Types resolve in the editor but `npm run type-check` fails** — the editor may be
on a different TypeScript. Point it at the workspace version.

**`npm audit` reports `deepmerge-ts`** — reached only through the Prisma CLI, a
devDependency; it is not in the runtime bundle. The only "fix" is downgrading
Prisma, so it is left alone.
