import { z } from "zod";
import { normalizeSnPhone } from "./phone";
import { ALL_DISTRICTS, ZONES } from "./zones";

const phone = z
  .string({ error: "Le numéro de téléphone est obligatoire." })
  .transform((v, ctx) => {
    const n = normalizeSnPhone(v);
    if (!n) ctx.addIssue({ code: "custom", message: "Numéro invalide. Exemple : 77 123 45 67" });
    return n ?? z.NEVER;
  });

const password = z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(72);
const fullName = z.string().trim().min(2, "Indiquez votre nom complet.").max(80);

export const loginSchema = z.object({
  phone,
  password: z.string().min(1, "Le mot de passe est obligatoire."),
});

export const clientRegisterSchema = z.object({ fullName, phone, password });

export const providerRegisterSchema = z.object({
  fullName,
  phone,
  password,
  jobTitle: z.string().trim().min(2, "Indiquez votre métier.").max(60),
  experienceYears: z.coerce.number().int().min(0).max(60),
  serviceSlugs: z.array(z.string()).min(1, "Choisissez au moins un service."),
  zones: z
    .array(z.string().refine((z) => Object.keys(ZONES).includes(z), "Zone inconnue."))
    .min(1, "Choisissez au moins une zone d'intervention."),
});

export const locationSchema = z.object({
  district: z.string().refine((d) => ALL_DISTRICTS.includes(d), "Choisissez un quartier de la liste."),
  addressLine: z.string().trim().min(3, "Indiquez votre adresse."),
  landmark: z.string().trim().min(3, "Indiquez un point de repère (ex : près de la pharmacie)."),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Note de 1 à 5.").max(5, "Note de 1 à 5."),
  comment: z.string().trim().max(500).optional(),
});

export function formErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
