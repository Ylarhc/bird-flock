import { z } from "zod";

const imageUrlRegex = /^https?:\/\/.+\.(png|jpe?g|webp)$/i;

export const countrySchema = z.object({
  picture: z.string().regex(imageUrlRegex, "must be a valid image URL (png, jpg, jpeg, webp)"),
  code: z.string().min(1),
});

export const playerDataSchema = z.object({
  rank: z.number().int().positive(),
  points: z.number().int().positive(),
  weight: z.number().int().positive(),
  height: z.number().int().positive(),
  age: z.number().int().positive(),
  last: z
    .array(z.number().int().refine((n) => n === 0 || n === 1, "must be 0 or 1"))
    .min(1),
});

export const playerSchema = z.object({
  id: z.number().int().positive(),
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  shortname: z.string().min(1),
  sex: z.enum(["M", "F", "NC"]),
  country: countrySchema,
  picture: z.string().regex(imageUrlRegex, "must be a valid image URL (png, jpg, jpeg, webp)"),
  data: playerDataSchema,
});

export const idParamSchema = z.coerce.number().int().positive();

export type PlayerInput = z.infer<typeof playerSchema>;
