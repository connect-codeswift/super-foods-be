import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { errorHandler } from './error-handler.ts'
import { validate, validated } from './validate.ts'

const bodySchema = z.object({ email: z.string().email(), age: z.coerce.number().int().min(0) })
const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1) })

const buildApp = () => {
  const app = express()
  app.use(express.json())

  app.post('/users', validate({ body: bodySchema }), (_req, res) => {
    res.json(validated(res, bodySchema))
  })

  app.get('/users', validate({ query: querySchema }), (_req, res) => {
    res.json(validated(res, querySchema, 'query'))
  })

  app.use(errorHandler)
  return app
}

describe('validate()', () => {
  it('passes a valid body through, coerced', async () => {
    const res = await request(buildApp()).post('/users').send({ email: 'a@b.com', age: '42' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ email: 'a@b.com', age: 42 })
  })

  it('rejects an invalid body with a 400 and the failing fields', async () => {
    const res = await request(buildApp()).post('/users').send({ email: 'nope', age: -1 })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Validation failed')
    const details = res.body.error.details as { path: string[] }[]
    expect(details.map((issue) => issue.path[0]).sort()).toEqual(['age', 'email'])
  })

  it('applies query defaults', async () => {
    const res = await request(buildApp()).get('/users')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ page: 1 })
  })

  it('rejects an invalid query', async () => {
    const res = await request(buildApp()).get('/users?page=0')

    expect(res.status).toBe(400)
    expect(res.body.error.details[0].path).toEqual(['page'])
  })
})
