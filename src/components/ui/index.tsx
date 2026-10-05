import clsx from "clsx";
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

const base = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl2 px-5 font-bold transition active:scale-[0.98] disabled:opacity-50";
const variants = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700",
  accent: "bg-amber-400 text-emerald-900 hover:bg-amber-500",
  outline: "border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50",
  ghost: "text-emerald-700 hover:bg-emerald-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
type Variant = keyof typeof variants;

export function Button({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={clsx(base, variants[variant], className)} {...p} />;
}

export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <Link href={href} className={clsx(base, variants[variant], className)}>{children}</Link>;
}

export function Field({ label, error, hint, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = p.id ?? p.name;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-bold">{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
        className={clsx("min-h-12 w-full rounded-xl2 border-2 bg-white px-4 text-base", error ? "border-red-500" : "border-emerald-100 focus:border-emerald-500")} {...p} />
      {hint && !error && <p className="text-sm text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("rounded-xl2 border border-emerald-100 bg-white p-4 shadow-sm", className)}>{children}</div>;
}

const tones = { green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-600", red: "bg-red-100 text-red-700", gray: "bg-cream-100 text-ink-soft" };
export function Badge({ tone = "green", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={clsx("inline-block rounded-full px-3 py-1 text-xs font-bold", tones[tone])}>{children}</span>;
}

export function FormError({ message }: { message?: string }) {
  return message ? <p role="alert" className="rounded-xl2 bg-red-100 p-3 text-sm font-semibold text-red-700">{message}</p> : null;
}
