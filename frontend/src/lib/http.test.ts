import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { fetchCall, jsonResponse, mockFetch } from '@/test/utils'

import { ApiError, apiRequest } from './http'

const schema = z.object({ id: z.string() })

describe('apiRequest', () => {
  it('returns the parsed body on success', async () => {
    mockFetch(jsonResponse({ id: 'a', extra: true }))

    await expect(apiRequest('/things/a', { schema })).resolves.toEqual({ id: 'a' })
  })

  it('serialises the body and builds the query string, skipping empty values', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 'a' }, 201))

    await apiRequest('/things', {
      method: 'POST',
      query: { q: 'truck', page: 2, empty: '', missing: undefined },
      body: { name: 'x' },
      schema,
    })

    const { url, init } = fetchCall(fetchMock)
    expect(url).toBe('/things?q=truck&page=2')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"x"}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('resolves to undefined for 204 responses', async () => {
    mockFetch(new Response(null, { status: 204 }))

    await expect(apiRequest('/things/a', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('turns the error envelope into an ApiError with field details', async () => {
    mockFetch(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'validation failed',
            details: [{ field: 'name', message: 'is required' }],
          },
        },
        422,
      ),
    )

    const error = await apiRequest('/things', { method: 'POST', body: {}, schema }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      details: [{ field: 'name', message: 'is required' }],
      isClientError: true,
    })
  })

  it('handles error responses that are not JSON', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 502 }))

    await expect(apiRequest('/things', { schema })).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
      isClientError: false,
    })
  })

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    )

    await expect(apiRequest('/things', { schema })).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    })
  })

  it('rethrows aborts instead of reporting them as network errors', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(abortError))

    await expect(apiRequest('/things', { schema, signal: controller.signal })).rejects.toBe(
      abortError,
    )
  })

  it('rejects a response that does not match the schema', async () => {
    mockFetch(jsonResponse({ id: 42 }))

    await expect(apiRequest('/things/a', { schema })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
