import type { RequestHandler } from 'express'
import { HttpError } from '../lib/http-error.ts'

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`))
}
