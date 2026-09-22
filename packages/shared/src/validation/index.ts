import { z } from 'zod';
import { UnitMeasure, WorkerRole } from '../types/index';

/** Validation: Create a new product */
export const createProductSchema = z.object({
  name: z.string().min(1, 'Nombre del producto es requerido').max(100),
  unit_measure: z.nativeEnum(UnitMeasure),
});

/** Validation: Create a new field */
export const createFieldSchema = z.object({
  name: z.string().min(1, 'Nombre del campo es requerido').max(100),
  location: z.string().max(200).nullable().optional(),
  total_area: z.number().positive('Superficie debe ser mayor a 0'),
});

/** Validation: Create a new block */
export const createBlockSchema = z.object({
  name: z.string().min(1, 'Nombre del paño es requerido').max(100),
  product_id: z.string().uuid(),
  area: z.number().positive('Superficie del paño debe ser mayor a 0'),
});

/** Validation: Create a new field row (melga) */
export const createFieldRowSchema = z.object({
  name: z.string().min(1, 'Nombre de la melga es requerido').max(100),
  block_id: z.string().uuid(),
  row_number: z.number().int().positive('Número de melga debe ser mayor a 0').nullable().optional(),
});

/** Validation: Create a new rate */
export const createRateSchema = z.object({
  amount: z.number().positive('Tarifa debe ser mayor a 0'),
});

/** Validation: Create a new worker */
export const createWorkerSchema = z.object({
  full_name: z.string().min(1, 'Nombre completo es requerido').max(150),
  national_id: z.string().max(20).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  role: z.nativeEnum(WorkerRole),
});

/** Validation: Create a picking record */
export const createPickingRecordSchema = z.object({
  worker_id: z.string().uuid(),
  block_id: z.string().uuid(),
  /** Optional row (melga). When present it must belong to block_id (checked server-side). */
  row_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive('Cantidad debe ser mayor a 0'),
});

/** Validation: Create picking record via QR scan */
export const scanPickingRecordSchema = z.object({
  qr_code: z.string().uuid('QR code inválido'),
  block_id: z.string().uuid(),
  /** Optional row (melga). When present it must belong to block_id (checked server-side). */
  row_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive('Cantidad debe ser mayor a 0'),
});

/** Validation: Generate a settlement */
export const generateSettlementSchema = z.object({
  worker_id: z.string().uuid().optional(),
  period_start: z.string().date('Fecha inicio inválida'),
  period_end: z.string().date('Fecha fin inválida'),
});

/** Validation: Create a payment */
export const createPaymentSchema = z.object({
  settlement_id: z.string().uuid(),
  worker_id: z.string().uuid(),
  amount: z.number().positive('Monto debe ser mayor a 0'),
  notes: z.string().max(500).nullable().optional(),
});

/**
 * Validation: Add a worker to today's roster.
 * The lead (crew_lead or supervisor) is the authenticated user; the server sets
 * lead_id, added_by, organization_id and work_day. crew_id is optional and only
 * set when the lead is a crew_lead managing a crew.
 */
export const addToDayRosterSchema = z.object({
  worker_id: z.string().uuid(),
  crew_id: z.string().uuid().nullable().optional(),
});

/** Validation: Remove a worker from today's roster (by roster entry id). */
export const removeFromDayRosterSchema = z.object({
  id: z.string().uuid(),
});

/** Minimum length for user passwords (super-admin created client admins). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Validation: onboard a new client (super-admin).
 * Creates the organization and its initial admin user in one step.
 */
export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Nombre de la organización es requerido').max(150),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug inválido (minúsculas, números y guiones)')
    .max(80),
  subscription_status: z.enum(['trial', 'active', 'suspended', 'cancelled']).optional(),
  subscription_plan: z.string().max(50).nullable().optional(),
  admin: z.object({
    full_name: z.string().min(1, 'Nombre del administrador es requerido').max(150),
    email: z.string().email('Email del administrador inválido'),
    password: z.string().min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`),
  }),
});

/** Validation: change own password (forced on first login or voluntary). */
export const changePasswordSchema = z
  .object({
    new_password: z.string().min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
  });

/** Validation: Pagination query params */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
