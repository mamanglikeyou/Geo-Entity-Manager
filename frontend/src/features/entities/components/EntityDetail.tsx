import type { ReactNode } from 'react'

import { CloseIcon, IconButton } from '@/components/ui/IconButton'
import { formatCoordinates, formatDateTime } from '@/lib/format'
import { ApiError } from '@/lib/http'

import { ENTITY_TYPE_LABELS } from '../model'
import { useEntity } from '../queries'
import { StatusBadge } from './StatusBadge'

interface EntityDetailProps {
  entityId: string
  onClose: () => void
}

export function EntityDetail({ entityId, onClose }: EntityDetailProps) {
  const { data: entity, isPending, isError, error } = useEntity(entityId)

  return (
    <section aria-labelledby="entity-detail-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
        <h2 id="entity-detail-title" className="text-base font-semibold break-words">
          {entity?.name ?? 'Entity details'}
        </h2>
        <IconButton aria-label="Close details" onClick={onClose} className="-mt-1 -mr-2">
          <CloseIcon />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isPending ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : isError ? (
          <p role="alert" className="text-sm text-red-700">
            {error instanceof ApiError && error.status === 404
              ? 'This entity no longer exists.'
              : error.message}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <StatusBadge status={entity.status} />
              <span className="text-sm text-slate-600">{ENTITY_TYPE_LABELS[entity.type]}</span>
            </div>

            {entity.description && (
              <p className="text-sm whitespace-pre-line text-slate-700">{entity.description}</p>
            )}

            <dl className="space-y-3 text-sm">
              <DetailRow label="Coordinates">
                <span className="font-mono text-xs">
                  {formatCoordinates(entity.latitude, entity.longitude)}
                </span>
              </DetailRow>
              <DetailRow label="Created">{formatDateTime(entity.createdAt)}</DetailRow>
              <DetailRow label="Last updated">{formatDateTime(entity.updatedAt)}</DetailRow>
            </dl>

            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
                Attributes
              </h3>
              <AttributeTable attributes={entity.attributes} />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  )
}

function AttributeTable({ attributes }: { attributes: Record<string, string> }) {
  const entries = Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No attributes.</p>
  }

  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-slate-100">
        {entries.map(([key, value]) => (
          <tr key={key}>
            <th scope="row" className="py-1.5 pr-3 text-left font-normal text-slate-500">
              {key}
            </th>
            <td className="py-1.5 break-words text-slate-900">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
