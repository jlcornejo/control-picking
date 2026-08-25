'use client';

import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  loading = false,
  variant = 'default',
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground mb-6">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={onClose}
          disabled={loading}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
            variant === 'danger'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-primary hover:bg-primary/90'
          }`}
        >
          {loading ? 'Procesando...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
