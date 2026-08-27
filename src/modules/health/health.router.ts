import { Router } from 'express'
import { getHealth, getReadiness } from './health.controller.ts'

export const healthRouter: Router = Router()

healthRouter.get('/health', getHealth)
healthRouter.get('/ready', getReadiness)
