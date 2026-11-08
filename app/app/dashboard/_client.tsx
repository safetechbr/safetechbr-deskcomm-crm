"use client";

import Link from "next/link";
import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useT } from "@/hooks/i18n/useT";
import { montarMes, montarResumo, variacaoPercentual, type Periodo } from "@/lib/dashboard/resumo";
import {
  ROTULO_DA_FORMA,
  tituloDoVeiculoDaNegociacao,
  type FormaDePagamento,
  type Negociacao,
} from "@/lib/pdv/regras";
import {
  CalendarBlank,
  ChatsCircle,
  Eye,
  EyeSlash,
  Receipt,
  ShoppingCart,
  Storefront,
  Users,
} from "@/lib/ui/icons";
import { formatarPreco } from "@/lib/veiculos/regras";

const ACESSOS = [
  { href: "/app/estoque", rotulo: "Estoque", Icone: Storefront },
  { href: "/app/clientes", rotulo: "Clientes", Icone: Users },
  { href: "/app/nova-venda", rotulo: "Vendas", Icone: ShoppingCart },
  { href: "/app/inbox", rotulo: "Atendimento", Icone: ChatsCircle },
  { href: "/app/vendas/historico", rotulo: "Histórico de vendas", Icone: Receipt },
  { href: "/app/agenda", rotulo: "Agenda", Icone: CalendarBlank },
] as const;

type Aba = "geral" | "formas" | "modelos" | "recentes";

export function DashboardClient({
  negociacoes,
  estoque,
  totalDeContatos,
  titulo,
}: {
  negociacoes: Negociacao[];
  estoque: { disponivel: number; reservado: number; vendido: number };
  totalDeContatos: number;
  titulo: string;
}) {
  const t = useT();
  const [periodo, setPeriodo] = React.useState<Periodo>(7);
  const [oculto, setOculto] = React.useState(false);
  const [aba, setAba] = React.useState<Aba>("geral");
  const resumo = React.useMemo(
    () =>
      montarResumo(negociacoes, periodo, new Date(), (n) => tituloDoVeiculoDaNegociacao(n.veiculo)),
    [negociacoes, periodo],
  );
  const dinheiro = (cents: number) => (oculto ? "R$ •••••" : formatarPreco(cents));
  const numero = (n: number) => (oculto ? "•••" : String(n));

  const dVendas = variacaoPercentual(resumo.vendas_hoje, resumo.vendas_ontem);
  const dReceita = variacaoPercentual(resumo.receita_hoje_cents, resumo.receita_ontem_cents);
  const mes = React.useMemo(() => montarMes(negociacoes, new Date()), [negociacoes]);
  const dadosDoMes = mes.serie.map((p) => ({
    dia: p.dia.slice(8, 10),
    faturamento: p.acumulada_cents / 100,
  }));

  const dados = resumo.serie.map((p) => ({
    dia: `${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}`,
    vendas: p.vendas,
    receita: p.receita_cents / 100,
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8">
      <header className="editorial-hero space-y-3">
        <p className="editorial-eyebrow">{t("Sua operação, em um só lugar")}</p>
        <h1>
          {titulo} <span className="editorial-flourish">{t("em foco.")}</span>
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t(
            "Acompanhe as vendas, encontre seus clientes e mantenha cada atendimento em movimento.",
          )}
        </p>
      </header>
      <section aria-labelledby="acesso-rapido" className="flex flex-col gap-3">
        <h2 id="acesso-rapido" className="text-lg font-semibold">
          {t("Acesso rápido")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {ACESSOS.map(({ href, rotulo, Icone }) => (
            <Link
              key={href}
              href={href}
              className="editorial-shortcut flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
            >
              <Icone className="h-5 w-5 text-primary" aria-hidden />
              {t(rotulo)}
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="painel" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="painel" className="text-lg font-semibold">
            {t("Visão geral")}
          </h2>
          <button
            type="button"
            onClick={() => setOculto((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs hover:bg-muted"
          >
            {oculto ? (
              <Eye className="h-4 w-4" aria-hidden />
            ) : (
              <EyeSlash className="h-4 w-4" aria-hidden />
            )}
            {oculto ? t("Mostrar dados") : t("Ocultar dados")}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Cartao
            rotulo={t("Vendas hoje")}
            valor={numero(resumo.vendas_hoje)}
            variacao={dVendas}
            t={t}
          />
          <Cartao
            rotulo={t("Receita hoje")}
            valor={dinheiro(resumo.receita_hoje_cents)}
            variacao={dReceita}
            t={t}
          />
          <Cartao
            rotulo={t("Em estoque")}
            valor={numero(estoque.disponivel)}
            nota={`${estoque.reservado} ${t("reservados")}`}
          />
          <Cartao rotulo={t("Total de clientes")} valor={numero(totalDeContatos)} />
        </div>

        <section aria-labelledby="mes" className="editorial-panel p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="mes" className="font-semibold">
                {t("Evolução do mês")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {`${t("Do dia 1º até hoje")} · ${mes.serie.length} ${t("dias")}`}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-6 text-right">
              <div>
                <dt className="text-xs text-muted-foreground">{t("Faturamento")}</dt>
                <dd className="text-lg font-semibold">{dinheiro(mes.receita_cents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Lucro")}</dt>
                <dd className="text-lg font-semibold text-muted-foreground">—</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Despesas")}</dt>
                <dd className="text-lg font-semibold text-muted-foreground">—</dd>
              </div>
            </dl>
          </div>
          <div className="h-56 w-full">
            {oculto ? (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">
                {t("Dados ocultos")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosDoMes}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `R$ ${v >= 1000 ? `${v / 1000}k` : v}`}
                  />
                  <Tooltip formatter={(valor) => formatarPreco(Number(valor) * 100)} />
                  <Area
                    type="monotone"
                    dataKey="faturamento"
                    name={t("Faturamento")}
                    stroke="var(--editorial-pink)"
                    fill="var(--color-accent-soft)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Lucro e despesas aparecem aqui quando o menu Financeiro estiver preenchido.")}
          </p>
        </section>

        <div
          role="tablist"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4"
        >
          {(
            [
              ["geral", "Visão geral"],
              ["formas", "Formas de pagamento"],
              ["modelos", "Mais vendidos"],
              ["recentes", "Vendas recentes"],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={`rounded-md px-3 py-2 text-sm ${aba === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              {t(rotulo)}
            </button>
          ))}
        </div>

        <div className="editorial-panel p-5">
          {aba === "geral" ? (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{t("Desempenho de vendas")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("Evolução de volume e receita no período selecionado")}
                  </p>
                </div>
                <select
                  aria-label={t("Período")}
                  value={periodo}
                  onChange={(e) => setPeriodo(Number(e.target.value) as Periodo)}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  <option value={7}>{t("Últimos 7 dias")}</option>
                  <option value={15}>{t("Últimos 15 dias")}</option>
                  <option value={30}>{t("Últimos 30 dias")}</option>
                </select>
              </div>
              <div className="h-72 w-full">
                {oculto ? (
                  <p className="grid h-full place-items-center text-sm text-muted-foreground">
                    {t("Dados ocultos")}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dados}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="v" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="r"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => `R$ ${v >= 1000 ? `${v / 1000}k` : v}`}
                      />
                      <Tooltip
                        formatter={(valor, nome) =>
                          nome === "receita" ? formatarPreco(Number(valor) * 100) : String(valor)
                        }
                      />
                      <Area
                        yAxisId="v"
                        type="monotone"
                        dataKey="vendas"
                        name="vendas"
                        stroke="var(--color-text)"
                        fill="var(--color-accent-soft)"
                      />
                      <Area
                        yAxisId="r"
                        type="monotone"
                        dataKey="receita"
                        name="receita"
                        stroke="var(--editorial-pink)"
                        fill="transparent"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          ) : null}

          {aba === "formas" ? (
            resumo.formas_hoje.length === 0 ? (
              <Vazio texto={t("Nenhuma venda hoje.")} />
            ) : (
              <ul className="divide-y">
                {resumo.formas_hoje.map((f) => (
                  <li key={f.forma} className="flex justify-between py-2 text-sm">
                    <span>
                      {t(
                        f.forma === "troca"
                          ? "Troca"
                          : (ROTULO_DA_FORMA[f.forma as FormaDePagamento] ?? f.forma),
                      )}
                    </span>
                    <span className="font-medium">{dinheiro(f.valor_cents)}</span>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {aba === "modelos" ? (
            resumo.mais_vendidos.length === 0 ? (
              <Vazio texto={t("Nenhuma venda no período.")} />
            ) : (
              <ul className="divide-y">
                {resumo.mais_vendidos.map((m) => (
                  <li key={m.titulo} className="flex justify-between py-2 text-sm">
                    <span>{m.titulo}</span>
                    <span className="font-medium">{numero(m.quantidade)}</span>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {aba === "recentes" ? (
            resumo.recentes.length === 0 ? (
              <Vazio texto={t("Nenhuma venda recente.")} />
            ) : (
              <ul className="divide-y">
                {resumo.recentes.map((n) => (
                  <li key={n.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      #{n.numero} · {tituloDoVeiculoDaNegociacao(n.veiculo) || t("Veículo")}
                    </span>
                    <span className="shrink-0 font-medium">
                      {dinheiro(Math.max(0, n.valor_cents - (n.desconto_cents ?? 0)))}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{texto}</p>;
}

function Cartao({
  rotulo,
  valor,
  variacao,
  nota,
  t,
}: {
  rotulo: string;
  valor: string;
  variacao?: number | null;
  nota?: string;
  t?: (s: string) => string;
}) {
  return (
    <div className="editorial-metric">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{valor}</p>
      {variacao !== undefined ? (
        <p
          className={`mt-1 text-xs ${variacao === null ? "text-muted-foreground" : variacao >= 0 ? "text-success-fg" : "text-error-fg"}`}
        >
          {variacao === null
            ? "—"
            : `${variacao >= 0 ? "↑" : "↓"} ${variacao > 0 ? "+" : ""}${variacao}% ${t?.("vs ontem") ?? ""}`}
        </p>
      ) : nota ? (
        <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
      ) : null}
    </div>
  );
}
