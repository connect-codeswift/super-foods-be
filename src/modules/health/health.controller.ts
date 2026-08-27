import type { RequestHandler } from 'express'
import { prisma } from '../../lib/prisma.ts'

/** Liveness: is the process up? Never touches the database. */
export const getHealth: RequestHandler = (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
}

/** Readiness: can the process actually serve traffic? */
export const getReadiness: RequestHandler = async (_req, res) => {
  // Express 5 forwards rejected promises to the error handler on its own.
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: 'ready', database: 'up' })
}
