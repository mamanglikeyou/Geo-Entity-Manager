import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { CloseIcon, IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'

import {
  entityFormSchema,
  formatCoordinate,
  parseLocation,
  toEntityInput,
  toServerFormErrors,
  type EntityFormOutput,
  type EntityFormValues,
} from '../form'
import {
  ENTITY_STATUSES,
  ENTITY_STATUS_LABELS,
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  LIMITS,
  type Entity,
  type EntityInput,
  type GeoPoint,
} from '../model'

export interface EntityFormProps {
  title: string
  submitLabel: string
  initialValues: EntityFormValues
  /** The latest location picked on the map; a new object for every pick. */
  pickedLocation: GeoPoint | null
  /** Called with the coordinates typed so far, or null while incomplete. */
  onLocationChange: (location: GeoPoint | null) => void
  onSubmit: (input: EntityInput) => Promise<Entity>
  onSaved: (entity: Entity) => void
  onCancel: () => void
}

export function EntityForm({
  title,
  submitLabel,
  initialValues,
  pickedLocation,
  onLocationChange,
  onSubmit,
  onSaved,
  onCancel,
}: EntityFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<EntityFormValues, unknown, EntityFormOutput>({
    resolver: zodResolver(entityFormSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  })
  const attributes = useFieldArray({ control, name: 'attributes' })

  // Map -> form: a click or pin drag on the map fills in the coordinates.
  useEffect(() => {
    if (!pickedLocation) return
    const options = { shouldDirty: true, shouldValidate: true }
    setValue('latitude', formatCoordinate(pickedLocation.latitude), options)
    setValue('longitude', formatCoordinate(pickedLocation.longitude), options)
  }, [pickedLocation, setValue])

  // Form -> map: keep the draft pin where the typed coordinates point.
  const [latitude, longitude] = useWatch({ control, name: ['latitude', 'longitude'] })
  useEffect(() => {
    onLocationChange(parseLocation(latitude, longitude))
  }, [latitude, longitude, onLocationChange])

  const submit = handleSubmit(async (values) => {
    try {
      onSaved(await onSubmit(toEntityInput(values)))
    } catch (error) {
      // Client validation mirrors the server, so this is mostly for rules
      // that changed server-side or for network and server failures.
      const serverErrors = toServerFormErrors(error, getValues('attributes'))
      for (const { path, message } of serverErrors.fields) {
        setError(path, { type: 'server', message })
      }
      if (serverErrors.form) {
        setError('root.server', { type: 'server', message: serverErrors.form })
      }
    }
  })

  const attributesError = errors.attributes?.message ?? errors.attributes?.root?.message

  return (
    <form
      noValidate
      onSubmit={(e) => void submit(e)}
      aria-labelledby="entity-form-title"
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
        <h2 id="entity-form-title" className="text-base font-semibold break-words">
          {title}
        </h2>
        <IconButton aria-label="Cancel" onClick={onCancel} className="-mt-1 -mr-2">
          <CloseIcon />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {errors.root?.server && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {errors.root.server.message}
          </p>
        )}

        <Field id="entity-name" label="Name" error={errors.name?.message}>
          {(field) => <Input {...field} autoComplete="off" {...register('name')} />}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field id="entity-type" label="Type" error={errors.type?.message}>
            {(field) => (
              <Select {...field} {...register('type')}>
                <option value="" disabled>
                  Choose…
                </option>
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ENTITY_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="entity-status" label="Status" error={errors.status?.message}>
            {(field) => (
              <Select {...field} {...register('status')}>
                {ENTITY_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ENTITY_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field
          id="entity-description"
          label="Description"
          error={errors.description?.message}
          hint="Optional"
        >
          {(field) => <Textarea {...field} {...register('description')} />}
        </Field>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Location</legend>
          <p className="text-xs text-slate-500">
            Click the map or drag the blue pin to set the location.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Field id="entity-latitude" label="Latitude" error={errors.latitude?.message}>
              {(field) => <Input {...field} inputMode="decimal" {...register('latitude')} />}
            </Field>
            <Field id="entity-longitude" label="Longitude" error={errors.longitude?.message}>
              {(field) => <Input {...field} inputMode="decimal" {...register('longitude')} />}
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Attributes</legend>
          <p className="text-xs text-slate-500">
            Extra details such as a plate number or firmware version.
          </p>
          {attributes.fields.map((row, i) => {
            const rowErrors = errors.attributes?.[i]
            return (
              <div key={row.id} className="space-y-1">
                <div className="flex items-start gap-2">
                  <Input
                    aria-label={`Attribute ${i + 1} key`}
                    aria-invalid={Boolean(rowErrors?.key)}
                    placeholder="key"
                    className="font-mono"
                    {...register(`attributes.${i}.key`)}
                  />
                  <Input
                    aria-label={`Attribute ${i + 1} value`}
                    aria-invalid={Boolean(rowErrors?.value)}
                    placeholder="value"
                    {...register(`attributes.${i}.value`)}
                  />
                  <IconButton
                    aria-label={`Remove attribute ${i + 1}`}
                    onClick={() => {
                      attributes.remove(i)
                    }}
                  >
                    <CloseIcon />
                  </IconButton>
                </div>
                {(rowErrors?.key ?? rowErrors?.value) && (
                  <p className="text-xs text-red-700">
                    {rowErrors.key?.message ?? rowErrors.value?.message}
                  </p>
                )}
              </div>
            )
          })}
          {attributesError && <p className="text-xs text-red-700">{attributesError}</p>}
          <Button
            variant="secondary"
            disabled={attributes.fields.length >= LIMITS.attributes}
            onClick={() => {
              attributes.append({ key: '', value: '' })
            }}
          >
            Add attribute
          </Button>
        </fieldset>
      </div>

      <footer className="flex justify-end gap-2 border-t border-slate-200 p-4">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </footer>
    </form>
  )
}
