"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guards";
import { topUpDemo } from "@/lib/keur";
import type { FormState } from "@/lib/session-actions";

export async function topUpAction(amount: number, _: FormState): Promise<FormState> {
  const user = await requireRole("CLIENT");
  const r = await topUpDemo(user.id, amount);
  revalidatePath("/client/portefeuille");
  return r.ok ? { ok: true } : { errors: { form: r.error } };
}
