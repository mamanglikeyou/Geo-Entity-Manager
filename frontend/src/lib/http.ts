import { z } from 'zod'

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

export interface FieldError {
  field: string
  message: string
}

/**
 * Every failed API call is turned into an ApiError, so UI code only has to
 * handle one error shape. `status` is 0 when the server could not be reached.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: FieldError[]

  constructor(status: number, code: string, message: string, details: FieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  }),
})

type QueryValue = string | number | undefined

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, QueryValue>
  body?: unknown
  signal?: AbortSignal
}

export function apiRequest<T>(
  path: string,
  options: RequestOptions & { schema: z.ZodType<T> },
): Promise<T>
export function apiRequest(path: string, options?: RequestOptions): Promise<void>
export async function apiRequest<T>(
  path: string,
  { method = 'GET', query, body, signal, schema }: RequestOptions & { schema?: z.ZodType<T> } = {},
): Promise<T | undefined> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    // Cancellation is not a failure; let callers (e.g. TanStack Query) see it.
    if (signal?.aborted) throw err
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.')
  }

  if (!response.ok) {
    throw await toApiError(response)
  }
  if (!schema) {
    return undefined
  }

  const parsed = schema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'The server sent an unexpected response.',
    )
  }
  return parsed.data
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value))
    }
  }
  const qs = params.toString()
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`
}

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = errorEnvelopeSchema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) {
    // Not our API's envelope: typically a proxy or gateway in front of it.
    const message =
      response.status >= 500
        ? 'The server is not available right now. Please try again.'
        : `Request failed (${response.status}).`
    return new ApiError(response.status, 'UNKNOWN_ERROR', message)
  }
  const { code, message, details } = parsed.data.error
  return new ApiError(response.status, code, message, details)
}
