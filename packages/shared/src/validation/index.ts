import { z } from 'zod';
import { UnitMeasure, WorkerRole, ToleranceUnit, ALL_CAPABILITIES, DispatchScope } from '../types/index';

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

/** Validation: Create a new product variety (variedad under a product) */
export const createProductVarietySchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().min(1, 'Nombre de la variedad es requerido').max(100),
});

/** Validation: Create a new block */
export const createBlockSchema = z.object({
  name: z.string().min(1, 'Nombre del paño es requerido').max(100),
  product_id: z.string().uuid(),
  /** Variety of the block's product. Optional; required server-side when the product has varieties. */
  variety_id: z.string().uuid().nullable().optional(),
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
  /** Variety this rate applies to. Optional; null = product-level rate. */
  variety_id: z.string().uuid().nullable().optional(),
});

/** Validation: Create/update a box type (tare + tolerance) */
export const createBoxTypeSchema = z.object({
  name: z.string().min(1, 'Nombre del tipo de caja es requerido').max(100),
  tare_weight_kg: z.number().min(0, 'La tara no puede ser negativa'),
  target_net_weight_kg: z.number().positive('El peso objetivo debe ser mayor a 0'),
  tolerance_over: z.number().min(0, 'La tolerancia superior no puede ser negativa').default(0),
  tolerance_under: z.number().min(0, 'La tolerancia inferior no puede ser negativa').default(0),
  tolerance_unit: z.nativeEnum(ToleranceUnit).default(ToleranceUnit.PERCENT),
});

/** Validation: Create/update a permission profile (RBAC configurable). */
export const createPermissionProfileSchema = z.object({
  name: z.string().min(1, 'Nombre del perfil es requerido').max(100),
  capabilities: z
    .array(z.enum(ALL_CAPABILITIES as [string, ...string[]]))
    .min(1, 'Selecciona al menos una capacidad'),
});

/**
 * Roles que pueden tener login (excluye 'worker', que es cosechero sin acceso).
 * Se declaran como tupla de literales de string `as const` para que `z.enum`
 * los acepte directamente (z.enum exige `[string, ...string[]]`, no miembros de
 * enum de TS). Los literales coinciden con WorkerRole.ADMIN/SUPERVISOR/CREW_LEAD.
 */
export const LOGIN_USER_ROLES = ['admin', 'supervisor', 'crew_lead'] as const;

/** Crear usuario de login (sección "Usuarios"). La contraseña la genera el backend. */
export const createLoginUserSchema = z.object({
  full_name: z.string().min(1, 'Nombre completo es requerido').max(150),
  email: z.string().email('Email inválido').max(255),
  role: z.enum(LOGIN_USER_ROLES, {
    required_error: 'Seleccione un rol',
  }),
});
export type CreateLoginUserInput = z.infer<typeof createLoginUserSchema>;

/** Editar usuario de login (solo nombre y rol; email no es editable en esta fase). */
export const updateLoginUserSchema = z.object({
  full_name: z.string().min(1).max(150).optional(),
  role: z.enum(LOGIN_USER_ROLES).optional(),
});
export type UpdateLoginUserInput = z.infer<typeof updateLoginUserSchema>;

/** Validation: Create a new worker */
export const createWorkerSchema = z.object({
  full_name: z.string().min(1, 'Nombre completo es requerido').max(150),
  national_id: z.string().max(20).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  role: z.nativeEnum(WorkerRole),
});

/**
 * Optional box-tare fields shared by picking create/scan schemas.
 * Present only when the tenant uses `box_tare_control` and the product is by box.
 * The payment is unaffected (still by `quantity`); these capture the weighing for
 * waste control and audit. box_type_id + gross_weight_kg must come together.
 */
const boxTareFields = {
  /** Box type used. When present, gross_weight_kg must be present too. */
  box_type_id: z.string().uuid().nullable().optional(),
  /** Gross weight measured on the scale (kg), tare included. */
  gross_weight_kg: z.number().positive('Peso bruto debe ser mayor a 0').nullable().optional(),
  /**
   * Payable kilograms entered manually for kg payment. Rounded to 3 decimals by
   * the client. Mutually exclusive with gross_weight_kg (box-tare weighing).
   */
  manual_kg: z
    .number()
    .positive('Kilos deben ser mayor a 0')
    .transform((kg) => Math.round(kg * 1000) / 1000)
    .nullable()
    .optional(),
};

/** Both box-tare fields must be provided together (or neither). */
const bothOrNeitherBoxTare = (d: { box_type_id?: string | null; gross_weight_kg?: number | null }): boolean =>
  (d.box_type_id == null) === (d.gross_weight_kg == null);
const boxTareRefinement: { message: string; path: (string | number)[] } = {
  message: 'box_type_id y gross_weight_kg deben ir juntos',
  path: ['gross_weight_kg'],
};

/** manual_kg (kg payment) and gross_weight_kg (box weighing) are mutually exclusive. */
const manualKgExclusive = (d: { manual_kg?: number | null; gross_weight_kg?: number | null }): boolean =>
  !(d.manual_kg != null && d.gross_weight_kg != null);
const manualKgRefinement: { message: string; path: (string | number)[] } = {
  message: 'manual_kg y gross_weight_kg son mutuamente excluyentes',
  path: ['manual_kg'],
};

/** Validation: Create a picking record */
export const createPickingRecordSchema = z
  .object({
    worker_id: z.string().uuid(),
    block_id: z.string().uuid(),
    /** Optional row (melga). When present it must belong to block_id (checked server-side). */
    row_id: z.string().uuid().nullable().optional(),
    quantity: z.number().positive('Cantidad debe ser mayor a 0'),
    ...boxTareFields,
  })
  .refine(bothOrNeitherBoxTare, boxTareRefinement)
  .refine(manualKgExclusive, manualKgRefinement);

/** Validation: Create picking record via QR scan */
export const scanPickingRecordSchema = z
  .object({
    qr_code: z.string().uuid('QR code inválido'),
    block_id: z.string().uuid(),
    /** Optional row (melga). When present it must belong to block_id (checked server-side). */
    row_id: z.string().uuid().nullable().optional(),
    quantity: z.number().positive('Cantidad debe ser mayor a 0'),
    ...boxTareFields,
  })
  .refine(bothOrNeitherBoxTare, boxTareRefinement)
  .refine(manualKgExclusive, manualKgRefinement);

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

/** Validation: Create a dispatch guide (auto-suggested from picking). */
export const createDispatchGuideSchema = z.object({
  scope: z.nativeEnum(DispatchScope),
  field_id: z.string().uuid(),
  block_id: z.string().uuid().nullable().optional(),
  work_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  guide_number: z.string().min(1, 'Número de guía requerido').max(60),
  carrier: z.string().max(150).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
}).refine(
  (v) => (v.scope === DispatchScope.FIELD ? !v.block_id : !!v.block_id),
  { message: 'scope=field no lleva block_id; scope=block requiere block_id', path: ['block_id'] },
);

/** Validation: Edit a dispatch guide's content (only while status=open). */
export const updateDispatchGuideSchema = z.object({
  total_trays: z.number().min(0).optional(),
  total_weight_kg: z.number().min(0).optional(),
  guide_number: z.string().min(1).max(60).optional(),
  carrier: z.string().max(150).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

/** Validation: Register a dispatch receipt (what the client/plant received). */
export const createDispatchReceiptSchema = z.object({
  received_trays: z.number().min(0, 'Bandejas recibidas no puede ser negativo'),
  received_weight_kg: z.number().min(0, 'Peso recibido no puede ser negativo'),
  received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).nullable().optional(),
});

/** Validation: Attach a backup photo to a payment (M2-01b). */
export const createPaymentEvidenceSchema = z.object({
  payment_id: z.string().uuid(),
  image_path: z.string().min(1, 'Ruta de imagen requerida'),
});

/** Validation: Pagination query params */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
