import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NOME_DO_STATUS, VARIANTE_DO_STATUS, horaDe, type EstadoDosStories, type StoryItem } from "./tipos";

export type VisaoProps = {
  estado: EstadoDosStories;
  itens: StoryItem[];
  onAbrir: (id: string) => void;
  onNovo: (dia: Date) => void;
  podeCriar: boolean;
};

export function PilulaDoStory({ story, onAbrir }: { story: StoryItem; onAbrir: (id: string) => void }) {
  const midia = story.midias[0];
  return (
    <button
      type="button"
      onClick={() => onAbrir(story.id)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border border-border bg-surface-elevated p-2 text-left text-xs hover:border-border-strong",
        story.status === "cancelada" && "opacity-60",
      )}
    >
      {midia?.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={midia.url} alt="" className="size-9 shrink-0 rounded object-cover" />
      ) : (
        <span className="size-9 shrink-0 rounded bg-muted" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium tabular-nums">{horaDe(story.agendada_para)}</span>
        <span className="block truncate text-muted-foreground">{story.legenda || "—"}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={VARIANTE_DO_STATUS[story.status]}>{NOME_DO_STATUS[story.status]}</Badge>
        {story.serie_id && <Badge variant="outline">Série</Badge>}
      </span>
    </button>
  );
}

export function doDia(itens: StoryItem[], dia: Date) {
  return itens
    .filter((s) => new Date(s.agendada_para).toDateString() === dia.toDateString())
    .sort((a, b) => a.agendada_para.localeCompare(b.agendada_para));
}
