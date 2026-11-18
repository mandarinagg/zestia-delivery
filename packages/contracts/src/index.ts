import { z } from 'zod';

/** Respuesta de `GET /health/live` y `GET /health/ready`. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from './auth.js';
