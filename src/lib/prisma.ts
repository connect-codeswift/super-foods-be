import { PrismaPg } from '@prisma/adapter-pg'
import { env, isDevelopment } from '../config/env.ts'
import { PrismaClient } from '../generated/prisma/client.ts'

// Prisma 7 talks to the database through a driver adapter rather than a
// bundled query engine, so the connection string lives here (and in
// prisma.config.ts for the CLI) instead of in schema.prisma.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

export const prisma = new PrismaClient({
  adapter,
  log: isDevelopment ? ['warn', 'error'] : ['error'],
})
