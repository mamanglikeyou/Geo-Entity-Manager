import { ENTITY_STATUS_LABELS, type EntityStatus } from '../model'

const statusClasses: Record<EntityStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  maintenance: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  offline: 'bg-red-50 text-red-700 ring-red-600/20',
}

export function StatusBadge({ status }: { status: EntityStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusClasses[status]}`}
    >
      {ENTITY_STATUS_LABELS[status]}
    </span>
  )
}
