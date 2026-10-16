/** Worker roles in the system (hierarchy: admin > supervisor > crew_lead > worker) */
export enum WorkerRole {
  ADMIN = 'admin',
  SUPERVISOR = 'supervisor',
  CREW_LEAD = 'crew_lead',
  WORKER = 'worker',
}

/** Organization subscription status */
export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
}

/** Entity activation status */
export enum EntityStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/** Rate lifecycle status */
export enum RateStatus {
  CURRENT = 'current',
  HISTORICAL = 'historical',
}

/** Settlement payment status */
export enum SettlementStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
}

/** Settlement payee: individual worker or a crew (paid to its crew_lead) */
export enum SettlementPayeeType {
  WORKER = 'worker',
  CREW = 'crew',
}

/** Unit of measure for products */
export enum UnitMeasure {
  BOX = 'box',
  KG = 'kg',
}

/** Dispatch guide aggregation level. */
export enum DispatchScope {
  /** One block/paño on a day. */
  BLOCK = 'block',
  /** Whole-field daily close. */
  FIELD = 'field',
}

/** Dispatch guide lifecycle. */
export enum DispatchGuideStatus {
  OPEN = 'open',     // editable
  CLOSED = 'closed', // inmutable salvo reapertura
}

/** Where the guide's weight comes from. */
export enum DispatchWeightSource {
  SCALE = 'scale',         // todo net_weight_kg (balanza)
  ESTIMATED = 'estimated', // todo aproximado
  MIXED = 'mixed',         // parte balanza, parte estimado
}

/** Unit in which a box type expresses its weight tolerance */
export enum ToleranceUnit {
  /** Tolerance is a percentage of the target net weight. */
  PERCENT = 'percent',
  /** Tolerance is an absolute value in kilograms. */
  KG = 'kg',
}

/** Base entity with common fields */
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

/** Organization (tenant/client of the SaaS) */
export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  logo_url: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan: string | null;
  crew_mode_enabled: boolean;
  /** Default for using rows (melgas) across the tenant. Each field can override it. */
  rows_enabled: boolean;
  role_labels: Partial<Record<WorkerRole, string>>;
  status: EntityStatus;
}

/** Platform admin (SaaS owner/support, outside any tenant) */
export interface PlatformAdmin extends BaseEntity {
  auth_user_id: string;
  full_name: string;
  status: EntityStatus;
}

/** Product (type of fruit/crop) */
export interface Product extends BaseEntity {
  organization_id: string;
  name: string;
  unit_measure: UnitMeasure;
  status: EntityStatus;
}

/**
 * Product variety (variedad within a product's hierarchy).
 * A product can have N varieties; each variety can carry its own rate. A
 * block/row references a single variety (never mixing products/varieties).
 */
export interface ProductVariety extends BaseEntity {
  organization_id: string;
  product_id: string;
  name: string;
  status: EntityStatus;
}

/** Field (farm/fundo) */
export interface Field extends BaseEntity {
  organization_id: string;
  name: string;
  location: string | null;
  total_area: number;
  /** Crew mode override for this field. null = inherit organization default. */
  crew_mode_enabled: boolean | null;
  /** Rows (melgas) usage override for this field. null = inherit organization default. */
  rows_enabled: boolean | null;
  status: EntityStatus;
}

/** Crew (cuadrilla managed by a crew_lead) */
export interface Crew extends BaseEntity {
  organization_id: string;
  crew_lead_id: string;
  /** Supervisor in charge of this crew's lead. null until assigned. */
  supervisor_id: string | null;
  name: string;
  status: EntityStatus;
}

/**
 * Day roster entry: one worker assigned to one lead (crew_lead or supervisor)
 * for a single work day. The daily team is built manually each shift; a worker
 * has exactly one lead per day (enforced by a unique constraint on
 * organization_id + work_day + worker_id).
 */
export interface DayRoster {
  id: string;
  organization_id: string;
  /** Work day (tenant timezone) this roster entry belongs to. */
  work_day: string;
  /** Worker in the team for the day. */
  worker_id: string;
  /** Lead responsible for the day: a crew_lead or a supervisor. */
  lead_id: string;
  /** Crew associated when the lead is a crew_lead. null when the worker reports directly to a supervisor. */
  crew_id: string | null;
  /** Worker (lead/supervisor) who added this worker to the roster. */
  added_by: string;
  created_at: string;
}

/** Block (paño/cuartel within a field) */
export interface Block extends BaseEntity {
  organization_id: string;
  field_id: string;
  product_id: string;
  /** Variety of the block's product. null when the product has no varieties configured. */
  variety_id: string | null;
  name: string;
  area: number;
  status: EntityStatus;
}

/**
 * Field row (melga) - finest subdivision within a block.
 * The harvest row/lane a worker picks along. Optional level (rows_enabled).
 * Inherits product and rate from its parent block.
 */
export interface FieldRow extends BaseEntity {
  organization_id: string;
  block_id: string;
  name: string;
  /** Row number for ordering/locating in the field. null if not used. */
  row_number: number | null;
  status: EntityStatus;
}

/** Rate (price per unit for a product) */
export interface Rate extends BaseEntity {
  organization_id: string;
  product_id: string;
  /** Variety this rate applies to. null = applies to the product with no variety breakdown. */
  variety_id: string | null;
  amount: number;
  effective_from: string;
  status: RateStatus;
}

/**
 * Box type (envase) with tare and weight tolerance.
 * Configured per organization. Enables tare deduction and overfill/underfill
 * alerts when weighing harvested boxes. Does NOT change payment (still by
 * `quantity`); weight is quality/waste control plus audit trail.
 */
export interface BoxType extends BaseEntity {
  organization_id: string;
  name: string;
  /** Container's own weight (kg), subtracted from gross to get net. */
  tare_weight_kg: number;
  /** Target net fruit weight per box (kg). */
  target_net_weight_kg: number;
  /** Upper tolerance before flagging overfill. In % or kg per tolerance_unit. */
  tolerance_over: number;
  /** Lower tolerance before flagging an underfilled box. In % or kg per tolerance_unit. */
  tolerance_under: number;
  tolerance_unit: ToleranceUnit;
  status: EntityStatus;
}

/** Worker (picker, supervisor, crew_lead, or admin) */
export interface Worker extends BaseEntity {
  organization_id: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  role: WorkerRole;
  qr_badge_url: string | null;
  /** Crew the worker belongs to (crew mode). null if not applicable. */
  crew_id: string | null;
  status: EntityStatus;
  auth_user_id: string | null;
  /** True if the user must change their password on next login (account created by super-admin). */
  must_change_password: boolean;
  /** Permission profile restricting this worker's capabilities within its role. null = full role capabilities. */
  permission_profile_id: string | null;
}

/** Picking record (a single harvest entry) */
export interface PickingRecord extends BaseEntity {
  organization_id: string;
  worker_id: string;
  block_id: string;
  /** Row (melga) the harvest came from. null when the tenant/field does not use rows. */
  row_id: string | null;
  quantity: number;
  rate_amount_snapshot: number;
  /** Unit the payment is settled in, frozen at recording time. 'box' pays by quantity; 'kg' pays by paid_quantity_kg. */
  payment_unit: UnitMeasure;
  /** Payable kilograms when payment_unit = 'kg'. null when paid by box. Immutable snapshot. */
  paid_quantity_kg: number | null;
  recorded_at: string;
  work_day: string;
  recorded_by: string;
  /** Day roster under which this entry was recorded. Freezes the worker-lead attribution for the day. null if recorded without a roster. */
  day_roster_id: string | null;
  original_record_id: string | null;
  /** Box type used (tare control). null when the tenant/product does not use it. */
  box_type_id: string | null;
  /** Gross weight measured on the scale (kg), tare included. Immutable audit snapshot. null when not weighed. */
  gross_weight_kg: number | null;
  /** Tare applied at recording time (kg), frozen from the box type. null when not weighed. */
  tare_snapshot_kg: number | null;
  /** Net weight = gross - tare (kg). Immutable audit snapshot. Does not change payment. null when not weighed. */
  net_weight_kg: number | null;
  /** True if the net weight fell outside the box type tolerance band at recording time. Non-blocking waste alert. */
  out_of_tolerance: boolean;
}

/** Settlement (payment calculation for a period) */
export interface Settlement extends BaseEntity {
  organization_id: string;
  /** Whether this settlement is for an individual worker or a crew. */
  payee_type: SettlementPayeeType;
  /** Set when payee_type = 'worker'; null for crew settlements. */
  worker_id: string | null;
  /** Set when payee_type = 'crew' (level 1: client -> crew_lead); null otherwise. */
  crew_id: string | null;
  period_start: string;
  period_end: string;
  total_amount: number;
  status: SettlementStatus;
  generated_at: string;
}

/** One line of a settlement breakdown (per block/row/variety grouping). */
export interface SettlementBreakdownLine {
  work_day: string;
  block_name: string;
  row_name: string | null;
  product_name: string;
  variety_name: string | null;
  payment_unit: UnitMeasure;
  /** Payable base (boxes when 'box', kilograms when 'kg'). */
  base: number;
  rate: number;
  subtotal: number;
}

/** Payment (actual payment against a settlement) */
export interface Payment extends BaseEntity {
  organization_id: string;
  settlement_id: string;
  worker_id: string;
  amount: number;
  paid_at: string;
  notes: string | null;
}

/**
 * Payment photo evidence (immutable backup image attached to a payment).
 * Child 1:N table of payments; stores the storage object path (never a URL) in
 * the private bucket `payment-evidence`. Does NOT alter payments.amount nor any
 * settlement. Max 3 per payment (enforced in DB).
 */
export interface PaymentPhotoEvidence {
  id: string;
  organization_id: string;
  payment_id: string;
  image_path: string;
  uploaded_by: string;
  created_at: string;
}

/** Supervisor assignment (worker or block assigned to supervisor) */
export interface SupervisorAssignment extends BaseEntity {
  organization_id: string;
  supervisor_id: string;
  worker_id: string | null;
  block_id: string | null;
  assigned_at: string;
}

/** Standard API success response */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page: number;
    total: number;
    limit: number;
  };
}

/** Standard API error response */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Union type for API responses */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Tolerance parameters of a box type, used to evaluate a weighed net weight. */
export interface BoxTolerance {
  target_net_weight_kg: number;
  tolerance_over: number;
  tolerance_under: number;
  tolerance_unit: ToleranceUnit;
}

/** Result of evaluating a net weight against a box type's tolerance band. */
export interface ToleranceEvaluation {
  /** Net weight = gross - tare (kg), never negative. */
  net_weight_kg: number;
  /** Lower bound of the acceptable band (kg). */
  min_net_kg: number;
  /** Upper bound of the acceptable band (kg). */
  max_net_kg: number;
  /** true if net is above the upper bound (overfill -> waste risk). */
  over: boolean;
  /** true if net is below the lower bound (underfilled box). */
  under: boolean;
  /** true if net falls outside the band (over or under). */
  out_of_tolerance: boolean;
}

/**
 * Compute net weight and evaluate it against a box type's tolerance band.
 * Single source of truth shared by the backend and the mobile app so the
 * alert and the persisted `out_of_tolerance` flag always agree.
 *
 * net = max(gross - tare, 0). Tolerances are interpreted per `tolerance_unit`:
 * `percent` is a fraction of the target net weight; `kg` is an absolute value.
 */
export function evaluateBoxTolerance(
  grossWeightKg: number,
  tareWeightKg: number,
  box: BoxTolerance,
): ToleranceEvaluation {
  const net = Math.max(Math.round((grossWeightKg - tareWeightKg) * 1000) / 1000, 0);

  const overMargin =
    box.tolerance_unit === ToleranceUnit.PERCENT
      ? (box.target_net_weight_kg * box.tolerance_over) / 100
      : box.tolerance_over;
  const underMargin =
    box.tolerance_unit === ToleranceUnit.PERCENT
      ? (box.target_net_weight_kg * box.tolerance_under) / 100
      : box.tolerance_under;

  const maxNet = box.target_net_weight_kg + overMargin;
  const minNet = Math.max(box.target_net_weight_kg - underMargin, 0);

  const over = net > maxNet;
  const under = net < minNet;

  return {
    net_weight_kg: net,
    min_net_kg: Math.round(minNet * 1000) / 1000,
    max_net_kg: Math.round(maxNet * 1000) / 1000,
    over,
    under,
    out_of_tolerance: over || under,
  };
}

/** Minimal picking shape needed to compute payment. */
export interface PickingPaymentInput {
  payment_unit: UnitMeasure;
  quantity: number;
  paid_quantity_kg: number | null;
  rate_amount_snapshot: number;
}

/**
 * Payable base for a picking record: kilograms when paid by kg, otherwise the
 * box quantity. Single source of truth shared by the backend and clients so the
 * displayed and settled amounts always agree.
 */
export function pickingPayableBase(record: PickingPaymentInput): number {
  return record.payment_unit === UnitMeasure.KG
    ? Number(record.paid_quantity_kg ?? 0)
    : Number(record.quantity);
}

/**
 * Payable subtotal for a picking record = base * rate, rounded to 2 decimals.
 */
export function pickingSubtotal(record: PickingPaymentInput): number {
  return Math.round(pickingPayableBase(record) * Number(record.rate_amount_snapshot) * 100) / 100;
}

/**
 * Resolve a feature flag's effective value: a per-tenant override (true/false)
 * wins over the global value; otherwise fall back to the global value, defaulting
 * to false when it is unset.
 */
export function resolveFeatureFlag(
  globalEnabled?: boolean | null,
  orgOverride?: boolean | null,
): boolean {
  if (orgOverride === true || orgOverride === false) return orgOverride;
  return globalEnabled ?? false;
}

// ============================================================
// RBAC configurable (KAN-5): capacidades y perfiles de permisos
// ============================================================

/**
 * Catálogo de capacidades (permissions) del sistema. Cada capacidad es una
 * acción de gestión que un perfil puede habilitar o restringir DENTRO de lo que
 * el rol ya permite (un perfil nunca amplía lo que el rol no autoriza).
 */
export const CAPABILITIES = {
  WORKERS_MANAGE: 'workers.manage',
  FIELDS_MANAGE: 'fields.manage',
  PRODUCTS_MANAGE: 'products.manage',
  RATES_MANAGE: 'rates.manage',
  BOX_TYPES_MANAGE: 'box_types.manage',
  CREWS_MANAGE: 'crews.manage',
  SUPERVISORS_MANAGE: 'supervisors.manage',
  SETTLEMENTS_MANAGE: 'settlements.manage',
  PAYMENTS_MANAGE: 'payments.manage',
  METRICS_VIEW: 'metrics.view',
  REPORTS_EXPORT: 'reports.export',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

/** A capability key (value of CAPABILITIES). */
export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

/** All capabilities as an array (useful for UI catalogs and defaults). */
export const ALL_CAPABILITIES: Capability[] = Object.values(CAPABILITIES);

/** Human-readable labels for capabilities (Spanish, business UI). */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  [CAPABILITIES.WORKERS_MANAGE]: 'Gestionar trabajadores',
  [CAPABILITIES.FIELDS_MANAGE]: 'Gestionar campos y paños',
  [CAPABILITIES.PRODUCTS_MANAGE]: 'Gestionar productos',
  [CAPABILITIES.RATES_MANAGE]: 'Gestionar tarifas',
  [CAPABILITIES.BOX_TYPES_MANAGE]: 'Gestionar tipos de caja',
  [CAPABILITIES.CREWS_MANAGE]: 'Gestionar cuadrillas',
  [CAPABILITIES.SUPERVISORS_MANAGE]: 'Gestionar supervisores',
  [CAPABILITIES.SETTLEMENTS_MANAGE]: 'Gestionar liquidaciones',
  [CAPABILITIES.PAYMENTS_MANAGE]: 'Gestionar pagos',
  [CAPABILITIES.METRICS_VIEW]: 'Ver métricas',
  [CAPABILITIES.REPORTS_EXPORT]: 'Exportar informes',
  [CAPABILITIES.SETTINGS_MANAGE]: 'Gestionar configuración',
};

/**
 * Permission profile: a named set of capabilities per organization that
 * RESTRICTS a worker within its role. Assigning it to a worker limits them to
 * the listed capabilities (never grants beyond what the role allows).
 */
export interface PermissionProfile extends BaseEntity {
  organization_id: string;
  name: string;
  /** Capabilities enabled by this profile. */
  capabilities: Capability[];
  status: EntityStatus;
}

/**
 * Resolve whether a worker has a capability.
 *
 * `profileCapabilities === null` means the worker has NO restricting profile, so
 * they keep the full set of capabilities their role allows → returns true.
 * When a profile is present, the capability must be explicitly listed.
 *
 * This does NOT encode role permissions themselves (RLS and role gating still
 * apply); it only answers "did the profile restrict this away?".
 */
export function hasCapability(
  profileCapabilities: Capability[] | null | undefined,
  capability: Capability,
): boolean {
  if (profileCapabilities === null || profileCapabilities === undefined) return true;
  return profileCapabilities.includes(capability);
}

// ============================================================
// Dispatch guides (F-04): guía de despacho (logística campo -> cliente)
// ============================================================

export interface DispatchGuide extends BaseEntity {
  organization_id: string;
  scope: DispatchScope;
  field_id: string;
  block_id: string | null;      // null en scope 'field'
  work_day: string;
  status: DispatchGuideStatus;
  guide_number: string;
  total_trays: number;          // bandejas despachadas
  total_weight_kg: number;      // peso despachado
  weight_precise: boolean;      // true = balanza
  weight_source: DispatchWeightSource;
  carrier: string | null;
  notes: string | null;
  closed_at: string | null;
  created_by: string;
}

export interface DispatchReceipt extends BaseEntity {
  organization_id: string;
  guide_id: string;
  received_trays: number;
  received_weight_kg: number;
  received_at: string;
  notes: string | null;
  recorded_by: string;
}

/** Despacho vs recepción (merma/diferencia en tránsito). */
export interface DispatchComparison {
  dispatched_trays: number;
  dispatched_weight_kg: number;
  received_trays: number;        // SUMA de dispatch_receipts (hoy 1 fila)
  received_weight_kg: number;
  /** dispatched - received (positivo = merma; negativo = sobrante). */
  trays_diff: number;
  weight_diff_kg: number;
  /** Porcentaje de merma de peso respecto a lo despachado (0 si despachado=0). */
  weight_shrinkage_pct: number;
  has_receipt: boolean;          // false si aún no hay recepción
}

/** Línea sugerida al armar la guía (agregado de picking_records del grupo). */
export interface DispatchSuggestion {
  scope: DispatchScope;
  field_id: string;
  block_id: string | null;
  work_day: string;
  total_trays: number;
  total_weight_kg: number;
  weight_precise: boolean;
  weight_source: DispatchWeightSource;
  record_count: number;
}

/** Fila mínima de picking para agregar el contenido logístico de la guía. */
export interface DispatchWeightInput {
  quantity: number;                 // bandejas
  net_weight_kg: number | null;     // peso neto de balanza (destare), si existe
  box_type_target_net_kg: number | null; // target del box_type para estimar, si existe
}

/**
 * Agrega peso de un conjunto de picking_records para una guía de despacho.
 * - net_weight_kg presente -> peso preciso (balanza).
 * - net_weight_kg ausente  -> estimado = quantity * box_type_target_net_kg (0 si no hay target).
 * Devuelve el total de bandejas, el total de peso y la procedencia del peso.
 */
export function aggregateDispatchWeight(records: DispatchWeightInput[]): {
  total_trays: number;
  total_weight_kg: number;
  weight_precise: boolean;
  weight_source: DispatchWeightSource;
} {
  let trays = 0;
  let weight = 0;
  let anyScale = false;
  let anyEstimated = false;
  for (const r of records) {
    trays += Number(r.quantity);
    if (r.net_weight_kg != null) {
      weight += Number(r.net_weight_kg);
      anyScale = true;
    } else {
      weight += Number(r.quantity) * Number(r.box_type_target_net_kg ?? 0);
      anyEstimated = true;
    }
  }
  const source: DispatchWeightSource =
    anyScale && anyEstimated ? DispatchWeightSource.MIXED
    : anyScale ? DispatchWeightSource.SCALE
    : DispatchWeightSource.ESTIMATED;
  return {
    total_trays: Math.round(trays * 100) / 100,
    total_weight_kg: Math.round(weight * 1000) / 1000,
    weight_precise: source === DispatchWeightSource.SCALE,
    weight_source: source,
  };
}

/** Compara despachado vs recibido. received = suma de recepciones (0 si no hay). */
export function compareDispatch(
  dispatchedTrays: number,
  dispatchedWeightKg: number,
  receivedTrays: number | null,
  receivedWeightKg: number | null,
): DispatchComparison {
  const rt = Number(receivedTrays ?? 0);
  const rw = Number(receivedWeightKg ?? 0);
  const traysDiff = Math.round((dispatchedTrays - rt) * 100) / 100;
  const weightDiff = Math.round((dispatchedWeightKg - rw) * 1000) / 1000;
  const pct = dispatchedWeightKg > 0
    ? Math.round((weightDiff / dispatchedWeightKg) * 10000) / 100
    : 0;
  return {
    dispatched_trays: dispatchedTrays,
    dispatched_weight_kg: dispatchedWeightKg,
    received_trays: rt,
    received_weight_kg: rw,
    trays_diff: traysDiff,
    weight_diff_kg: weightDiff,
    weight_shrinkage_pct: pct,
    has_receipt: receivedTrays != null || receivedWeightKg != null,
  };
}
