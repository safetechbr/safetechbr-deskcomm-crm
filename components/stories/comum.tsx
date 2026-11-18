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
        "flex w-full min-w-0 items-start gap-2 rounded-md border border-border bg-surface-elevated p-2 text-left text-xs hover:border-border-strong",
        story.status === "cancelada" && "opacity-60",
      )}
    >
      {midia?.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={midia.url} alt="" className="size-9 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="size-9 shrink-0 rounded-md bg-muted" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium tabular-nums">{horaDe(story.agendada_para)}</span>
        <span className="flex flex-wrap gap-1">
          <Badge variant={VARIANTE_DO_STATUS[story.status]} className="max-w-full truncate">
            {NOME_DO_STATUS[story.status]}
          </Badge>
          {story.serie_id && <Badge variant="outline">Série</Badge>}
        </span>
        {story.legenda && <span className="truncate text-muted-foreground">{story.legenda}</span>}
      </span>
    </button>
  );
}

export function doDia(itens: StoryItem[], dia: Date) {
  return itens
    .filter((s) => new Date(s.agendada_para).toDateString() === dia.toDateString())
    .sort((a, b) => a.agendada_para.localeCompare(b.agendada_para));
}
