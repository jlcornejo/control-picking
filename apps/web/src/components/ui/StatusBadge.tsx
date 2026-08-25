interface StatusBadgeProps {
  status: string;
}

const variants: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  inactive: 'bg-gray-50 text-gray-600 ring-gray-500/10',
  current: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  historical: 'bg-gray-50 text-gray-500 ring-gray-500/10',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  partial: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};

const labels: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  current: 'Vigente',
  historical: 'Histórica',
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = variants[status] || 'bg-gray-50 text-gray-600 ring-gray-500/10';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${variant}`}>
      {labels[status] || status}
    </span>
  );
}
