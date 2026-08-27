import cors from 'cors'
import express, { type Express } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { env, isTest } from './config/env.ts'
import { logger } from './lib/logger.ts'
import { errorHandler } from './middleware/error-handler.ts'
import { notFound } from './middleware/not-found.ts'
import { requestId } from './middleware/request-id.ts'
import { healthRouter } from './modules/health/health.router.ts'

/**
 * Builds the app without binding a port, so tests can mount it directly.
 * Port binding lives in server.ts.
 */
export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  app.use(requestId)
  if (!isTest) app.use(pinoHttp({ logger, genReqId: (req) => req.id }))

  // Ahead of the rate limiter: orchestrator probes should never be throttled.
  app.use(healthRouter)

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      // Deterministic tests: a suite should not fail because it was fast.
      skip: () => isTest,
    }),
  )

  // Feature routers mount here, e.g. app.use('/api/v1/users', usersRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
