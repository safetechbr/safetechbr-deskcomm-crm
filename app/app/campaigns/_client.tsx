"use client";
/**
 * A lista de campanhas (PRD §24).
 *
 * Mostra o que decide o próximo clique: em que pé está, para quantas pessoas,
 * quantas saíram e quando. Quem quiser o detalhe abre a campanha — a lista não
 * tenta ser o painel.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { EstadoDaCampanha } from "@/components/campanhas/EstadoDaCampanha";
import { EmptyState } from "@/components/empty";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampanhas } from "@/hooks/campanhas/useCampanhas";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { Megaphone, Plus } from "@/lib/ui/icons";
import { STATUS_DA_CAMPANHA } from "@/lib/campanhas/tipos";

export function ListaDeCampanhas() {
  const t = useT();
  // A data segue quem está lendo, não o idioma de quem escreveu a tela.
  const idioma = useTagDeIdioma();
  const [status, setStatus] = useState<string>("");
  const filtros = useMemo(() => ({ status: status || undefined, limit: 30 }), [status]);
  const q = useCampanhas(filtros);
  const campanhas = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <header className="ds-entra flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Megaphone size={22} weight="duotone" aria-hidden />
          </span>
          <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Campanhas")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Escolha o público, escreva a mensagem e acompanhe quem recebeu.")}
          </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" asChild className="rounded-full hover:bg-muted/50 hover:text-accent">
          <Link href="/app/campaigns/settings">{t("Configuração")}</Link>
        </Button>
        <Button asChild className="rounded-full px-5">
          <Link href="/app/campaigns/new">
            <Plus size={16} weight="bold" aria-hidden />
            <span>{t("Nova campanha")}</span>
          </Link>
        </Button>
        </div>
      </header>

      <div
        className="ds-entra flex flex-wrap items-center gap-3 self-start rounded-full border border-border/60 bg-surface py-1.5 pl-4 pr-1.5 shadow-xs"
        style={{ animationDelay: "50ms" }}
      >
        <label className="text-sm text-muted-foreground" htmlFor="filtro-status">
          {t("Situação")}
        </label>
        <select
          id="filtro-status"
          className="h-9 cursor-pointer rounded-full border border-border/80 bg-surface px-4 text-sm transition-colors hover:border-accent/40 focus-visible:border-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/20"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t("Todas")}</option>
          {STATUS_DA_CAMPANHA.map((s) => (
            <option key={s} value={s}>
              {t(rotulo(s))}
            </option>
          ))}
        </select>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
          ))}
        </div>
      ) : q.isError ? (
        <Card className="ds-entra rounded-xl border-error/30 bg-error-bg p-6 text-center shadow-none">
          <p className="text-sm text-error-fg">{t("Erro ao carregar as campanhas.")}</p>
          <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => q.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </Card>
      ) : campanhas.length === 0 ? (
        <Card className="ds-entra rounded-xl border-border/60 bg-surface p-2 shadow-xs">
          <EmptyState
            icon={Megaphone}
            headline={t("Nenhuma campanha ainda.")}
            subcopy={t(
              "Uma campanha fala com uma lista de contatos que você escolhe, no ritmo do número — nunca em rajada.",
            )}
            primary={{ label: t("Nova campanha"), href: "/app/campaigns/new" }}
          />
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {campanhas.map((c, i) => (
              <li
                key={c.id}
                className="ds-entra"
                style={{ animationDelay: `${Math.min(i, 8) * 40 + 80}ms` }}
              >
              <Link
                href={`/app/campaigns/${c.id}`}
                className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-surface p-4 shadow-xs transition-shadow hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Megaphone size={18} weight="duotone" aria-hidden />
                  </span>
                  <div className="min-w-0">
                  <p className="truncate font-semibold transition-colors group-hover:text-accent">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.snapshot_eligible > 0
                      ? `${c.snapshot_eligible} ${t("contatos na lista")}`
                      : t("lista ainda não preparada")}
                    {c.snapshot_excluded > 0 ? ` · ${c.snapshot_excluded} ${t("fora")}` : ""}
                  </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">{quando(c, t, idioma)}</span>
                  <EstadoDaCampanha status={c.status} />
                </div>
              </Link>
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full px-5 hover:bg-muted/50 hover:text-accent"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
              >
                {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function rotulo(status: string): string {
  const mapa: Record<string, string> = {
    draft: "Rascunho",
    preparing: "Montando a lista",
    ready: "Pronta para iniciar",
    scheduled: "Agendada",
    running: "Enviando",
    paused: "Pausada",
    completed: "Concluída",
    cancelled: "Cancelada",
    failed: "Falhou",
  };
  return mapa[status] ?? status;
}

/** A data que importa depende do estado — mostrar "criada em" numa campanha que já terminou é ruído. */
function quando(
  c: { status: string; scheduled_at: string | null; started_at: string | null; completed_at: string | null; created_at: string },
  t: (s: string) => string,
  idioma: string,
): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(idioma, { dateStyle: "short", timeStyle: "short" });
  if (c.status === "scheduled" && c.scheduled_at) return `${t("começa")} ${fmt(c.scheduled_at)}`;
  if (c.completed_at) return `${t("terminou")} ${fmt(c.completed_at)}`;
  if (c.started_at) return `${t("começou")} ${fmt(c.started_at)}`;
  return `${t("criada")} ${fmt(c.created_at)}`;
}
