import { CAPABILITIES } from '@fundo360/shared';
import { useFeatureFlag } from './useFeatureFlag';
import { usePermissions } from './usePermissions';

/**
 * Visibilidad del export de informes (G5), paridad con la web.
 *
 * Gating (G5-AC1, AC4):
 *   - `report_export` (flag) + capability `REPORTS_EXPORT` habilitan el CSV.
 *   - El PDF requiere además que el kill-switch `disable_pdf_export` esté
 *     apagado. Es decir, `disable_pdf_export` oculta SOLO el PDF, nunca el CSV
 *     (replica `showPdfExport = report_export && !disable_pdf_export` de la web).
 *
 * El gating es solo de UI; la barrera real sigue siendo RLS/backend (lo que el
 * usuario puede leer no cambia por ocultar un botón).
 */
export function useReportExport() {
  const { enabled: canExport } = useFeatureFlag('report_export');
  const { enabled: pdfDisabled } = useFeatureFlag('disable_pdf_export');
  const { has } = usePermissions();
  const canReports = has(CAPABILITIES.REPORTS_EXPORT);

  return {
    showCsv: canExport && canReports,
    showPdf: canExport && !pdfDisabled && canReports,
  };
}
