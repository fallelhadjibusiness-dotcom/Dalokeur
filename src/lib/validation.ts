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

const COMMON = new Set(["12345678", "123456789", "1234567890", "password", "motdepasse", "azertyuiop", "qwertyuiop", "11111111", "00000000", "dalokeur", "dalokeur1", "senegal123", "passer123"]);
const password = z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(72, "Mot de passe trop long (72 caractères maximum).");

// Politique : pas de mot de passe trivial, répétitif ou égal au téléphone.
export function passwordProblem(pw: string, phone?: string | null): string | null {
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw)) return "Ce mot de passe est trop simple. Choisissez-en un autre.";
  if (phone && pw.replace(/\D/g, "").length >= 8 && phone.replace(/\D/g, "").endsWith(pw.replace(/\D/g, "").slice(-9))) return "Le mot de passe ne doit pas être votre numéro de téléphone.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Utilisez au moins une lettre et un chiffre.";
  return null;
}
const checkPassword = (d: { password: string; phone: string }, ctx: z.RefinementCtx) => {
  const problem = passwordProblem(d.password, d.phone);
  if (problem) ctx.addIssue({ code: "custom", path: ["password"], message: problem });
};
const fullName = z.string().trim().min(2, "Indiquez votre nom complet.").max(80);

export const loginSchema = z.object({
  phone,
  password: z.string().min(1, "Le mot de passe est obligatoire."),
});

export const clientRegisterSchema = z.object({ fullName, phone, password }).superRefine(checkPassword);

export const providerRegisterSchema = z
  .object({
  fullName,
  phone,
  password,
  jobTitle: z.string().trim().min(2, "Indiquez votre métier.").max(60),
  experienceYears: z.coerce.number().int().min(0).max(60),
  serviceSlugs: z.array(z.string()).min(1, "Choisissez au moins un service."),
  zones: z
    .array(z.string().refine((z) => Object.keys(ZONES).includes(z), "Zone inconnue."))
    .min(1, "Choisissez au moins une zone d'intervention."),
  })
  .superRefine(checkPassword);

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
