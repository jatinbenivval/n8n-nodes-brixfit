import type {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  INode,
  IHttpRequestMethods,
} from 'n8n-workflow'
import { NodeOperationError, sleep } from 'n8n-workflow'
import { createHash } from 'crypto'

export const REQUEST_TIMEOUT_MS = 30_000
export const API_PATH = '/api/public/v1'
const MAX_PAGES = 1000

// When Brixfit answers 429, wait for the time it asks and try again, up to this
// many times. Longer waits are left to the workflow's own retry settings.
const MAX_RATE_LIMIT_RETRIES = 2
const MAX_RATE_LIMIT_WAIT_SECONDS = 30

type Ctx = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions

// Validate and sanitize the baseUrl credential before use.
// Blocks SSRF attacks — prevents pointing the node at cloud metadata services,
// internal network hosts, or non-HTTP protocols.
export function validateBaseUrl(raw: string, node: INode): string {
  const url = String(raw ?? '').trim().replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new NodeOperationError(node, `Invalid Base URL: "${url}" is not a valid URL. Check your credential settings.`)
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new NodeOperationError(node, `Invalid Base URL: protocol must be http or https, got "${parsed.protocol}"`)
  }
  const h = parsed.hostname.toLowerCase()
  const blockedHosts = new Set(['localhost', '::1', '[::1]'])
  const isLoopback  = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  const isZeroNet   = /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  const isLinkLocal = /^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)
  const is10Net     = /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  const is192168    = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)
  const is172       = /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)
  if (blockedHosts.has(h) || isLoopback || isZeroNet || isLinkLocal || is10Net || is192168 || is172) {
    throw new NodeOperationError(node, 'Invalid Base URL: private/internal network addresses are not allowed.')
  }
  return url
}

// Validate resource ID parameters before interpolating into URLs.
// Blocks path traversal, query injection, and empty-string bugs.
export function validateId(raw: string, label: string, node: INode, itemIndex: number): string {
  const id = String(raw ?? '').trim()
  if (!id) throw new NodeOperationError(node, `${label} cannot be empty`, { itemIndex })
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new NodeOperationError(
      node,
      `${label} contains invalid characters. Expected a plain ID (letters, numbers, hyphens, underscores).`,
      { itemIndex },
    )
  }
  return id
}

// Drop empty filter values so they never reach the query string.
export function compact(obj: IDataObject): IDataObject {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ) as IDataObject
}

interface ApiErrorBody {
  error?: string
  code?: string
  details?: unknown
  missing_fields?: string[]
  required_scopes?: string[]
  retry_after_seconds?: number
}

// Pull the Brixfit `{ error, code, details, … }` body out of whatever the HTTP layer threw.
function readApiError(err: unknown): { status?: number; body: ApiErrorBody; raw: string } {
  const e = err as {
    httpCode?: string | number
    statusCode?: number
    response?: { status?: number; statusCode?: number; body?: unknown }
    error?: unknown
    message?: string
  }
  const status = Number(e?.response?.statusCode ?? e?.response?.status ?? e?.statusCode ?? e?.httpCode) || undefined
  let body: unknown = e?.response?.body ?? e?.error
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { /* keep as text */ }
  }
  const parsed = body && typeof body === 'object' ? (body as ApiErrorBody) : {}
  return { status, body: parsed, raw: e?.message ?? String(err) }
}

// Turn any API/HTTP failure into one readable n8n error: what failed, which fields, how to fix it.
export function toNodeError(err: unknown, node: INode, itemIndex?: number): NodeOperationError {
  if (err instanceof NodeOperationError) return err
  const { status, body, raw } = readApiError(err)
  const opts = itemIndex === undefined ? undefined : { itemIndex }

  const lines: string[] = Array.isArray(body.details)
    ? (body.details as unknown[]).map(String)
    : body.details && typeof body.details === 'object'
      ? [JSON.stringify(body.details)]
      : []

  let message = body.error ? `Brixfit: ${body.error}` : `Brixfit request failed: ${raw}`
  if (lines.length) message += ` ${lines.join(' ')}`

  const newKeyHint = 'Create a new key in Brixfit → Developer → API Keys and update the Brixfit API credential.'

  let description: string | undefined
  if (body.code === 'key_expired') {
    description = `This API key has reached its expiry date. ${newKeyHint}`
  } else if (body.code === 'key_retired') {
    description = `This is an older key without permissions, and Brixfit has retired those. ${newKeyHint}`
  } else if (status === 401) {
    description = `The API key was rejected. ${newKeyHint}`
  } else if (body.code === 'insufficient_scope') {
    const needed = body.required_scopes?.length ? ` It needs: ${body.required_scopes.join(' or ')}.` : ''
    description = `The API key is not allowed to do this.${needed} Create a key with that permission in Brixfit → Developer → API Keys.`
  } else if (body.code === 'plan_required') {
    description = 'API access is not part of the current Brixfit plan. Upgrade the plan in Brixfit to use this node.'
  } else if (body.code === 'account_inactive') {
    description = 'The Brixfit account behind this key is suspended. Contact Brixfit support.'
  } else if (body.code === 'idempotency_in_progress') {
    description = 'The same request is still being processed by Brixfit. Retry in a few seconds.'
  } else if (status === 404) {
    description = 'Nothing was found for that ID (or it belongs to a different Brixfit account).'
  } else if (status === 422 && body.missing_fields?.length) {
    description = `Required but missing: ${body.missing_fields.join(', ')}. Required fields follow your live Brixfit lead form — Forms → Lead form.`
  } else if (status === 429) {
    description = 'Rate limit reached. Wait a moment and retry, or slow the workflow down.'
  }
  return new NodeOperationError(node, message, { ...opts, description })
}

// Single place every HTTP call goes through: auth via the credential, validated base URL, timeout, JSON.
export async function brixfitRequest(
  ctx: Ctx,
  method: IHttpRequestMethods,
  path: string,
  options: { qs?: IDataObject; body?: IDataObject; idempotencyKey?: string } = {},
): Promise<IDataObject> {
  const credentials = await ctx.getCredentials('brixfitApi')
  const baseUrl = validateBaseUrl(credentials.baseUrl as string, ctx.getNode())
  const send = () =>
    ctx.helpers.requestWithAuthentication.call(ctx, 'brixfitApi', {
      method,
      url: `${baseUrl}${API_PATH}${path}`,
      qs: options.qs,
      body: options.body,
      headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
      json: true,
      timeout: REQUEST_TIMEOUT_MS,
    })

  let response: unknown
  for (let attempt = 0; ; attempt++) {
    try {
      response = await send()
      break
    } catch (err) {
      const { status, body } = readApiError(err)
      const wait = Number(body.retry_after_seconds) || 5
      if (status !== 429 || attempt >= MAX_RATE_LIMIT_RETRIES || wait > MAX_RATE_LIMIT_WAIT_SECONDS) throw err
      await sleep(wait * 1000)
    }
  }
  if (typeof response === 'string') {
    try {
      return JSON.parse(response) as IDataObject
    } catch {
      throw new NodeOperationError(
        ctx.getNode(),
        `Brixfit returned a non-JSON response. Check the Base URL in your credential. First 200 chars: ${response.slice(0, 200)}`,
      )
    }
  }
  return response as IDataObject
}

/**
 * A stable Idempotency-Key for one item of one execution. If n8n retries the
 * node, Brixfit sees the same key and returns the first result instead of
 * creating a duplicate. The body is part of the key, so a loop that sends
 * different data through the same node gets a different key each time.
 */
export function idempotencyKeyFor(ctx: IExecuteFunctions | IHookFunctions, scope: string, body: IDataObject): string | undefined {
  const executionId = 'getExecutionId' in ctx ? ctx.getExecutionId() : undefined
  if (!executionId) return undefined
  return createHash('sha256')
    .update([executionId, ctx.getNode().id, scope, JSON.stringify(body)].join('\n'))
    .digest('hex')
}

// Follow `meta.total_pages` until every row is collected.
export async function brixfitGetAll(ctx: Ctx, path: string, qs: IDataObject = {}): Promise<IDataObject[]> {
  const rows: IDataObject[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await brixfitRequest(ctx, 'GET', path, { qs: { ...qs, page, per_page: 100 } })
    const data = (res.data ?? []) as IDataObject[]
    if (Array.isArray(data)) rows.push(...data)
    const totalPages = (res.meta as { total_pages?: number } | null)?.total_pages ?? 1
    if (page >= totalPages) break
  }
  return rows
}
