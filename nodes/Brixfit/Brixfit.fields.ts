import type { ILoadOptionsFunctions, ResourceMapperField, ResourceMapperFields } from 'n8n-workflow'
import { brixfitRequest, toNodeError } from './Brixfit.utils'

interface ApiLeadField {
  field_key: string
  label: string
  field_type: string
  input_type?: string | null
  is_required?: boolean
  enabled?: boolean
  options?: string[]
  condition?: { dependsOn: string; showWhen: string } | null
  system_key?: string | null
}

const TYPE_MAP: Record<string, ResourceMapperField['type']> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'string',
}

// Built-in lead columns — always offered, never duplicated from the coach's own questions.
const BUILT_IN_KEYS = new Set(['name', 'email', 'phone', 'status'])

const field = (
  id: string,
  displayName: string,
  extra: Partial<ResourceMapperField> = {},
): ResourceMapperField => ({
  id, displayName, required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false, ...extra,
})

// Lead fields for the Create / Update mappers, straight from the coach's live Brixfit lead form.
//
// `required` is deliberately never set on the n8n side: whether a question is required can depend on
// other answers (conditional questions), so Brixfit decides and returns a precise error naming the
// missing fields. Unconditionally required questions are flagged with * in the label instead.
export async function loadLeadFields(
  ctx: ILoadOptionsFunctions,
  includeNameField: boolean,
): Promise<ResourceMapperFields> {
  let apiFields: ApiLeadField[]
  try {
    const res = await brixfitRequest(ctx, 'GET', '/fields/leads')
    apiFields = (res.data ?? []) as unknown as ApiLeadField[]
  } catch (err) {
    throw toNodeError(err, ctx.getNode())
  }

  const fields: ResourceMapperField[] = []
  if (includeNameField) fields.push(field('name', 'Name'))
  fields.push(
    field('email', 'Email', { canBeUsedToMatch: true }),
    field('phone', 'Phone'),
    field('status', 'Status'),
  )

  for (const f of apiFields) {
    if (BUILT_IN_KEYS.has(f.field_key) || f.enabled === false) continue
    const star = f.is_required && !f.condition ? ' *' : ''
    const choices = (f.options ?? []).filter(Boolean)
    // Single-answer questions become a dropdown; multi-choice stays text (comma-separated, like the web form).
    const asDropdown = choices.length > 0 && f.input_type !== 'multiselect'
    fields.push(
      field(f.field_key, `${f.label}${star}`, {
        type: asDropdown ? 'options' : (TYPE_MAP[f.field_type] ?? 'string'),
        ...(asDropdown ? { options: choices.map((c) => ({ name: c, value: c })) } : {}),
      }),
    )
  }

  return { fields }
}
