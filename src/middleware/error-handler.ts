import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { isProduction } from '../config/env.ts'
import { HttpError } from '../lib/http-error.ts'
import { logger } from '../lib/logger.ts'

interface ErrorBody {
  error: {
    message: string
    details?: unknown
    /** Quote this when reporting a failure — it matches the server's logs. */
    requestId?: string
  }
}

const describe = (err: unknown): { status: number; message: string; details?: unknown } => {
  if (err instanceof HttpError) {
    return { status: err.status, message: err.message, details: err.details }
  }
  if (err instanceof ZodError) {
    return { status: 400, message: 'Validation failed', details: err.issues }
  }
  return { status: 500, message: err instanceof Error ? err.message : 'Internal Server Error' }
}

// Express identifies error handlers by arity, so all four parameters must stay.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { status, message, details } = describe(err)

  const requestId = typeof req.id === 'string' ? req.id : undefined

  const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger)
  log({ err, method: req.method, url: req.originalUrl, status, requestId }, 'request failed')

  const body: ErrorBody = {
    error: {
      // Never leak internal failure detail to clients in production. The
      // request id is what ties an opaque 500 back to the real cause.
      message: status >= 500 && isProduction ? 'Internal Server Error' : message,
    },
  }
  if (details !== undefined) body.error.details = details
  if (requestId !== undefined) body.error.requestId = requestId

  res.status(status).json(body)
}
