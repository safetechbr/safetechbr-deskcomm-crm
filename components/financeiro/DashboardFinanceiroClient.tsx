"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DashboardFinanceiro } from "@/app/api/v1/financeiro/dashboard/route";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import { somar } from "@/lib/financeiro/cartoes";
import {
  calcularCartoes,
  despesasPorCategoria,
  filtrarDash,
  FILTROS_DASH_VAZIOS,
  fluxoDeCaixa,
  type FiltrosDash,
} from "@/lib/financeiro/dashboard";
import { intervaloDoMes, mesAnterior, mesSeguinte, rotuloDoMes } from "@/lib/financeiro/movimentacoes";
import { formatCentsBRL } from "@/lib/money";
import { CaretLeft, CaretRight } from "@/lib/ui/icons";

type Item = { id: string; name: string };
type Resumo = {
  contas: { id: string; balance_cents: number }[];
  cartoes: { id: string; used_cents: number }[];
};

const CORES = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6", "#14b8a6", "#64748b"];
const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DashboardFinanceiroClient() {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [filtros, setFiltros] = useState<FiltrosDash>(FILTROS_DASH_VAZIOS);
  const { de, ate } = intervaloDoMes(ano, mes);

  const dados = useQuery({
    queryKey: ["financeiro-dashboard", de, ate],
    queryFn: async () =>
      (await apiClient.get<{ data: DashboardFinanceiro }>(`/api/v1/financeiro/dashboard?de=${de}&ate=${ate}`)).data,
  });
  const resumo = useQuery({
    queryKey: ["financeiro-resumo"],
    queryFn: async () => (await apiClient.get<{ data: Resumo }>("/api/v1/financeiro/resumo")).data,
  });
  const contas = useQuery({
    queryKey: ["financeiro-catalogo", "contas"],
    queryFn: async () => (await apiClient.get<{ data: Item[] }>("/api/v1/financeiro/catalogo/contas")).data,
  });
  const planos = useQuery({
    queryKey: ["financeiro-catalogo", "planos_de_conta"],
    queryFn: async () => (await apiClient.get<{ data: Item[] }>("/api/v1/financeiro/catalogo/planos_de_conta")).data,
  });

  const calculado = useMemo(() => {
    const periodo = filtrarDash(dados.data?.periodo ?? [], filtros);
    const pendentes = filtrarDash(dados.data?.pendentes ?? [], { ...filtros, status: "all" });
    const nomePlano = (id: string) => planos.data?.find((p) => p.id === id)?.name;
    return {
      cartoes: calcularCartoes(periodo, pendentes, hojeISO()),
      fluxo: fluxoDeCaixa(periodo).map((p) => ({ ...p, rotulo: `${p.dia.slice(8)}/${p.dia.slice(5, 7)}` })),
      categorias: despesasPorCategoria(periodo, nomePlano),
    };
  }, [dados.data, filtros, planos.data]);

  const saldoContas = somar((resumo.data?.contas ?? []).map((c) => c.balance_cents));
  const faturas = somar((resumo.data?.cartoes ?? []).map((c) => c.used_cents));
  const { cartoes: k } = calculado;
  const totalDespesas = somar(calculado.categorias.map((c) => c.total));
  const set = (p: Partial<FiltrosDash>) => setFiltros((f) => ({ ...f, ...p }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica titulo="Saldo em contas" valor={formatCentsBRL(saldoContas)} nota="Soma de todas as contas" />
        <Metrica titulo="Faturas de cartão" valor={formatCentsBRL(faturas)} nota="Total aberto em cartões" cor="text-orange-600" />
        <Metrica titulo="Previsão de entrada" valor={formatCentsBRL(k.previsaoEntrada)} nota="Próximos 7 dias" cor="text-green-600" />
        <Metrica
          titulo="Contas atrasadas"
          valor={formatCentsBRL(k.atrasadas.total)}
          nota={`${k.atrasadas.quantidade} conta(s) atrasada(s)`}
          cor="text-red-600"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Metrica titulo="Receitas no período" valor={formatCentsBRL(k.receitas)} cor="text-green-600" />
        <Metrica titulo="Despesas no período" valor={formatCentsBRL(k.despesas)} cor="text-red-600" />
        <Metrica
          titulo="Saldo do período"
          valor={formatCentsBRL(k.saldoPeriodo)}
          cor={k.saldoPeriodo < 0 ? "text-red-600" : "text-blue-600"}
        />
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Filtros</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => { const m = mesAnterior(ano, mes); setAno(m.ano); setMes(m.mes); }}>
            <CaretLeft size={16} aria-hidden />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{rotuloDoMes(ano, mes)}</span>
          <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => { const m = mesSeguinte(ano, mes); setAno(m.ano); setMes(m.mes); }}>
            <CaretRight size={16} aria-hidden />
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <select aria-label="Tipo" className={SELECT_CLASS} value={filtros.direction} onChange={(e) => set({ direction: e.target.value as FiltrosDash["direction"] })}>
            <option value="all">Todos os tipos</option>
            <option value="in">Entradas</option>
            <option value="out">Saídas</option>
          </select>
          <select aria-label="Status" className={SELECT_CLASS} value={filtros.status} onChange={(e) => set({ status: e.target.value as FiltrosDash["status"] })}>
            <option value="all">Todos os status</option>
            <option value="paid">Pagos</option>
            <option value="pending">Pendentes</option>
          </select>
          <select aria-label="Categoria" className={SELECT_CLASS} value={filtros.planoId} onChange={(e) => set({ planoId: e.target.value })}>
            <option value="">Todas as categorias</option>
            {(planos.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select aria-label="Conta" className={SELECT_CLASS} value={filtros.contaId} onChange={(e) => set({ contaId: e.target.value })}>
            <option value="">Todas as contas</option>
            {(contas.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2 p-4">
          <div>
            <h2 className="font-semibold">Fluxo de caixa</h2>
            <p className="text-sm text-muted-foreground">Receitas vs despesas realizadas</p>
          </div>
          {calculado.fluxo.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem movimentações pagas no período.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calculado.fluxo}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${Math.round(v / 100000)}k`} />
                  <Tooltip formatter={(v) => formatCentsBRL(Number(v))} />
                  <Bar dataKey="receitas" name="Receitas" fill="#22c55e" />
                  <Bar dataKey="despesas" name="Despesas" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-2 p-4">
          <div>
            <h2 className="font-semibold">Despesas por categoria</h2>
            <p className="text-sm text-muted-foreground">Total: {formatCentsBRL(totalDespesas)}</p>
          </div>
          {calculado.categorias.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem despesas pagas no período.</p>
          ) : (
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="h-60 md:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={calculado.categorias} dataKey="total" nameKey="nome" innerRadius="55%" outerRadius="90%">
                      {calculado.categorias.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCentsBRL(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-1 flex-col gap-1 text-sm">
                {calculado.categorias.map((c, i) => (
                  <li key={c.nome} className="flex items-center gap-2">
                    <span className="size-3 rounded-sm" style={{ background: CORES[i % CORES.length] }} aria-hidden />
                    <span className="flex-1 truncate">{c.nome}</span>
                    <span className="text-muted-foreground">{c.percentual.toFixed(1)}%</span>
                    <span>{formatCentsBRL(c.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Metrica({ titulo, valor, nota, cor }: { titulo: string; valor: string; nota?: string; cor?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className={`text-2xl font-semibold ${cor ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </Card>
  );
}
