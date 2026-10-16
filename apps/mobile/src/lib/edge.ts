// Shared response envelope for Supabase Edge Functions.
// The backend (_shared/response.ts) replies with { success, data } on success
// and { success: false, error: { code, message, details? } } on failure.
// When consuming via supabase.functions.invoke<Envelope<T>>(...), the returned
// `data` is this envelope; the real payload lives in `data.data` and the
// backend error message (Spanish) in `data.error.message`.
export interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  meta?: { page: number; total: number; limit: number };
}
