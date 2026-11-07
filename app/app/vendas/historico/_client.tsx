"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
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

const COR_DO_STATUS: Record<StatusDaNegociacao, string> = {
  concluida: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rascunho: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cancelada: "bg-red-500/15 text-red-600 dark:text-red-400",
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
}: {
  negociacoes: Negociacao[];
  titulo: string;
  subtitulo: string;
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

  const seletor = "h-9 rounded-md border bg-background px-3 text-sm";

  return (
    <div className="space-y-6 p-6" data-testid="historico-de-vendas">
      <header>
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao rotulo={t("Total de negociações")} valor={String(cartoes.total)} testid="cartao-total" />
        <Cartao rotulo={t("Concluídas")} valor={String(cartoes.concluidas)} tom="text-emerald-500" testid="cartao-concluidas" />
        <Cartao rotulo={t("Canceladas")} valor={String(cartoes.canceladas)} tom="text-red-500" testid="cartao-canceladas" />
        <Cartao
          rotulo={t("Receita de vendas")}
          valor={formatarPreco(cartoes.receita)}
          nota={cartoes.investido > 0 ? `${t("Compras")}: ${formatarPreco(cartoes.investido)}` : undefined}
          testid="cartao-receita"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("Buscar por cliente, telefone, veículo, placa ou número…")}
          className="h-9 min-w-64 flex-1 rounded-md border bg-background px-3 text-sm"
          aria-label={t("Buscar")}
        />
        <select className={seletor} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label={t("Tipo")}>
          <option value="all">{t("Venda e compra")}</option>
          <option value="venda">{t("Vendas")}</option>
          <option value="compra">{t("Compras")}</option>
        </select>
        <select className={seletor} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t("Situação")}>
          <option value="all">{t("Todas as situações")}</option>
          {(Object.keys(ROTULO_DO_STATUS_DA_NEGOCIACAO) as StatusDaNegociacao[]).map((s) => (
            <option key={s} value={s}>{t(ROTULO_DO_STATUS_DA_NEGOCIACAO[s])}</option>
          ))}
        </select>
        <select className={seletor} value={forma} onChange={(e) => setForma(e.target.value as typeof forma)} aria-label={t("Pagamento")}>
          <option value="all">{t("Todos os pagamentos")}</option>
          {FORMAS_DE_PAGAMENTO.map((f) => (
            <option key={f} value={f}>{t(ROTULO_DA_FORMA[f])}</option>
          ))}
        </select>
        <select className={seletor} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label={t("Ordem")}>
          <option value="recente">{t("Mais recente")}</option>
          <option value="antiga">{t("Mais antiga")}</option>
          <option value="maior">{t("Maior valor")}</option>
          <option value="menor">{t("Menor valor")}</option>
        </select>
        {filtrando ? (
          <Button type="button" variant="ghost" size="sm" onClick={limpar}>{t("Limpar")}</Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={exportar} disabled={lista.length === 0}>
          {t("Exportar")}
        </Button>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          {negociacoes.length === 0
            ? t("Nenhuma negociação ainda. Abra o PDV para registrar a primeira venda.")
            : t("Nenhuma negociação com esses filtros.")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("Nº")}</th>
                <th className="px-4 py-3">{t("Cliente")}</th>
                <th className="px-4 py-3">{t("Veículo")}</th>
                <th className="px-4 py-3">{t("Data")}</th>
                <th className="px-4 py-3">{t("Pagamento")}</th>
                <th className="px-4 py-3 text-right">{t("Total")}</th>
                <th className="px-4 py-3">{t("Situação")}</th>
                <th className="px-4 py-3 text-right">{t("Ações")}</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => (
                <tr key={n.id} className="border-t align-top" data-testid={`historico-${n.numero}`}>
                  <td className="px-4 py-3 font-mono text-xs">{String(n.numero).padStart(4, "0")}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{n.cliente?.nome || t("Cliente não identificado")}</div>
                    {n.cliente?.telefone ? <div className="text-xs text-muted-foreground">{n.cliente.telefone}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                        {n.tipo === "venda" ? t("Venda") : t("Compra")}
                      </span>
                      <span>{tituloDoVeiculoDaNegociacao(n.veiculo) || "—"}</span>
                    </div>
                    {n.veiculo?.placa ? <div className="text-xs text-muted-foreground">{n.veiculo.placa}</div> : null}
                    {n.troca?.modelo ? (
                      <div className="text-xs text-muted-foreground">{t("Troca")}: {tituloDoVeiculoDaNegociacao(n.troca)}</div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(dataDaNegociacao(n)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">{formasDe(n, t)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    {formatarPreco(resumoDaNegociacao(n).total_cents, n.moeda)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COR_DO_STATUS[n.status]}`}>
                      {t(ROTULO_DO_STATUS_DA_NEGOCIACAO[n.status])}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {n.status !== "cancelada" ? (
                      <a
                        href={`/api/v1/pdv/negociacoes/${n.id}/contrato`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        {t("Contrato")}
                      </a>
                    ) : (
                      "—"
                    )}
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

function Cartao({
  rotulo,
  valor,
  nota,
  tom,
  testid,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  tom?: string;
  testid: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5" data-testid={testid}>
      <div className="text-sm text-muted-foreground">{rotulo}</div>
      <div className={`mt-2 text-3xl font-bold ${tom ?? ""}`}>{valor}</div>
      {nota ? <div className="mt-1 text-xs text-muted-foreground">{nota}</div> : null}
    </div>
  );
}
