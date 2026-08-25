/** Worker roles in the system */
export enum WorkerRole {
  ADMIN = 'admin',
  SUPERVISOR = 'supervisor',
  WORKER = 'worker',
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

/** Unit of measure for products */
export enum UnitMeasure {
  BOX = 'box',
  KG = 'kg',
}

/** Base entity with common fields */
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

/** Product (type of fruit/crop) */
export interface Product extends BaseEntity {
  name: string;
  unit_measure: UnitMeasure;
  status: EntityStatus;
}

/** Field (farm/fundo) */
export interface Field extends BaseEntity {
  name: string;
  location: string | null;
  total_area: number;
  status: EntityStatus;
}

/** Block (paño/cuartel within a field) */
export interface Block extends BaseEntity {
  field_id: string;
  product_id: string;
  name: string;
  area: number;
  status: EntityStatus;
}

/** Rate (price per unit for a product) */
export interface Rate extends BaseEntity {
  product_id: string;
  amount: number;
  effective_from: string;
  status: RateStatus;
}

/** Worker (picker, supervisor, or admin) */
export interface Worker extends BaseEntity {
  full_name: string;
  national_id: string | null;
  phone: string | null;
  role: WorkerRole;
  qr_badge_url: string | null;
  status: EntityStatus;
  auth_user_id: string | null;
}

/** Picking record (a single harvest entry) */
export interface PickingRecord extends BaseEntity {
  worker_id: string;
  block_id: string;
  quantity: number;
  rate_amount_snapshot: number;
  recorded_at: string;
  work_day: string;
  recorded_by: string;
  original_record_id: string | null;
}

/** Settlement (payment calculation for a period) */
export interface Settlement extends BaseEntity {
  worker_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  status: SettlementStatus;
  generated_at: string;
}

/** Payment (actual payment against a settlement) */
export interface Payment extends BaseEntity {
  settlement_id: string;
  worker_id: string;
  amount: number;
  paid_at: string;
  notes: string | null;
}

/** Supervisor assignment (worker or block assigned to supervisor) */
export interface SupervisorAssignment extends BaseEntity {
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
