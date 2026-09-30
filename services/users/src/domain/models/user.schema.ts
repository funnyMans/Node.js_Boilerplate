import { z } from 'zod';

export const userStatusSchema = z.enum(['active', 'blocked', 'deleted']);

export const createUserSchema = z.object({
  email: z.string().trim().email(),
  status: userStatusSchema.optional().default('active'),
});

export const updateUserProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
  status: userStatusSchema.optional(),
});
