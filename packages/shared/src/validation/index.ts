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
  quantity: z.number().positive('Cantidad debe ser mayor a 0'),
});

/** Validation: Create picking record via QR scan */
export const scanPickingRecordSchema = z.object({
  qr_code: z.string().uuid('QR code inválido'),
  block_id: z.string().uuid(),
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

/** Validation: Pagination query params */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
