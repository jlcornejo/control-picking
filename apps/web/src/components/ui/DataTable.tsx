'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Column<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: string[];
  pageSize?: number;
  actions?: (row: T) => React.ReactNode;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'Sin resultados',
  searchable = true,
  searchPlaceholder = 'Buscar...',
  searchKeys,
  pageSize = 20,
  actions,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    const keys = searchKeys || columns.map((c) => String(c.key));
    return data.filter((row) =>
      keys.some((k) => {
        const val = row[k as keyof T];
        if (val == null) return false;
        return String(val).toLowerCase().includes(term);
      }),
    );
  }, [data, search, searchKeys, columns]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey as keyof T];
      const bVal = b[sortKey as keyof T];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const pagedData = sortedData.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page when search changes
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(0);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const allColumns = actions
    ? [...columns, { key: '__actions__', label: 'Acciones', sortable: false }]
    : columns;

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm animate-pulse">
        {searchable && (
          <div className="flex items-center justify-between gap-4 p-4 border-b border-border">
            <div className="h-10 w-64 bg-muted rounded-xl" />
            <div className="h-3 w-20 bg-muted rounded-full" />
          </div>
        )}
        {/* Header row */}
        <div className="flex gap-4 px-5 py-3 border-b border-border bg-muted/20">
          {columns.map((_, ci) => (
            <div key={ci} className="h-3 bg-muted rounded-full" style={{ width: `${50 + ci * 18}px` }} />
          ))}
        </div>
        {/* Data rows with staggered animation delay */}
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4" style={{ opacity: 1 - i * 0.1 }}>
              {columns.map((_, ci) => (
                <div key={ci} className="h-4 bg-muted rounded" style={{ width: `${40 + ((ci + i) % 4) * 20}px` }} />
              ))}
              {actions && <div className="h-4 w-16 bg-muted rounded ml-auto" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
    >
      {/* Search */}
      {searchable && (
        <div className="flex items-center justify-between gap-4 p-4 border-b border-border">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-64 rounded-xl border border-border bg-muted/30 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {sortedData.length} resultado{sortedData.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Table */}
      {sortedData.length === 0 ? (
        <div className="p-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M16 16h6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>
          </div>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {allColumns.map((col) => (
                    <th
                      key={String(col.key)}
                      onClick={() => col.sortable !== false && col.key !== '__actions__' ? handleSort(String(col.key)) : undefined}
                      className={`px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider ${
                        col.sortable !== false && col.key !== '__actions__' ? 'cursor-pointer hover:text-foreground select-none' : ''
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey === String(col.key) && (
                          <span className="text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedData.map((row, i) => (
                  <tr key={i} className="hover:bg-accent/30 transition-colors">
                    {columns.map((col) => (
                      <td key={String(col.key)} className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap">
                        {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '—')}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-5 py-3.5 text-sm whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {actions(row)}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
