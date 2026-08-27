import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

export const REQUEST_ID_HEADER = 'X-Request-Id'

// Long enough for a UUID or a trace id, short enough that a hostile client
// cannot use the header to bloat every log line.
const MAX_INBOUND_LENGTH = 200

/**
 * Gives every request an id, echoed back on the response and attached to each
 * log line. An inbound `X-Request-Id` from a proxy or gateway is reused so one
 * id follows a request across services; otherwise a fresh UUID is minted.
 *
 * Runs before the logger so `req.id` is set by the time anything logs, and
 * before the routes so an error response can quote it.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.get(REQUEST_ID_HEADER)
  const id =
    inbound && inbound.length > 0 && inbound.length <= MAX_INBOUND_LENGTH ? inbound : randomUUID()

  req.id = id
  res.setHeader(REQUEST_ID_HEADER, id)
  next()
}
