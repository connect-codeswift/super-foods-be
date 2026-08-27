import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../app.ts'

const app = createApp()

describe('GET /health', () => {
  it('reports the process as live', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok' })
    expect(typeof res.body.uptime).toBe('number')
  })
})

describe('unknown routes', () => {
  it('returns a 404 error envelope', async () => {
    const res = await request(app).get('/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body.error.message).toContain('Route not found')
  })
})
