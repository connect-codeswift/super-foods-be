// Loads .env.<APP_ENV> exactly the way the app does, so CLI commands and the
// running server always agree on which database they are pointed at.
import './src/config/load-dotenv.ts'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
