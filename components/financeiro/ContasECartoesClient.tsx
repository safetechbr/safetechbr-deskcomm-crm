"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api/client";
import { disponivelCents, percentualUsado, somar } from "@/lib/financeiro/cartoes";
import { formatCentsBRL, mascararMoeda, parseReaisToCents } from "@/lib/money";
import { Bank, CreditCard, Plus } from "@/lib/ui/icons";

type Conta = {
  id: string;
  name: string;
  kind: "cash" | "bank" | "other";
  opening_balance_cents: number;
};
type Cartao = {
  id: string;
  name: string;
  last_digits: string | null;
  credit_limit_cents: number;
  closing_day: number;
  due_day: number;
  account_id: string;
};
type Resumo = {
  contas: { id: string; balance_cents: number }[];
  cartoes: { id: string; used_cents: number }[];
};

const TIPO_ROTULO: Record<Conta["kind"], string> = {
  cash: "Dinheiro",
  bank: "Conta bancária",
  other: "Outra",
};
const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

export function ContasECartoesClient() {
  const qc = useQueryClient();
  const [novaConta, setNovaConta] = useState<Conta | "nova" | null>(null);
  const [novoCartao, setNovoCartao] = useState<Cartao | "novo" | null>(null);

  const contas = useQuery({
    queryKey: ["financeiro-catalogo", "contas"],
    queryFn: async () =>
      (await apiClient.get<{ data: Conta[] }>("/api/v1/financeiro/catalogo/contas")).data,
  });
  const cartoes = useQuery({
    queryKey: ["financeiro-catalogo", "cartoes"],
    queryFn: async () =>
      (await apiClient.get<{ data: Cartao[] }>("/api/v1/financeiro/catalogo/cartoes")).data,
  });
  const resumo = useQuery({
    queryKey: ["financeiro-resumo"],
    queryFn: async () => (await apiClient.get<{ data: Resumo }>("/api/v1/financeiro/resumo")).data,
  });

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ["financeiro-catalogo"] });
    await qc.invalidateQueries({ queryKey: ["financeiro-resumo"] });
  };

  const saldo = (id: string) => resumo.data?.contas.find((c) => c.id === id)?.balance_cents ?? 0;
  const usado = (id: string) => resumo.data?.cartoes.find((c) => c.id === id)?.used_cents ?? 0;

  const listaContas = contas.data ?? [];
  const listaCartoes = cartoes.data ?? [];
  const limiteTotal = somar(listaCartoes.map((c) => c.credit_limit_cents));
  const usadoTotal = somar(listaCartoes.map((c) => usado(c.id)));

  return (
    <Tabs defaultValue="contas" className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="contas">Contas</TabsTrigger>
        <TabsTrigger value="cartoes">Cartões</TabsTrigger>
      </TabsList>

      <TabsContent value="contas" className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Resumo titulo="Contas ativas" valor={String(listaContas.length)} />
          <Resumo
            titulo="Saldo total"
            valor={formatCentsBRL(somar(listaContas.map((c) => saldo(c.id))))}
          />
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Suas contas</h2>
          <Button onClick={() => setNovaConta("nova")}>
            <Plus size={16} aria-hidden /> Nova conta
          </Button>
        </div>
        {listaContas.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma conta cadastrada. Crie uma para receber vendas e lançar entradas e saídas.
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {listaContas.map((c) => (
              <Card key={c.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Bank size={20} weight="duotone" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{TIPO_ROTULO[c.kind]}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setNovaConta(c)}>
                    Editar
                  </Button>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo atual</p>
                  <p className="text-xl font-semibold">{formatCentsBRL(saldo(c.id))}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="cartoes" className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Resumo titulo="Cartões ativos" valor={String(listaCartoes.length)} />
          <Resumo titulo="Limite total" valor={formatCentsBRL(limiteTotal)} />
          <Resumo titulo="Limite usado" valor={formatCentsBRL(usadoTotal)} />
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Seus cartões</h2>
          <Button onClick={() => setNovoCartao("novo")} disabled={listaContas.length === 0}>
            <Plus size={16} aria-hidden /> Novo cartão
          </Button>
        </div>
        {listaContas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Cadastre uma conta primeiro: é dela que a fatura do cartão é paga.
          </p>
        )}
        {listaCartoes.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum cartão cadastrado.
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {listaCartoes.map((c) => {
              const u = usado(c.id);
              const pct = percentualUsado(u, c.credit_limit_cents);
              return (
                <Card key={c.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <CreditCard size={20} weight="duotone" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      {c.last_digits && (
                        <p className="text-xs text-muted-foreground">**** {c.last_digits}</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setNovoCartao(c)}>
                      Editar
                    </Button>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Usado: {formatCentsBRL(u)}</span>
                    <span>Limite: {formatCentsBRL(c.credit_limit_cents)}</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-sm">
                    Disponível: {formatCentsBRL(disponivelCents(u, c.credit_limit_cents))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fecha dia {c.closing_day} · Vence dia {c.due_day}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </TabsContent>

      <ContaDialog
        key={typeof novaConta === "object" && novaConta ? novaConta.id : (novaConta ?? "x")}
        alvo={novaConta}
        onClose={() => setNovaConta(null)}
        onSalva={refrescar}
      />
      <CartaoDialog
        key={`c-${typeof novoCartao === "object" && novoCartao ? novoCartao.id : (novoCartao ?? "x")}`}
        alvo={novoCartao}
        contas={listaContas}
        onClose={() => setNovoCartao(null)}
        onSalvo={refrescar}
      />
    </Tabs>
  );
}

function Resumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
    </Card>
  );
}

function ContaDialog({
  alvo,
  onClose,
  onSalva,
}: {
  alvo: Conta | "nova" | null;
  onClose: () => void;
  onSalva: () => Promise<void>;
}) {
  const edicao = alvo && alvo !== "nova" ? alvo : null;
  const [nome, setNome] = useState(edicao?.name ?? "");
  const [tipo, setTipo] = useState<Conta["kind"]>(edicao?.kind ?? "bank");
  const [inicial, setInicial] = useState(
    edicao ? String(edicao.opening_balance_cents / 100).replace(".", ",") : "",
  );
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: async () => {
      const cents = inicial.trim() ? parseReaisToCents(inicial) : 0;
      if (cents === null || cents === undefined || Number.isNaN(cents)) throw new Error("Saldo inicial inválido.");
      const corpo = { name: nome, kind: tipo, opening_balance_cents: cents };
      if (edicao) await apiClient.patch("/api/v1/financeiro/catalogo/contas", { id: edicao.id, ...corpo });
      else await apiClient.post("/api/v1/financeiro/catalogo/contas", corpo);
    },
    onSuccess: async () => {
      toast.success(edicao ? "Conta atualizada." : "Conta criada.");
      await onSalva();
      onClose();
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível salvar a conta."),
  });

  return (
    <Dialog open={alvo !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edicao ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>
            Vendas do PDV e lançamentos entram na conta escolhida.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="conta-nome">Nome</Label>
            <Input id="conta-nome" value={nome} placeholder="Ex.: Banco do Brasil" onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="conta-tipo">Tipo</Label>
              <select id="conta-tipo" className={SELECT_CLASS} value={tipo} onChange={(e) => setTipo(e.target.value as Conta["kind"])}>
                {(Object.keys(TIPO_ROTULO) as Conta["kind"][]).map((k) => (
                  <option key={k} value={k}>
                    {TIPO_ROTULO[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="conta-inicial">Saldo inicial (R$)</Label>
              <Input id="conta-inicial" inputMode="decimal" value={inicial} placeholder="0,00" onChange={(e) => setInicial(mascararMoeda(e.target.value))} />
            </div>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CartaoDialog({
  alvo,
  contas,
  onClose,
  onSalvo,
}: {
  alvo: Cartao | "novo" | null;
  contas: Conta[];
  onClose: () => void;
  onSalvo: () => Promise<void>;
}) {
  const edicao = alvo && alvo !== "novo" ? alvo : null;
  const [nome, setNome] = useState(edicao?.name ?? "");
  const [digitos, setDigitos] = useState(edicao?.last_digits ?? "");
  const [limite, setLimite] = useState(
    edicao ? String(edicao.credit_limit_cents / 100).replace(".", ",") : "",
  );
  const [fecha, setFecha] = useState(String(edicao?.closing_day ?? 1));
  const [vence, setVence] = useState(String(edicao?.due_day ?? 10));
  const [contaId, setContaId] = useState(edicao?.account_id ?? "");
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: async () => {
      const cents = limite.trim() ? parseReaisToCents(limite) : 0;
      if (cents === null || cents === undefined || Number.isNaN(cents)) throw new Error("Limite inválido.");
      const corpo = {
        name: nome,
        last_digits: digitos.trim() || null,
        credit_limit_cents: cents,
        closing_day: Number(fecha),
        due_day: Number(vence),
        account_id: contaId || contas[0]?.id,
      };
      if (edicao) await apiClient.patch("/api/v1/financeiro/catalogo/cartoes", { id: edicao.id, ...corpo });
      else await apiClient.post("/api/v1/financeiro/catalogo/cartoes", corpo);
    },
    onSuccess: async () => {
      toast.success(edicao ? "Cartão atualizado." : "Cartão criado.");
      await onSalvo();
      onClose();
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível salvar o cartão."),
  });

  return (
    <Dialog open={alvo !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edicao ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          <DialogDescription>
            Compras no cartão ficam pendentes na conta que paga a fatura.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cartao-nome">Nome</Label>
              <Input id="cartao-nome" value={nome} placeholder="Ex.: Nubank Empresa" onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cartao-digitos">Últimos 4 dígitos</Label>
              <Input id="cartao-digitos" inputMode="numeric" maxLength={4} value={digitos} placeholder="1234" onChange={(e) => setDigitos(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cartao-limite">Limite (R$)</Label>
            <Input id="cartao-limite" inputMode="decimal" value={limite} placeholder="0,00" onChange={(e) => setLimite(mascararMoeda(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cartao-fecha">Dia do fechamento</Label>
              <Input id="cartao-fecha" type="number" min={1} max={31} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cartao-vence">Dia do vencimento</Label>
              <Input id="cartao-vence" type="number" min={1} max={31} value={vence} onChange={(e) => setVence(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cartao-conta">Conta que paga a fatura</Label>
            <select id="cartao-conta" className={SELECT_CLASS} value={contaId || contas[0]?.id || ""} onChange={(e) => setContaId(e.target.value)}>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
