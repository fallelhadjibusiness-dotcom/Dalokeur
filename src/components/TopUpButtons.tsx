"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { topUpAction } from "@/app/client/portefeuille/actions";
import { DEMO_TOPUPS } from "@/lib/keur";
import { fcfa } from "@/lib/format";

export function TopUpButtons() {
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">Recharger (monnaie fictive)</p>
      <div className="flex flex-wrap gap-2">
        {DEMO_TOPUPS.map((a) => <Button key={a} variant="outline" className="min-h-10 px-3 text-sm" disabled={pending} onClick={() => start(async () => { const r = await topUpAction(a, {}); setErr(r.errors?.form); })}>+ {fcfa(a)}</Button>)}
      </div>
      {err && <p role="alert" className="text-sm font-semibold text-red-600">{err}</p>}
    </div>
  );
}
