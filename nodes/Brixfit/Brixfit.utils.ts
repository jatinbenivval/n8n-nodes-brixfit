import type { INode } from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

export const REQUEST_TIMEOUT_MS = 30_000

export const WEBHOOK_EVENTS = [
  'lead.created', 'lead.updated', 'lead.status_changed', 'lead.converted',
  'lead.deleted', 'client.created', 'client.updated', 'checkin.submitted',
] as const

export type WebhookEvent = typeof WEBHOOK_EVENTS[number]

// Validate and sanitize the baseUrl credential before use.
// Blocks SSRF attacks — prevents pointing the node at cloud metadata services,
// internal network hosts, or non-HTTP protocols.
export function validateBaseUrl(raw: string, node: INode): string {
  const url = String(raw ?? '').trim().replace(/\/$/, '')
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
    throw new NodeOperationError(node, `Invalid Base URL: private/internal network addresses are not allowed.`)
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
