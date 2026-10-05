import { fileUrl } from "@/lib/format";

export function PhotoGrid({ keys, label = "Photos de la demande" }: { keys: string[]; label?: string }) {
  if (keys.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {keys.map((k) => (
        <li key={k}>
          <a href={fileUrl(k)} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(k)} alt="Photo jointe à la demande" loading="lazy" className="h-24 w-24 rounded-xl2 object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}
