import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/** Settlement payee: an individual worker or a crew (paid to its crew_lead). */
export type SettlementPayeeType = 'worker' | 'crew';

/** Default and maximum page size for settlement lists (NFR4). */
export const SETTLEMENTS_DEFAULT_LIMIT = 20;
export const SETTLEMENTS_MAX_LIMIT = 100;

export interface SettlementListParams {
  /** 1-based page number. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 20, clamped to a maximum of 100. */
  limit?: number;
}

/** A single payment made against a settlement (manual join, like payments.tsx). */
export interface SettlementPayment {
  id: string;
  amount: number;
  paid_at: string;
  notes: string | null;
}

/** A settlement row with the beneficiary name resolved and its payments. */
export interface SettlementListItem {
  id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  status: string;
  payee_type: SettlementPayeeType;
  worker_id: string | null;
  crew_id: string | null;
  generated_at: string;
  payments: SettlementPayment[];
  total_paid: number;
  /** Beneficiary display name (worker full name or "Crew (cuadrilla)"). */
  payee_name: string;
}

/**
 * Lists settlements (admin) paginated, ordered by `generated_at` desc, with the
 * beneficiary name resolved via manual joins (the mobile app does not use
 * PostgREST embeds), mirroring the pattern of `payments.tsx`.
 *
 * Pagination: `limit` defaults to 20 and is clamped to a maximum of 100.
 * `page` is 1-based.
 */
export function useSettlementsList({ page = 1, limit = SETTLEMENTS_DEFAULT_LIMIT }: SettlementListParams = {}) {
  const safeLimit = Math.min(Math.max(1, limit), SETTLEMENTS_MAX_LIMIT);
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;

  return useQuery({
    queryKey: ['settlements', safePage, safeLimit],
    queryFn: async (): Promise<SettlementListItem[]> => {
      const { data, error } = await supabase
        .from('settlements')
        .select('id, period_start, period_end, total_amount, status, payee_type, worker_id, crew_id, generated_at')
        .order('generated_at', { ascending: false })
        .range(from, to);
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        period_start: string;
        period_end: string;
        total_amount: number;
        status: string;
        payee_type: SettlementPayeeType;
        worker_id: string | null;
        crew_id: string | null;
        generated_at: string;
      }>;

      // Resolve beneficiary names with manual joins (worker / crew), batched.
      const workerIds = [...new Set(rows.map((r) => r.worker_id).filter((id): id is string => Boolean(id)))];
      const crewIds = [...new Set(rows.map((r) => r.crew_id).filter((id): id is string => Boolean(id)))];

      const workerMap: Record<string, string> = {};
      const crewMap: Record<string, string> = {};
      if (workerIds.length > 0) {
        const { data: workers } = await supabase.from('workers').select('id, full_name').in('id', workerIds);
        for (const w of workers ?? []) workerMap[w.id as string] = w.full_name as string;
      }
      if (crewIds.length > 0) {
        const { data: crews } = await supabase.from('crews').select('id, name').in('id', crewIds);
        for (const c of crews ?? []) crewMap[c.id as string] = c.name as string;
      }

      const results: SettlementListItem[] = [];
      for (const r of rows) {
        const { data: payments } = await supabase
          .from('payments')
          .select('id, amount, paid_at, notes')
          .eq('settlement_id', r.id)
          .order('paid_at', { ascending: false });
        const paymentRows = (payments ?? []).map((p) => ({
          id: p.id as string,
          amount: Number(p.amount),
          paid_at: p.paid_at as string,
          notes: (p.notes as string | null) ?? null,
        }));
        const totalPaid = paymentRows.reduce((sum, p) => sum + p.amount, 0);
        const payeeName =
          r.payee_type === 'crew'
            ? r.crew_id && crewMap[r.crew_id]
              ? `${crewMap[r.crew_id]} (cuadrilla)`
              : 'Cuadrilla'
            : (r.worker_id && workerMap[r.worker_id]) || '';

        results.push({
          id: r.id,
          period_start: r.period_start,
          period_end: r.period_end,
          total_amount: Number(r.total_amount),
          status: r.status,
          payee_type: r.payee_type,
          worker_id: r.worker_id,
          crew_id: r.crew_id,
          generated_at: r.generated_at,
          payments: paymentRows,
          total_paid: totalPaid,
          payee_name: payeeName,
        });
      }
      return results;
    },
  });
}
