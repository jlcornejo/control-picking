'use client';

export function KpiCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="h-3 w-16 bg-muted rounded-full" />
          <div className="h-7 w-24 bg-muted rounded-lg" />
          <div className="h-3 w-14 bg-muted rounded-full" />
        </div>
        <div className="h-10 w-10 bg-muted rounded-xl" />
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
      <div className="h-4 w-40 bg-muted rounded-full mb-2" />
      <div className="h-3 w-56 bg-muted rounded-full mb-6" />
      <div className="flex items-end gap-2 h-[200px] pt-8">
        {[40, 65, 45, 80, 55, 70, 90].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-muted rounded-t-md"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
      {/* Header */}
      <div className="flex gap-4 px-5 py-3 border-b border-border bg-muted/30">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-muted rounded-full" style={{ width: `${60 + i * 15}px` }} />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-5 py-4">
            {Array.from({ length: cols }).map((_, col) => (
              <div
                key={col}
                className="h-3 bg-muted rounded-full"
                style={{ width: `${50 + col * 12}px` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RankingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden animate-pulse">
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className="h-7 w-7 bg-muted rounded-full" />
            <div className="flex-1 h-3 bg-muted rounded-full max-w-[120px]" />
            <div className="hidden sm:block w-32 h-2 bg-muted rounded-full" />
            <div className="h-4 w-8 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="mb-8 animate-pulse">
      <div className="h-7 w-40 bg-muted rounded-lg" />
      <div className="h-3 w-64 bg-muted rounded-full mt-2" />
    </div>
  );
}
