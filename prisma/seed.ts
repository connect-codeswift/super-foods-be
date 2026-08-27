import { prisma } from '../src/lib/prisma.ts'

/**
 * Idempotent: `upsert` means running this twice is the same as running it
 * once, so it is safe against a database that already has data.
 */
const seed = async (): Promise<void> => {
  const user = await prisma.user.upsert({
    where: { email: 'dev@example.com' },
    update: {},
    create: { email: 'dev@example.com', name: 'Dev User' },
  })

  console.warn(`seeded user ${user.email}`)
}

try {
  await seed()
} catch (err) {
  console.error('seed failed:', err)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
