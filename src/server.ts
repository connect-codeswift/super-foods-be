import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { logger } from './lib/logger.ts'
import { prisma } from './lib/prisma.ts'

const SHUTDOWN_TIMEOUT_MS = 10_000

const app = createApp()

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(`listening on http://${env.HOST}:${env.PORT} [${env.APP_ENV}/${env.NODE_ENV}]`)
})

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, 'shutting down')

  // Stop accepting connections, drain in-flight requests, then close the pool.
  server.close(() => {
    void prisma.$disconnect().then(
      () => process.exit(0),
      (err: unknown) => {
        logger.error({ err }, 'failed to disconnect prisma')
        process.exit(1)
      },
    )
  })

  setTimeout(() => {
    logger.error(`did not shut down within ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`)
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled rejection')
  process.exit(1)
})

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception')
  process.exit(1)
})
