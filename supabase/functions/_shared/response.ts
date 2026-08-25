import { corsHeaders } from './cors.ts';

/** Create a JSON success response */
export function success<T>(data: T, status = 200, meta?: { page: number; total: number; limit: number }) {
  const body: Record<string, unknown> = { success: true, data };
  if (meta) body.meta = meta;

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Create a JSON error response */
export function error(code: string, message: string, status = 400, details?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code, message, ...(details && { details }) },
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}
