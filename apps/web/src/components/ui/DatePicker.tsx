'use client';

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  maxDate?: string; // YYYY-MM-DD
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function addDays(dateStr: string, offset: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DatePicker({ value, onChange, maxDate }: DatePickerProps) {
  const today = maxDate || localToday();
  const isToday = value === today;
  const canGoForward = value < today;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(addDays(value, -1))}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Día anterior"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="relative">
        <input
          type="date"
          value={value}
          max={today}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Seleccionar fecha"
        />
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground cursor-pointer hover:bg-accent transition-colors">
          <Calendar size={14} className="text-muted-foreground" />
          <span>{formatDisplayDate(value)}</span>
          {isToday && (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              Hoy
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => canGoForward && onChange(addDays(value, 1))}
        disabled={!canGoForward}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-card"
        aria-label="Día siguiente"
      >
        <ChevronRight size={16} />
      </button>

      {!isToday && (
        <button
          type="button"
          onClick={() => onChange(today)}
          className="ml-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          Hoy
        </button>
      )}
    </div>
  );
}
