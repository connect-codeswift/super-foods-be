import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'

export const APP_ENVS = ['local', 'dev', 'stag', 'prod', 'test'] as const
export type AppEnv = (typeof APP_ENVS)[number]

const isAppEnv = (value: string): value is AppEnv => (APP_ENVS as readonly string[]).includes(value)

// APP_ENV picks the file, so it has to come from the shell or the deploy
// platform — reading it out of a .env file would be circular.
const resolveAppEnv = (): AppEnv => {
  const requested = process.env.APP_ENV
  if (requested !== undefined && requested !== '') {
    if (!isAppEnv(requested)) {
      throw new Error(`APP_ENV must be one of ${APP_ENVS.join(', ')} — got "${requested}"`)
    }
    return requested
  }

  // Unset: fall back to NODE_ENV so a production box never loads .env.local.
  switch (process.env.NODE_ENV) {
    case 'production':
      return 'prod'
    case 'test':
      return 'test'
    default:
      return 'local'
  }
}

export const appEnv: AppEnv = resolveAppEnv()
export const envFile = `.env.${appEnv}`

// Missing file is fine: platform-injected env vars are the normal case in
// deployed environments. dotenv never overrides what is already set.
const envFilePath = resolve(process.cwd(), envFile)
if (existsSync(envFilePath)) {
  config({ path: envFilePath, quiet: true })
}
