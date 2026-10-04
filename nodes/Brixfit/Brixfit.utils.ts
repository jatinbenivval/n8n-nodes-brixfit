import type {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  INode,
  IHttpRequestMethods,
} from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

export const REQUEST_TIMEOUT_MS = 30_000
export const API_PATH = '/api/public/v1'
const MAX_PAGES = 1000

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
  details?: unknown
  missing_fields?: string[]
}

// Pull the Brixfit `{ error, details, missing_fields }` body out of whatever the HTTP layer threw.
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

  let description: string | undefined
  if (status === 401) {
    description = 'The API key was rejected. Create a new key in Brixfit → Developer → API Keys and update the Brixfit API credential.'
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
  options: { qs?: IDataObject; body?: IDataObject } = {},
): Promise<IDataObject> {
  const credentials = await ctx.getCredentials('brixfitApi')
  const baseUrl = validateBaseUrl(credentials.baseUrl as string, ctx.getNode())
  const response = await ctx.helpers.requestWithAuthentication.call(ctx, 'brixfitApi', {
    method,
    url: `${baseUrl}${API_PATH}${path}`,
    qs: options.qs,
    body: options.body,
    json: true,
    timeout: REQUEST_TIMEOUT_MS,
  })
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
