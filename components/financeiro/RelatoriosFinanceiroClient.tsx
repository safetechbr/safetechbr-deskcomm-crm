"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { DashboardFinanceiro } from "@/app/api/v1/financeiro/dashboard/route";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { intervaloDoMes, mesAnterior, mesSeguinte, rotuloDoMes } from "@/lib/financeiro/movimentacoes";
import { csvDaDre, dreDoPeriodo, type GrupoDre } from "@/lib/financeiro/relatorios";
import { formatCentsBRL } from "@/lib/money";
import { CaretLeft, CaretRight, DownloadSimple } from "@/lib/ui/icons";

type Item = { id: string; name: string };

export function RelatoriosFinanceiroClient() {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const { de, ate } = intervaloDoMes(ano, mes);

  // Mesmas queries do Dashboard: o cache do React Query é compartilhado.
  const dados = useQuery({
    queryKey: ["financeiro-dashboard", de, ate],
    queryFn: async () =>
      (await apiClient.get<{ data: DashboardFinanceiro }>(`/api/v1/financeiro/dashboard?de=${de}&ate=${ate}`)).data,
  });
  const planos = useQuery({
    queryKey: ["financeiro-catalogo", "planos_de_conta"],
    queryFn: async () => (await apiClient.get<{ data: Item[] }>("/api/v1/financeiro/catalogo/planos_de_conta")).data,
  });

  const dre = useMemo(
    () => dreDoPeriodo(dados.data?.periodo ?? [], (id) => planos.data?.find((p) => p.id === id)?.name),
    [dados.data, planos.data],
  );

  const baixarCsv = () => {
    const blob = new Blob(["﻿" + csvDaDre(dre)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-financeiro-${de.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const r = dre.resultado;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => { const m = mesAnterior(ano, mes); setAno(m.ano); setMes(m.mes); }}>
            <CaretLeft size={16} aria-hidden />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{rotuloDoMes(ano, mes)}</span>
          <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => { const m = mesSeguinte(ano, mes); setAno(m.ano); setMes(m.mes); }}>
            <CaretRight size={16} aria-hidden />
          </Button>
        </div>
        <Button variant="outline" onClick={baixarCsv} disabled={dados.isLoading}>
          <DownloadSimple size={16} aria-hidden /> Baixar CSV
        </Button>
      </div>

      {dados.isError ? (
        <Card className="p-4 text-sm text-red-600">Não foi possível carregar os lançamentos do período.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Categoria</th>
                <th className="px-4 py-2 text-right font-medium">Realizado</th>
                <th className="px-4 py-2 text-right font-medium">Previsto</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {dados.isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Carregando…</td>
                </tr>
              ) : (
                <>
                  <Grupo titulo="Receitas" grupo={dre.receitas} cor="text-green-600" />
                  <Grupo titulo="Despesas" grupo={dre.despesas} cor="text-red-600" />
                  <tr className="border-t-2 font-semibold">
                    <td className="px-4 py-3">Resultado (receitas − despesas)</td>
                    <Valor cents={r.realizado} sinal />
                    <Valor cents={r.previsto} sinal />
                    <Valor cents={r.realizado + r.previsto} sinal />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Realizado = lançamentos pagos. Previsto = pendentes com data de lançamento no mês.
      </p>
    </div>
  );
}

function Grupo({ titulo, grupo, cor }: { titulo: string; grupo: GrupoDre; cor: string }) {
  return (
    <>
      <tr className="border-t bg-muted/40">
        <td colSpan={4} className={`px-4 py-2 font-semibold ${cor}`}>{titulo}</td>
      </tr>
      {grupo.linhas.length === 0 ? (
        <tr>
          <td colSpan={4} className="px-4 py-2 text-muted-foreground">Nenhum lançamento.</td>
        </tr>
      ) : (
        grupo.linhas.map((l) => (
          <tr key={l.categoria} className="border-t border-border/50">
            <td className="px-4 py-2">{l.categoria}</td>
            <Valor cents={l.realizado} />
            <Valor cents={l.previsto} />
            <Valor cents={l.realizado + l.previsto} />
          </tr>
        ))
      )}
      <tr className="border-t font-medium">
        <td className="px-4 py-2">Total de {titulo.toLowerCase()}</td>
        <Valor cents={grupo.realizado} />
        <Valor cents={grupo.previsto} />
        <Valor cents={grupo.realizado + grupo.previsto} />
      </tr>
    </>
  );
}

function Valor({ cents, sinal }: { cents: number; sinal?: boolean }) {
  const cor = sinal ? (cents < 0 ? "text-red-600" : "text-blue-600") : "";
  return <td className={`px-4 py-2 text-right tabular-nums ${cor}`}>{formatCentsBRL(cents)}</td>;
}
