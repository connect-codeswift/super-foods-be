import { z } from 'zod'
// Side effect: reads .env.<APP_ENV> into process.env before it is parsed below.
import { appEnv, envFile } from './load-dotenv.ts'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'required — see .env.example'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated list of allowed origins, or `*` for any. */
  CORS_ORIGIN: z.string().min(1).default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
})

const parsed = envSchema
  .superRefine((value, ctx) => {
    // A wildcard origin in production is almost always an oversight, and a
    // silent one. Fail the boot instead.
    if (value.NODE_ENV === 'production' && value.CORS_ORIGIN === '*') {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'must list explicit origins in production, not "*"',
      })
    }
  })
  .safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid environment (APP_ENV=${appEnv}, file ${envFile}):\n${details}`)
}

export const env = { ...parsed.data, APP_ENV: appEnv }

export { appEnv, envFile }
export type { AppEnv } from './load-dotenv.ts'

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'
export const isTest = env.NODE_ENV === 'test'
