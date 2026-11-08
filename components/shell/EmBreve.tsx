import type { ReactNode } from "react";

/** Página provisória de um destino ainda não construído. */
export function EmBreve({ titulo, icone }: { titulo: string; icone?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
      {icone ? (
        <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">{icone}</span>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">Em breve</span>
      <p className="text-sm text-muted-foreground">Esta página ainda está sendo preparada e chega em breve.</p>
    </div>
  );
}
