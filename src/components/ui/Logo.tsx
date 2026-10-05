// Monogramme « D » dans une maison.
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Dalokeur">
      <path d="M24 3 3 20v25h42V20L24 3Z" fill="#0f6b4d" />
      <path d="M24 3 3 20h42L24 3Z" fill="#e9b44c" />
      <path d="M17 24h8a8 8 0 0 1 0 16h-8V24Zm4 4v8h4a4 4 0 0 0 0-8h-4Z" fill="#fbf7ee" fillRule="evenodd" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={36} />
      <span className={`text-xl font-extrabold tracking-tight ${light ? "text-cream" : "text-emerald-800"}`}>Dalokeur</span>
    </span>
  );
}
