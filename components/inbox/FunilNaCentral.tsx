"use client";

import { useId, useMemo, useState } from "react";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useBoard } from "@/hooks/kanban/useBoard";
import {
  useFunilPrincipalDaCentral,
  useDefinirFunilPrincipalDaCentral,
} from "@/hooks/inbox/useFunilPrincipalDaCentral";
import Link from "next/link";
import { toast } from "sonner";
import { roleAtLeast } from "@/lib/auth/types";
import { applyFilters, type LeadFilters } from "@/lib/kanban/filters";
import { categoriaDoMotivo } from "@/lib/leads/motivos-de-perda-do-funil";
import { ConfigurarColunasLink } from "@/components/kanban/ConfigurarColunasLink";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { FilterBar } from "@/components/kanban/FilterBar";
import { BulkActionBar } from "@/components/kanban/BulkActionBar";
import { NewLeadDialog } from "@/components/kanban/NewLeadDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Funnel, Plus } from "@/lib/ui/icons";

/** A própria implementação do quadro, sem outra página, iframe ou aba. */
export function FunilNaCentral({
  pipelineId,
  onPrincipalDefinido,
}: {
  pipelineId: string | null;
  onPrincipalDefinido: () => void;
}) {
  const t = useT();
  const { activeOrg, user } = useAuth();
  const orgId = activeOrg?.orgId ?? null;
  const principal = useFunilPrincipalDaCentral(orgId);
  const definir = useDefinirFunilPrincipalDaCentral(orgId);
  const podeDefinir =
    roleAtLeast(activeOrg?.role, "manager") && user?.support?.access_mode !== "support_readonly";
  const id = pipelineId ?? principal.data?.pipeline?.id;
  if (!id) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center gap-3 p-6 text-sm"
        role="status"
      >
        {principal.isError ? (
          <>
            <span>{t("Não consegui carregar o funil principal.")}</span>
            <Button variant="outline" onClick={() => void principal.refetch()}>
              {t("Tentar de novo")}
            </Button>
          </>
        ) : principal.isSuccess ? (
          <>
            <span>{t("Nenhum funil disponível.")}</span>
            <Link href="/app/kanban" className="underline">
              {t("Gerenciar funis")}
            </Link>
          </>
        ) : (
          t("Carregando funil…")
        )}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {principal.data?.substituido && (
        <p role="status" className="px-3 pt-3 text-sm text-muted-foreground">
          {t("O funil principal anterior está indisponível. Exibindo o funil padrão.")}
        </p>
      )}
      {podeDefinir &&
        principal.data &&
        (principal.data.pipeline?.id !== id || !principal.data.configurado) && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {t("Escolha este quadro como principal da central, sem alterar as novas entradas.")}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={definir.isPending}
              onClick={() =>
                definir.mutate(id, {
                  onSuccess: () => {
                    toast.success(t("Funil principal da central atualizado."));
                    onPrincipalDefinido();
                  },
                  onError: (erro) =>
                    toast.error(
                      erro instanceof Error
                        ? erro.message
                        : t("Não consegui salvar o funil principal."),
                    ),
                })
              }
            >
              {definir.isPending ? t("Salvando…") : t("Definir como principal")}
            </Button>
          </div>
        )}
      <QuadroNaCentral key={id} pipelineId={id} />
    </div>
  );
}

function QuadroNaCentral({ pipelineId }: { pipelineId: string }) {
  const t = useT();
  const { activeOrg, user } = useAuth();
  const { data, isLoading, error, refetch, pulses, realtimeStatus, seguranca } =
    useBoard(pipelineId);
  // Filtros do quadro são locais: não disputam busca, etiquetas ou ID do Inbox.
  const [filters, setFilters] = useState<LeadFilters>({});
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const filtrosId = useId();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const podeEscrever =
    roleAtLeast(activeOrg?.role, "agent") && user?.support?.access_mode !== "support_readonly";
  const tags = useMemo(
    () => [...new Set((data?.leads ?? []).flatMap((l) => l.tags))].sort(),
    [data?.leads],
  );
  const leads = data
    ? applyFilters(data.leads, filters, {
        categoriaDo: (motivo) => categoriaDoMotivo(motivo, data.pipeline.settings),
      })
    : [];

  return (
    <section
      aria-label={t("Funil na central")}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-3"
      data-realtime-status={realtimeStatus.toLowerCase()}
      data-refetch-divergencias={seguranca.divergencias}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-semibold">
          {data?.pipeline.name ?? t("Funil")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {podeEscrever && roleAtLeast(activeOrg?.role, "manager") && (
            <ConfigurarColunasLink
              pipelineId={pipelineId}
              nomeDoFunil={data?.pipeline.name ?? t("Funil")}
            />
          )}
          <Button
            variant="outline"
            className="sm:hidden"
            aria-expanded={filtrosAbertos}
            aria-controls={filtrosId}
            onClick={() => setFiltrosAbertos((abertos) => !abertos)}
          >
            <Funnel size={16} aria-hidden />
            {Object.keys(filters).length ? t("Filtros ativos") : t("Filtros")}
          </Button>
          {podeEscrever && (
            <Button onClick={() => setNewOpen(true)} disabled={!data?.stages.length}>
              <Plus size={16} aria-hidden />
              {t("Novo Lead")}
            </Button>
          )}
        </div>
      </header>
      <div id={filtrosId} className={cn("shrink-0 sm:block", !filtrosAbertos && "hidden")}>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          leads={data?.leads ?? []}
          settings={data?.pipeline.settings}
        />
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <span>
            {t("Não consegui carregar este funil:")}{" "}
            {error instanceof Error ? error.message : t("Erro desconhecido")}
          </span>
          <Button variant="outline" onClick={() => void refetch()}>
            {t("Tentar de novo")}
          </Button>
        </div>
      ) : isLoading || !data ? (
        <p role="status" className="p-4 text-sm">
          {t("Carregando funil…")}
        </p>
      ) : (
        <>
          <KanbanBoard
            pipelineId={pipelineId}
            pipeline={data.pipeline}
            stages={data.stages}
            leads={leads}
            pulses={pulses}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            podeRenomearEtapa={podeEscrever && roleAtLeast(activeOrg?.role, "manager")}
          />
          {podeEscrever && (
            <>
              <NewLeadDialog
                open={newOpen}
                onOpenChange={setNewOpen}
                pipelineId={pipelineId}
                stages={data.stages}
                leads={data.leads}
                settings={data.pipeline.settings}
              />
              <BulkActionBar
                pipelineId={pipelineId}
                selectedIds={selectedIds}
                stages={data.stages}
                vocabulary={data.pipeline.vocabulary}
                tagsExistentes={tags}
                onClear={() => setSelectedIds([])}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
