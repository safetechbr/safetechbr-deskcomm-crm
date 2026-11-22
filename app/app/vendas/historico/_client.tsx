"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { DialogoDeMotivo } from "@/components/feedback/DialogoDeMotivo";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import {
  CaretDown,
  ChartLineUp,
  CheckCircle,
  DownloadSimple,
  FileText,
  MagnifyingGlass,
  Receipt,
  Trash,
  WarningOctagon,
  X,
} from "@/lib/ui/icons";
import {
  FORMAS_DE_PAGAMENTO,
  resumoDaNegociacao,
  ROTULO_DA_FORMA,
  ROTULO_DO_STATUS_DA_NEGOCIACAO,
  tituloDoVeiculoDaNegociacao,
  type Negociacao,
  type StatusDaNegociacao,
  type TipoDeNegociacao,
} from "@/lib/pdv/regras";
import { formatarPreco } from "@/lib/veiculos/regras";

type Ordem = "recente" | "antiga" | "maior" | "menor";

const CAMPO_DO_FILTRO =
  "h-11 w-full min-w-0 rounded-lg border border-border/80 bg-surface px-2.5 text-sm shadow-xs transition-colors hover:border-border focus-visible:border-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/20 lg:h-9";

function Filtro({ rotulo, ...props }: React.ComponentProps<"select"> & { rotulo: string }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
      <span>{rotulo}</span>
      <span className="relative block min-w-0">
        <select {...props} className={`${CAMPO_DO_FILTRO} appearance-none pe-9 forced-colors:appearance-auto`} />
        <CaretDown
          className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 forced-colors:hidden"
          aria-hidden
        />
      </span>
    </label>
  );
}

const COR_DO_STATUS: Record<StatusDaNegociacao, string> = {
  concluida: "bg-success-bg text-success-fg",
  rascunho: "bg-warning-bg text-warning-fg",
  cancelada: "bg-error-bg text-error-fg",
};

function dataDaNegociacao(n: Negociacao): string {
  return n.concluida_em ?? n.created_at;
}

function formasDe(n: Negociacao, t: (s: string) => string): string {
  const formas = Array.from(new Set((n.pagamentos ?? []).map((p) => p.forma)));
  if (formas.length === 0) return "—";
  if (formas.length > 1) return t("Misto");
  const f = formas[0]!;
  const p = n.pagamentos[0]!;
  const nome = t(ROTULO_DA_FORMA[f]);
  return p.parcelas > 1 ? `${nome} (${p.parcelas}x)` : nome;
}

function csv(linhas: string[][]): string {
  return linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function HistoricoDeVendasClient({
  negociacoes,
  titulo,
  subtitulo,
  podeExcluir,
}: {
  negociacoes: Negociacao[];
  titulo: string;
  subtitulo: string;
  podeExcluir: boolean;
}) {
  const t = useT();
  const [busca, setBusca] = React.useState("");
  const [tipo, setTipo] = React.useState<"all" | TipoDeNegociacao>("all");
  const [status, setStatus] = React.useState<"all" | StatusDaNegociacao>("all");
  const [forma, setForma] = React.useState<"all" | (typeof FORMAS_DE_PAGAMENTO)[number]>("all");
  const [ordem, setOrdem] = React.useState<Ordem>("recente");

  const lista = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrada = negociacoes.filter((n) => {
      if (tipo !== "all" && n.tipo !== tipo) return false;
      if (status !== "all" && n.status !== status) return false;
      if (forma !== "all" && !(n.pagamentos ?? []).some((p) => p.forma === forma)) return false;
      if (!termo) return true;
      const alvo = [
        n.cliente?.nome,
        n.cliente?.telefone,
        n.cliente?.documento,
        tituloDoVeiculoDaNegociacao(n.veiculo),
        n.veiculo?.placa,
        String(n.numero),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return alvo.includes(termo);
    });
    const total = (n: Negociacao) => resumoDaNegociacao(n).total_cents;
    return [...filtrada].sort((a, b) => {
      if (ordem === "maior") return total(b) - total(a);
      if (ordem === "menor") return total(a) - total(b);
      const d = dataDaNegociacao(a).localeCompare(dataDaNegociacao(b));
      return ordem === "antiga" ? d : -d;
    });
  }, [negociacoes, busca, tipo, status, forma, ordem]);

  // Os cartões medem o conjunto filtrado: o que se vê é o que se soma.
  const cartoes = React.useMemo(() => {
    const concluidas = lista.filter((n) => n.status === "concluida");
    const vendas = concluidas.filter((n) => n.tipo === "venda");
    const compras = concluidas.filter((n) => n.tipo === "compra");
    const soma = (ns: Negociacao[]) => ns.reduce((acc, n) => acc + resumoDaNegociacao(n).total_cents, 0);
    return {
      total: lista.length,
      concluidas: concluidas.length,
      canceladas: lista.filter((n) => n.status === "cancelada").length,
      receita: soma(vendas),
      investido: soma(compras),
    };
  }, [lista]);

  const filtrando = busca !== "" || tipo !== "all" || status !== "all" || forma !== "all";
  const limpar = () => {
    setBusca("");
    setTipo("all");
    setStatus("all");
    setForma("all");
  };

  const exportar = () => {
    const cab = [t("Nº"), t("Tipo"), t("Cliente"), t("Telefone"), t("Veículo"), t("Placa"), t("Data"), t("Pagamento"), t("Total"), t("Situação")];
    const corpo = lista.map((n) => [
      String(n.numero),
      n.tipo === "venda" ? t("Venda") : t("Compra"),
      n.cliente?.nome ?? "",
      n.cliente?.telefone ?? "",
      tituloDoVeiculoDaNegociacao(n.veiculo),
      n.veiculo?.placa ?? "",
      new Date(dataDaNegociacao(n)).toLocaleDateString("pt-BR"),
      formasDe(n, t),
      (resumoDaNegociacao(n).total_cents / 100).toFixed(2).replace(".", ","),
      t(ROTULO_DO_STATUS_DA_NEGOCIACAO[n.status]),
    ]);
    const blob = new Blob(["﻿" + csv([cab, ...corpo])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historico-de-vendas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 px-3 py-4 sm:p-6 lg:space-y-5" data-testid="historico-de-vendas">
      <header className="ds-entra">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Cartao indice={0} icone={Receipt} rotulo={t("Total de negociações")} valor={String(cartoes.total)} testid="cartao-total" />
        <Cartao
          indice={1}
          icone={CheckCircle}
          rotulo={t("Concluídas")}
          valor={String(cartoes.concluidas)}
          tomDoIcone="bg-success-bg text-success-fg"
          testid="cartao-concluidas"
        />
        <Cartao
          indice={2}
          icone={WarningOctagon}
          rotulo={t("Canceladas")}
          valor={String(cartoes.canceladas)}
          tomDoIcone="bg-error-bg text-error-fg"
          testid="cartao-canceladas"
        />
        <Cartao
          indice={3}
          icone={ChartLineUp}
          rotulo={t("Receita de vendas")}
          valor={formatarPreco(cartoes.receita)}
          tom="text-accent"
          nota={cartoes.investido > 0 ? `${t("Compras")}: ${formatarPreco(cartoes.investido)}` : undefined}
          testid="cartao-receita"
        />
      </div>

      <section
        aria-label={t("Filtros")}
        className="ds-entra grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 xl:grid-cols-[minmax(9rem,1fr)_minmax(0,2.5fr)_auto]"
        style={{ animationDelay: "200ms" }}
      >
        <label className="relative col-start-1 row-start-1 min-w-0">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar")}
            title={t("Buscar por cliente, telefone, veículo, placa ou número…")}
            className={`${CAMPO_DO_FILTRO} pl-9 text-base md:text-sm`}
            aria-label={t("Buscar")}
          />
        </label>
        <div className="col-span-full row-start-2 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:col-span-1 xl:col-start-2 xl:row-start-1">
          <Filtro rotulo={t("Tipo")} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="all">{t("Todos")}</option>
            <option value="venda">{t("Vendas")}</option>
            <option value="compra">{t("Compras")}</option>
          </Filtro>
          <Filtro rotulo={t("Situação")} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">{t("Todas")}</option>
            {(Object.keys(ROTULO_DO_STATUS_DA_NEGOCIACAO) as StatusDaNegociacao[]).map((s) => (
              <option key={s} value={s}>{t(ROTULO_DO_STATUS_DA_NEGOCIACAO[s])}</option>
            ))}
          </Filtro>
          <Filtro rotulo={t("Pagamento")} value={forma} onChange={(e) => setForma(e.target.value as typeof forma)}>
            <option value="all">{t("Todos")}</option>
            {FORMAS_DE_PAGAMENTO.map((f) => (
              <option key={f} value={f}>{t(ROTULO_DA_FORMA[f])}</option>
            ))}
          </Filtro>
          <Filtro rotulo={t("Ordem")} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            <option value="recente">{t("Mais recente")}</option>
            <option value="antiga">{t("Mais antiga")}</option>
            <option value="maior">{t("Maior valor")}</option>
            <option value="menor">{t("Menor valor")}</option>
          </Filtro>
        </div>
        <div className="col-start-2 row-start-1 flex items-center gap-1.5 xl:col-start-3">
          {filtrando ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-lg"
              onClick={limpar}
              aria-label={t("Limpar filtros")}
              title={t("Limpar filtros")}
            >
              <X aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-lg border-border/80 bg-surface px-2.5"
            onClick={exportar}
            disabled={lista.length === 0}
          >
            <DownloadSimple aria-hidden />
            {t("Exportar")}
          </Button>
        </div>
      </section>

      {lista.length === 0 ? (
        <div
          className="ds-entra flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-surface px-6 py-14 text-center"
          style={{ animationDelay: "250ms" }}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Receipt className="size-6" weight="duotone" aria-hidden />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            {negociacoes.length === 0
              ? t("Nenhuma negociação ainda. Abra o PDV para registrar a primeira venda.")
              : t("Nenhuma negociação com esses filtros.")}
          </p>
          {filtrando ? (
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={limpar}>
              {t("Limpar")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className="ds-entra overflow-x-auto rounded-xl border border-border/60 bg-surface shadow-xs"
          style={{ animationDelay: "250ms" }}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("Nº")}</th>
                <th className="px-4 py-3 font-medium">{t("Cliente")}</th>
                <th className="px-4 py-3 font-medium">{t("Veículo")}</th>
                <th className="px-4 py-3 font-medium">{t("Data")}</th>
                <th className="px-4 py-3 font-medium">{t("Pagamento")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("Total")}</th>
                <th className="px-4 py-3 font-medium">{t("Situação")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("Ações")}</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => (
                <tr
                  key={n.id}
                  className="border-t border-border/50 align-top transition-colors first:border-t-0 hover:bg-muted/50"
                  data-testid={`historico-${n.numero}`}
                >
                  <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{String(n.numero).padStart(4, "0")}</td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium">{n.cliente?.nome || t("Cliente não identificado")}</div>
                    {n.cliente?.telefone ? <div className="text-xs text-muted-foreground">{n.cliente.telefone}</div> : null}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          n.tipo === "venda" ? "bg-accent-soft text-accent" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {n.tipo === "venda" ? t("Venda") : t("Compra")}
                      </span>
                      <span>{tituloDoVeiculoDaNegociacao(n.veiculo) || "—"}</span>
                    </div>
                    {n.veiculo?.placa ? <div className="mt-0.5 text-xs text-muted-foreground">{n.veiculo.placa}</div> : null}
                    {n.troca?.modelo ? (
                      <div className="text-xs text-muted-foreground">{t("Troca")}: {tituloDoVeiculoDaNegociacao(n.troca)}</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                    {new Date(dataDaNegociacao(n)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3.5">{formasDe(n, t)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums">
                    {formatarPreco(resumoDaNegociacao(n).total_cents, n.moeda)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COR_DO_STATUS[n.status]}`}>
                      {t(ROTULO_DO_STATUS_DA_NEGOCIACAO[n.status])}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    {n.status !== "cancelada" ? (
                      <a
                        href={`/api/v1/pdv/negociacoes/${n.id}/contrato`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/30"
                      >
                        <FileText className="size-3.5" aria-hidden />
                        {t("Contrato")}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {podeExcluir ? <ExcluirNegociacao negociacao={n} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A lixeira da linha: abre o pop-up que exige o motivo, que fica no histórico de atividades. */
function ExcluirNegociacao({ negociacao }: { negociacao: Negociacao }) {
  const t = useT();
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  async function excluir(motivo: string) {
    try {
      await apiClient.delete(`/api/v1/pdv/negociacoes/${negociacao.id}`, { motivo });
    } catch (e) {
      showApiError(e);
      throw e;
    }
    toast.success(t("Venda excluída."));
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={t("Excluir venda")}
        title={t("Excluir venda")}
        className="ml-1 inline-flex items-center rounded-full p-1.5 align-middle text-muted-foreground transition-colors hover:bg-error-bg hover:text-error-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/30"
        data-testid={`excluir-negociacao-${negociacao.numero}`}
      >
        <Trash className="size-4" aria-hidden />
      </button>
      <DialogoDeMotivo
        aberto={aberto}
        aoMudar={setAberto}
        titulo={`${t("Excluir negociação")} #${negociacao.numero}`}
        descricao={
          negociacao.status === "concluida"
            ? t("Tudo é desfeito: o carro volta ao estoque, o carro da troca sai, parcelas pendentes são canceladas e os valores pagos são estornados no financeiro.")
            : t("A negociação some do histórico.")
        }
        aoConfirmar={excluir}
      />
    </>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  tom,
  tomDoIcone,
  icone: Icone,
  indice,
  testid,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  tom?: string;
  tomDoIcone?: string;
  icone: React.ComponentType<{ className?: string; weight?: "duotone"; "aria-hidden"?: boolean }>;
  indice: number;
  testid: string;
}) {
  return (
    <div
      className="ds-entra flex min-h-24 min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-surface p-3 shadow-xs md:p-3.5"
      style={{ animationDelay: `${indice * 50}ms` }}
      data-testid={testid}
    >
      <div className="flex items-center gap-2">
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ${tomDoIcone ?? "bg-accent-soft text-accent"}`}>
          <Icone className="size-4" weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 text-xs leading-tight text-muted-foreground sm:text-sm">{rotulo}</div>
      </div>
      <div className="mt-auto">
        <div className={`text-lg font-semibold tracking-tight break-words tabular-nums sm:text-2xl ${tom ?? ""}`}>{valor}</div>
        {nota ? <div className="text-xs text-muted-foreground">{nota}</div> : null}
      </div>
    </div>
  );
}
