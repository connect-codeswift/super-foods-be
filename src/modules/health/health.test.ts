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
  it('returns a 404 error envelope carrying the request id', async () => {
    const res = await request(app).get('/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body.error.message).toContain('Route not found')
    expect(res.body.error.requestId).toBe(res.headers['x-request-id'])
  })
})

describe('request ids', () => {
  it('stamps every response with one', async () => {
    const res = await request(app).get('/health')

    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('reuses an inbound id so it follows the request across services', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'trace-from-gateway')

    expect(res.headers['x-request-id']).toBe('trace-from-gateway')
  })
})
