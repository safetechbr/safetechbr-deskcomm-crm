"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import {
  agruparPorDia,
  calcularTotais,
  filtrar,
  FILTROS_VAZIOS,
  intervaloDoMes,
  mesAnterior,
  mesSeguinte,
  rotuloDoDia,
  rotuloDoMes,
  type Filtros,
  type Movimentacao,
} from "@/lib/financeiro/movimentacoes";
import { formatCentsBRL, mascararMoeda, parseReaisToCents } from "@/lib/money";
import { CaretLeft, CaretRight, DotsThree, Plus } from "@/lib/ui/icons";

type Conta = { id: string; name: string };
type Plano = { id: string; name: string; direction: string | null };

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MovimentacoesClient() {
  const qc = useQueryClient();
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [novo, setNovo] = useState<"in" | "out" | null>(null);
  const { de, ate } = intervaloDoMes(ano, mes);

  const lista = useQuery({
    queryKey: ["financeiro-movimentacoes", de, ate],
    queryFn: async () =>
      (
        await apiClient.get<{ data: Movimentacao[] }>(
          `/api/v1/financeiro/lancamentos?de=${de}&ate=${ate}`,
        )
      ).data,
  });
  const contas = useQuery({
    queryKey: ["financeiro-catalogo", "contas"],
    queryFn: async () =>
      (await apiClient.get<{ data: Conta[] }>("/api/v1/financeiro/catalogo/contas")).data,
  });
  const cartoes = useQuery({
    queryKey: ["financeiro-catalogo", "cartoes"],
    queryFn: async () =>
      (await apiClient.get<{ data: { id: string; name: string }[] }>("/api/v1/financeiro/catalogo/cartoes")).data,
  });
  const planos = useQuery({
    queryKey: ["financeiro-catalogo", "planos_de_conta"],
    queryFn: async () =>
      (await apiClient.get<{ data: Plano[] }>("/api/v1/financeiro/catalogo/planos_de_conta")).data,
  });

  const itens = useMemo(() => lista.data ?? [], [lista.data]);
  const visiveis = useMemo(() => filtrar(itens, filtros), [itens, filtros]);
  const totais = useMemo(() => calcularTotais(visiveis), [visiveis]);
  const dias = useMemo(() => agruparPorDia(visiveis), [visiveis]);
  const nomeConta = (id: string) => contas.data?.find((c) => c.id === id)?.name ?? "—";
  const nomePlano = (id: string | null) =>
    id ? (planos.data?.find((p) => p.id === id)?.name ?? null) : null;

  const refrescar = () => qc.invalidateQueries({ queryKey: ["financeiro-movimentacoes"] });

  const pagar = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/api/v1/financeiro/lancamentos/${id}`, { pay: true }),
    onSuccess: () => {
      toast.success("Marcado como pago.");
      void refrescar();
    },
    onError: () => toast.error("Não foi possível marcar como pago."),
  });
  const excluir = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/financeiro/lancamentos/${id}`),
    onSuccess: () => {
      toast.success("Movimentação excluída.");
      void refrescar();
    },
    onError: () => toast.error("Não foi possível excluir."),
  });

  const cards: { rotulo: string; valor: number; cor: string }[] = [
    { rotulo: "Receitas", valor: totais.receitas, cor: "text-emerald-600" },
    { rotulo: "Despesas", valor: totais.despesas, cor: "text-red-600" },
    { rotulo: "Receitas pendentes", valor: totais.receitasPendentes, cor: "text-emerald-600/70" },
    { rotulo: "Despesas pendentes", valor: totais.despesasPendentes, cor: "text-red-600/70" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => {
              const p = mesAnterior(ano, mes);
              setAno(p.ano);
              setMes(p.mes);
            }}
          >
            <CaretLeft size={16} aria-hidden />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">{rotuloDoMes(ano, mes)}</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próximo mês"
            onClick={() => {
              const p = mesSeguinte(ano, mes);
              setAno(p.ano);
              setMes(p.mes);
            }}
          >
            <CaretRight size={16} aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-emerald-600/40 text-emerald-600 hover:text-emerald-600"
            onClick={() => setNovo("in")}
          >
            <Plus size={16} className="mr-1" aria-hidden />
            Nova entrada
          </Button>
          <Button
            variant="outline"
            className="border-red-600/40 text-red-600 hover:text-red-600"
            onClick={() => setNovo("out")}
          >
            <Plus size={16} className="mr-1" aria-hidden />
            Nova saída
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.rotulo} className="p-4">
            <p className="text-xs text-muted-foreground">{c.rotulo}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${c.cor}`}>
              {formatCentsBRL(c.valor)}
            </p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Tipo"
          className={SELECT_CLASS}
          value={filtros.direction}
          onChange={(e) => setFiltros({ ...filtros, direction: e.target.value as Filtros["direction"] })}
        >
          <option value="all">Todos os tipos</option>
          <option value="in">Receitas</option>
          <option value="out">Despesas</option>
        </select>
        <select
          aria-label="Status"
          className={SELECT_CLASS}
          value={filtros.status}
          onChange={(e) => setFiltros({ ...filtros, status: e.target.value as Filtros["status"] })}
        >
          <option value="all">Todos os status</option>
          <option value="paid">Pagos</option>
          <option value="pending">Pendentes</option>
        </select>
        <select
          aria-label="Categoria"
          className={SELECT_CLASS}
          value={filtros.planoId}
          onChange={(e) => setFiltros({ ...filtros, planoId: e.target.value })}
        >
          <option value="">Todas as categorias</option>
          {(planos.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Conta"
          className={SELECT_CLASS}
          value={filtros.contaId}
          onChange={(e) => setFiltros({ ...filtros, contaId: e.target.value })}
        >
          <option value="">Todas as contas</option>
          {(contas.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          {visiveis.length === 1
            ? "1 movimentação encontrada"
            : `${visiveis.length} movimentações encontradas`}
        </span>
      </div>

      {lista.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : lista.isError ? (
        <p className="py-8 text-center text-sm text-red-600">Não foi possível carregar as movimentações.</p>
      ) : dias.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {contas.data && contas.data.length === 0
            ? "Cadastre uma conta em Configurações › Financeiro para começar a lançar."
            : "Nenhuma movimentação neste mês."}
        </Card>
      ) : (
        dias.map((d) => (
          <section key={d.dia} className="flex flex-col gap-1">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {rotuloDoDia(d.dia)}
            </h2>
            <Card className="divide-y">
              {d.itens.map((i) => {
                const entrada = i.direction === "in";
                const categoria = nomePlano(i.account_plan_id);
                return (
                  <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {i.description || (entrada ? "Receita" : "Despesa")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[categoria, nomeConta(i.account_id)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge variant={i.status === "paid" ? "default" : "secondary"}>
                      {i.status === "paid" ? "Pago" : "Pendente"}
                    </Badge>
                    <span
                      className={`w-28 text-right text-sm font-semibold tabular-nums ${entrada ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {entrada ? "+" : "−"} {formatCentsBRL(i.amount_cents)}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Ações">
                          <DotsThree size={18} weight="bold" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {i.status === "pending" && (
                          <DropdownMenuItem onSelect={() => pagar.mutate(i.id)}>
                            Marcar como pago
                          </DropdownMenuItem>
                        )}
                        {i.status === "pending" && i.origin === "manual" && (
                          <DropdownMenuItem onSelect={() => excluir.mutate(i.id)}>
                            Excluir
                          </DropdownMenuItem>
                        )}
                        {i.status === "paid" && (
                          <DropdownMenuItem disabled>Pago não pode ser alterado</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </Card>
          </section>
        ))
      )}

      <NovaMovimentacao
        key={novo ?? "fechado"}
        aberto={novo !== null}
        direcaoInicial={novo ?? "out"}
        onClose={() => setNovo(null)}
        contas={contas.data ?? []}
        cartoes={cartoes.data ?? []}
        planos={planos.data ?? []}
        onCriada={() => void refrescar()}
      />
    </div>
  );
}

function NovaMovimentacao({
  aberto,
  direcaoInicial,
  onClose,
  contas,
  cartoes,
  planos,
  onCriada,
}: {
  aberto: boolean;
  direcaoInicial: "in" | "out";
  onClose: () => void;
  contas: Conta[];
  cartoes: { id: string; name: string }[];
  planos: Plano[];
  onCriada: () => void;
}) {
  const [direction, setDirection] = useState<"in" | "out">(direcaoInicial);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [contaId, setContaId] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [cartaoId, setCartaoId] = useState("");
  const [pago, setPago] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const planosDoTipo = planos.filter((p) => !p.direction || p.direction === direction);

  // Cartão só aceita saída; a compra fica pendente até a fatura ser paga.
  const noCartao = direction === "out" && cartaoId !== "";

  const criar = useMutation({
    mutationFn: async () => {
      const cents = parseReaisToCents(valor);
      if (!cents || cents <= 0) throw new Error("Informe um valor maior que zero.");
      const conta = contaId || contas[0]?.id;
      if (!conta && !noCartao) throw new Error("Cadastre uma conta em Configurações › Financeiro.");
      await apiClient.post("/api/v1/financeiro/lancamentos", {
        account_id: noCartao ? undefined : conta,
        card_id: noCartao ? cartaoId : undefined,
        account_plan_id: planoId || undefined,
        direction,
        amount_cents: cents,
        description: descricao.trim() || undefined,
        entry_date: data,
        status: pago && !noCartao ? "paid" : "pending",
      });
    },
    onSuccess: () => {
      toast.success("Movimentação lançada.");
      setDescricao("");
      setValor("");
      setErro(null);
      onCriada();
      onClose();
    },
    onError: (e: unknown) =>
      setErro(e instanceof Error ? e.message : "Não foi possível lançar a movimentação."),
  });

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{direction === "in" ? "Nova entrada" : "Nova saída"}</DialogTitle>
          <DialogDescription>Registre uma receita ou despesa da empresa.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={direction === "out" ? "default" : "outline"}
              onClick={() => setDirection("out")}
            >
              Saída
            </Button>
            <Button
              type="button"
              variant={direction === "in" ? "default" : "outline"}
              onClick={() => setDirection("in")}
            >
              Entrada
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mov-desc">Descrição</Label>
            <Input
              id="mov-desc"
              value={descricao}
              placeholder="Ex.: Aluguel, energia, salário"
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="mov-valor">Valor (R$)</Label>
              <Input
                id="mov-valor"
                inputMode="decimal"
                value={valor}
                placeholder="0,00"
                onChange={(e) => setValor(mascararMoeda(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mov-data">Data</Label>
              <Input id="mov-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="mov-conta">Conta</Label>
              <select
                id="mov-conta"
                className={SELECT_CLASS}
                value={contaId || contas[0]?.id || ""}
                onChange={(e) => setContaId(e.target.value)}
              >
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mov-plano">Categoria</Label>
              <select
                id="mov-plano"
                className={SELECT_CLASS}
                value={planoId}
                onChange={(e) => setPlanoId(e.target.value)}
              >
                <option value="">Sem categoria</option>
                {planosDoTipo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {direction === "out" && cartoes.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="mov-cartao">Pagar com cartão</Label>
              <select
                id="mov-cartao"
                className={SELECT_CLASS}
                value={cartaoId}
                onChange={(e) => setCartaoId(e.target.value)}
              >
                <option value="">Não, sai da conta</option>
                {cartoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!noCartao && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} />
              Já está pago
            </label>
          )}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
            Lançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
