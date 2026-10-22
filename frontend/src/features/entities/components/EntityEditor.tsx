import { toFormValues } from '../form'
import type { GeoPoint } from '../model'
import { useCreateEntity, useEntity, useUpdateEntity } from '../queries'
import { EntityForm, type EntityFormProps } from './EntityForm'

type SharedProps = Pick<
  EntityFormProps,
  'pickedLocation' | 'onLocationChange' | 'onSaved' | 'onCancel'
>

export function CreateEntityForm({
  initialLocation,
  ...props
}: SharedProps & { initialLocation: GeoPoint | null }) {
  const { mutateAsync } = useCreateEntity()

  return (
    <EntityForm
      title="New entity"
      submitLabel="Create entity"
      initialValues={toFormValues(undefined, initialLocation)}
      onSubmit={mutateAsync}
      {...props}
    />
  )
}

export function EditEntityForm({ entityId, ...props }: SharedProps & { entityId: string }) {
  const { data: entity, isPending, isError, error } = useEntity(entityId)
  const { mutateAsync } = useUpdateEntity()

  if (isPending) {
    return <p className="p-4 text-sm text-slate-500">Loading…</p>
  }
  if (isError) {
    return (
      <p role="alert" className="p-4 text-sm text-red-700">
        {error.message}
      </p>
    )
  }

  return (
    <EntityForm
      title={`Edit ${entity.name}`}
      submitLabel="Save changes"
      initialValues={toFormValues(entity)}
      onSubmit={(input) => mutateAsync({ id: entityId, input })}
      {...props}
    />
  )
}
