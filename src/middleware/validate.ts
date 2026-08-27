import type { RequestHandler, Response } from 'express'
import type { ZodType } from 'zod'

export interface ValidationSchemas {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

type Source = keyof ValidationSchemas

/** The output type of a schema, without depending on zod's export shape. */
type Infer<T extends ZodType> = T extends ZodType<infer Output> ? Output : never

const LOCALS_KEY = 'validated'

/**
 * Parses request input against zod schemas before the handler runs. A failure
 * throws a `ZodError`, which the error handler turns into a 400 carrying the
 * individual issues.
 *
 * Results are stashed on `res.locals` rather than written back onto the
 * request: Express 5 defines `req.query` as a getter with no setter, so
 * assigning to it throws. Read them back with `validated()`.
 */
export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req, res, next) => {
    try {
      const parsed: Partial<Record<Source, unknown>> = {}
      // Params and query first: a malformed route is worth reporting before
      // the body is even considered.
      if (schemas.params) parsed.params = schemas.params.parse(req.params)
      if (schemas.query) parsed.query = schemas.query.parse(req.query)
      if (schemas.body) parsed.body = schemas.body.parse(req.body)

      res.locals[LOCALS_KEY] = parsed
      next()
    } catch (err) {
      next(err)
    }
  }

/**
 * Reads what `validate()` stored, typed from the same schema object.
 *
 * ```ts
 * const { page } = validated(res, listQuery, 'query')
 * ```
 */
export const validated = <T extends ZodType>(
  res: Response,
  _schema: T,
  source: Source = 'body',
): Infer<T> => {
  const store = res.locals[LOCALS_KEY] as Partial<Record<Source, unknown>> | undefined
  if (!store || !(source in store)) {
    throw new Error(`No validated ${source} on this request — is validate() mounted on the route?`)
  }
  return store[source] as Infer<T>
}
