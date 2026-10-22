import { z } from 'zod'

import { ApiError } from '@/lib/http'

import {
  ATTRIBUTE_KEY_PATTERN,
  ENTITY_STATUSES,
  ENTITY_TYPES,
  LIMITS,
  type Entity,
  type EntityInput,
  type GeoPoint,
} from './model'

/** Counts characters like Go's utf8.RuneCountInString, not UTF-16 units. */
// eslint-disable-next-line @typescript-eslint/no-misused-spread -- code points are the goal: they match the backend's rune count
const charCount = (s: string) => [...s].length

const coordinate = (label: string, limit: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform(Number)
    .pipe(
      z
        .number({ error: `${label} must be a number` })
        .min(-limit, `${label} must be between -${limit} and ${limit}`)
        .max(limit, `${label} must be between -${limit} and ${limit}`),
    )

const attributeRowSchema = z.object({ key: z.string().trim(), value: z.string().trim() })

/**
 * Attributes are edited as rows (an object cannot hold a half-typed key), and
 * converted to a map on submit. Rows left completely empty are ignored.
 */
const attributesSchema = z.array(attributeRowSchema).superRefine((rows, ctx) => {
  const seen = new Set<string>()
  let filled = 0

  rows.forEach(({ key, value }, i) => {
    if (!key && !value) return
    filled++

    if (!key) {
      ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'Key is required' })
    } else if (charCount(key) > LIMITS.attributeKeyLength) {
      ctx.addIssue({
        code: 'custom',
        path: [i, 'key'],
        message: `At most ${LIMITS.attributeKeyLength} characters`,
      })
    } else if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
      ctx.addIssue({
        code: 'custom',
        path: [i, 'key'],
        message: 'Use only letters, digits, _ and -',
      })
    } else if (seen.has(key)) {
      ctx.addIssue({ code: 'custom', path: [i, 'key'], message: 'Duplicate key' })
    }
    seen.add(key)

    if (charCount(value) > LIMITS.attributeValueLength) {
      ctx.addIssue({
        code: 'custom',
        path: [i, 'value'],
        message: `At most ${LIMITS.attributeValueLength} characters`,
      })
    }
  })

  if (filled > LIMITS.attributes) {
    ctx.addIssue({ code: 'custom', message: `At most ${LIMITS.attributes} attributes` })
  }
})

export const entityFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .refine((s) => charCount(s) <= LIMITS.nameLength, {
      message: `Name must be at most ${LIMITS.nameLength} characters`,
    }),
  // Selects hold '' until something is chosen, so the input type is string.
  type: z.string().pipe(z.enum(ENTITY_TYPES, { error: 'Choose a type' })),
  status: z.string().pipe(z.enum(ENTITY_STATUSES, { error: 'Choose a status' })),
  description: z
    .string()
    .trim()
    .refine((s) => charCount(s) <= LIMITS.descriptionLength, {
      message: `Description must be at most ${LIMITS.descriptionLength} characters`,
    }),
  latitude: coordinate('Latitude', 90),
  longitude: coordinate('Longitude', 180),
  attributes: attributesSchema,
})

/** What the form holds while editing: everything is text. */
export type EntityFormValues = z.input<typeof entityFormSchema>
export type EntityFormOutput = z.output<typeof entityFormSchema>

/** Six decimals (~0.1 m) is what a person can meaningfully pick on a map. */
export const formatCoordinate = (n: number) => String(Math.round(n * 1e6) / 1e6)

export function toFormValues(entity?: Entity, location?: GeoPoint | null): EntityFormValues {
  if (!entity) {
    return {
      name: '',
      type: '',
      status: 'active',
      description: '',
      latitude: location ? formatCoordinate(location.latitude) : '',
      longitude: location ? formatCoordinate(location.longitude) : '',
      attributes: [],
    }
  }
  return {
    name: entity.name,
    type: entity.type,
    status: entity.status,
    description: entity.description,
    latitude: String(entity.latitude),
    longitude: String(entity.longitude),
    attributes: Object.entries(entity.attributes).map(([key, value]) => ({ key, value })),
  }
}

export function toEntityInput(values: EntityFormOutput): EntityInput {
  return {
    name: values.name,
    type: values.type,
    status: values.status,
    description: values.description,
    latitude: values.latitude,
    longitude: values.longitude,
    attributes: Object.fromEntries(
      values.attributes.filter((row) => row.key || row.value).map((row) => [row.key, row.value]),
    ),
  }
}

/** Parses the coordinate fields, or returns null while they are incomplete. */
export function parseLocation(latitude: string, longitude: string): GeoPoint | null {
  const parsed = z
    .object({ latitude: coordinate('Latitude', 90), longitude: coordinate('Longitude', 180) })
    .safeParse({ latitude, longitude })
  return parsed.success ? parsed.data : null
}

type FieldPath = `attributes.${number}.value` | keyof Omit<EntityFormValues, 'attributes'>

export interface ServerFormErrors {
  fields: { path: FieldPath | 'attributes'; message: string }[]
  /** Errors that do not belong to a single field. */
  form?: string
}

const DIRECT_FIELDS = new Set(['name', 'type', 'status', 'description', 'latitude', 'longitude'])

/**
 * Maps an API failure onto form fields. Validation details use the backend's
 * field names; "attributes.<key>" is resolved to the row holding that key.
 */
export function toServerFormErrors(
  error: unknown,
  attributes: EntityFormValues['attributes'],
): ServerFormErrors {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') {
    return { fields: [], form: error instanceof Error ? error.message : 'Something went wrong.' }
  }

  const result: ServerFormErrors = { fields: [] }
  const unmatched: string[] = []

  for (const { field, message } of error.details) {
    const text = message.charAt(0).toUpperCase() + message.slice(1)
    if (DIRECT_FIELDS.has(field)) {
      result.fields.push({ path: field as FieldPath, message: text })
    } else if (field === 'attributes') {
      result.fields.push({ path: 'attributes', message: text })
    } else if (field.startsWith('attributes.')) {
      const key = field.slice('attributes.'.length)
      const row = attributes.findIndex((a) => a.key.trim() === key)
      if (row >= 0) result.fields.push({ path: `attributes.${row}.value`, message: text })
      else unmatched.push(`${field}: ${message}`)
    } else {
      unmatched.push(`${field}: ${message}`)
    }
  }

  if (unmatched.length > 0) result.form = unmatched.join('; ')
  return result
}
