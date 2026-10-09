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

/** Payment (actual payment against a settlement) */
export interface Payment extends BaseEntity {
  organization_id: string;
  settlement_id: string;
  worker_id: string;
  amount: number;
  paid_at: string;
  notes: string | null;
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
