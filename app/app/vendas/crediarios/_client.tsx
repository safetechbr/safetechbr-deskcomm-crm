"use client";
import { centavosParaMascara, mascararMoeda, parseReaisToCents } from "@/lib/money";
import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { formatarPreco } from "@/lib/veiculos/regras";
import { type Crediario, type ParcelaCrediario } from "@/lib/pdv/crediario";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const moeda = formatarPreco;
function hoje() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function data(v: string) {
  return (v ?? "").split("-").reverse().join("/");
}
function soma(ps: ParcelaCrediario[]) {
  return ps.reduce((a, p) => a + p.amount_cents, 0);
}
export function CrediariosClient({
  podeReceber,
  podeEditar,
}: {
  podeReceber: boolean;
  podeEditar: boolean;
}) {
  const [lista, setLista] = useState<Crediario[]>([]),
    [erro, setErro] = useState(false),
    [carregando, setCarregando] = useState(true),
    [busca, setBusca] = useState(""),
    [aba, setAba] = useState("pendentes"),
    [ocupado, setOcupado] = useState(false);
  const [editar, setEditar] = useState<Crediario | null>(null),
    [abaEdicao, setAbaEdicao] = useState("configuracao"),
    [qtd, setQtd] = useState(1),
    [venc, setVenc] = useState(hoje()),
    [juros, setJuros] = useState("0");
  const [parcela, setParcela] = useState<ParcelaCrediario | null>(null),
    [valor, setValor] = useState(""),
    [dataParcela, setDataParcela] = useState("");
  const carregar = useCallback(async () => {
    setErro(false);
    setCarregando(true);
    try {
      const r = await apiClient.get<{ data: Crediario[] }>("/api/v1/pdv/crediarios");
      setLista(r.data);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  async function operar(v: Crediario, dados: Record<string, unknown>) {
    setOcupado(true);
    try {
      await apiClient.post(`/api/v1/pdv/crediarios/${v.id}`, dados);
      setParcela(null);
      setEditar(null);
      await carregar();
      toast.success("Crediário atualizado.");
    } catch (e) {
      showApiError(e);
    } finally {
      setOcupado(false);
    }
  }
  const pendentes = lista.filter((v) => v.parcelas.some((p) => p.status === "pending"));
  const finalizados = lista.filter((v) => v.parcelas.every((p) => p.status === "paid"));
  const vencidas = lista.flatMap((v) =>
    v.parcelas.filter((p) => p.status === "pending" && p.due_date < hoje()).map((p) => ({ v, p })),
  );
  const ps = lista.flatMap((v) => v.parcelas).filter((p) => p.status === "pending");
  const filtrada = (aba === "finalizados" ? finalizados : pendentes).filter((v) =>
    `${v.cliente.nome} ${v.numero}`.toLowerCase().includes(busca.toLowerCase()),
  );
  function abrir(v: Crediario) {
    setEditar(v);
    setAbaEdicao("configuracao");
    setQtd(v.parcelas.filter((p) => p.status === "pending").length);
    setVenc(hoje());
    setJuros("0");
  }
  function tabela(v: Crediario, edicao = false) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              {["Parcela", "Vencimento", "Valor", "Pagamento", "Status", "Ações"].map((c) => (
                <th key={c} className="p-3">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.parcelas.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.parcela_numero ? `${p.parcela_numero}ª` : "Entrada"}</td>
                <td>{data(p.due_date)}</td>
                <td>{moeda(p.amount_cents)}</td>
                <td>{p.paid_at ? data(p.paid_at.slice(0, 10)) : "—"}</td>
                <td>
                  {p.status === "paid" ? "Pago" : p.due_date < hoje() ? "Vencido" : "Pendente"}
                </td>
                <td>
                  {p.status === "pending" &&
                    (edicao
                      ? podeEditar && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setParcela(p);
                              setValor(centavosParaMascara(p.amount_cents));
                              setDataParcela(p.due_date);
                            }}
                          >
                            Editar parcela
                          </Button>
                        )
                      : podeReceber && (
                          <Button
                            size="sm"
                            disabled={ocupado}
                            onClick={() =>
                              void operar(v, { operacao: "receber", parcela_id: p.id })
                            }
                          >
                            Receber
                          </Button>
                        ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="space-y-5 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Crediários</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Pendentes", pendentes.length],
          ["Vencidos", vencidas.length],
          ["A Receber", moeda(soma(ps))],
          ["Em Atraso", moeda(soma(vencidas.map((x) => x.p)))],
        ].map(([titulo, total], i) => (
          <div
            key={titulo}
            className={`rounded-2xl border p-5 ${i === 2 ? "border-green-200 bg-green-50 text-green-700" : i === 1 || i === 3 ? "border-red-200 bg-red-50 text-red-600" : "border-accent/20 bg-accent-soft text-accent"}`}
          >
            <p className="mb-2 text-xs">{titulo}</p>
            <strong>{total}</strong>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Input
          aria-label="Buscar crediários"
          placeholder="Buscar cliente ou venda"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm rounded-full"
        />
        <Button
          variant="outline"
          className="ml-auto rounded-full"
          onClick={() => void carregar()}
          disabled={carregando}
        >
          Atualizar
        </Button>
      </div>
      <div
        role="tablist"
        aria-label="Situação dos crediários"
        className="grid grid-cols-3 rounded-full bg-muted p-1"
      >
        {[
          ["pendentes", `Pendentes ${pendentes.length}`],
          ["vencidos", `Vencidos ${vencidas.length}`],
          ["finalizados", `Finalizados ${finalizados.length}`],
        ].map(([id, nome]) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id ?? "pendentes")}
            className={`rounded-full px-3 py-2 text-sm ${aba === id ? "bg-background shadow-xs" : ""}`}
          >
            {nome}
          </button>
        ))}
      </div>
      {erro ? (
        <p role="alert">
          Não foi possível carregar os crediários. Use Atualizar para tentar novamente.
        </p>
      ) : carregando ? (
        <p>Carregando crediários…</p>
      ) : aba === "vencidos" ? (
        <div className="space-y-3">
          {vencidas
            .filter(({ v }) => v.cliente.nome.toLowerCase().includes(busca.toLowerCase()))
            .map(({ v, p }) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 p-4"
              >
                <div className="flex-1">
                  <strong className="text-sm">{v.cliente.nome}</strong>
                  <p className="text-xs text-red-600">Vencido em {data(p.due_date)}</p>
                </div>
                <strong className="text-red-600">{moeda(p.amount_cents)}</strong>
                {podeReceber && (
                  <Button
                    size="sm"
                    disabled={ocupado}
                    onClick={() => void operar(v, { operacao: "receber", parcela_id: p.id })}
                  >
                    Receber
                  </Button>
                )}
              </div>
            ))}
          {!vencidas.length && <p>Nenhuma parcela vencida.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtrada.map((v) => (
            <article
              key={v.id}
              className={`rounded-2xl border bg-surface p-4 ${aba === "finalizados" ? "border-green-200" : ""}`}
            >
              <div className="flex items-center gap-3">
                <h2 className="flex-1 text-sm font-medium">
                  {v.cliente.nome} · Venda #{v.numero}
                </h2>
                {podeEditar && aba !== "finalizados" && (
                  <Button size="sm" variant="outline" onClick={() => abrir(v)}>
                    Editar
                  </Button>
                )}
                <span className="rounded-full bg-muted px-2 text-xs">
                  {aba === "finalizados"
                    ? "Quitado"
                    : v.parcelas.some((p) => p.status === "pending" && p.due_date < hoje())
                      ? "Em atraso"
                      : "Em dia"}
                </span>
              </div>
              <div className="my-4 grid grid-cols-3 text-sm">
                {[
                  ["Total", soma(v.parcelas)],
                  ["Pago", soma(v.parcelas.filter((p) => p.status === "paid"))],
                  ["Saldo", soma(v.parcelas.filter((p) => p.status === "pending"))],
                ].map(([label, vl], i) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <strong className={i === 1 ? "text-green-600" : i === 2 ? "text-accent" : ""}>
                      {moeda(Number(vl))}
                    </strong>
                  </div>
                ))}
              </div>
              <details>
                <summary className="cursor-pointer rounded-full bg-muted/40 px-3 py-2 text-xs">
                  {aba === "finalizados" ? "Histórico de Parcelas" : "Parcelas"} (
                  {v.parcelas.length})
                </summary>
                {tabela(v)}
              </details>
            </article>
          ))}
          {!filtrada.length && <p>Nenhum crediário encontrado.</p>}
        </div>
      )}
      <Dialog
        open={!!editar}
        onOpenChange={(open) => {
          if (!open && !ocupado) {
            setEditar(null);
            setParcela(null);
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Crediário — {editar?.cliente.nome}</DialogTitle>
            <DialogDescription>
              Parcelas pagas são preservadas. Somente parcelas pendentes podem ser alteradas.
            </DialogDescription>
          </DialogHeader>
          {editar && (
            <>
              <div className="grid grid-cols-2 rounded-full bg-muted p-1">
                {[
                  ["configuracao", "Configuração"],
                  ["parcelas", "Parcelas"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setAbaEdicao(id ?? "configuracao")}
                    className={`rounded-full py-2 text-sm ${abaEdicao === id ? "bg-background" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {abaEdicao === "parcelas" ? (
                <>
                  {tabela(editar, true)}
                  {parcela && (
                    <form
                      className="space-y-3 rounded-xl border p-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void operar(editar, {
                          operacao: "editar",
                          parcela_id: parcela.id,
                          valor_cents: parseReaisToCents(valor) ?? 0,
                          vencimento: dataParcela,
                        });
                      }}
                    >
                      <label className="block text-sm">
                        Valor da parcela
                        <Input
                          required
                          inputMode="decimal"
                          value={valor}
                          onChange={(e) => setValor(mascararMoeda(e.target.value))}
                        />
                      </label>
                      <label className="block text-sm">
                        Vencimento
                        <Input
                          required
                          type="date"
                          value={dataParcela}
                          onChange={(e) => setDataParcela(e.target.value)}
                        />
                      </label>
                      <Button disabled={ocupado}>Salvar parcela</Button>
                    </form>
                  )}
                </>
              ) : (
                <form
                  className="space-y-4 rounded-2xl border p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void operar(editar, {
                      operacao: "recalcular",
                      parcelas: qtd,
                      vencimento: venc,
                      juros_bps: Math.round(Number(juros) * 100),
                    });
                  }}
                >
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      Total da Venda
                      <strong className="block">{moeda(soma(editar.parcelas))}</strong>
                    </div>
                    <div className="text-green-600">
                      Total Pago
                      <strong className="block">
                        {moeda(soma(editar.parcelas.filter((p) => p.status === "paid")))}
                      </strong>
                    </div>
                    <div className="text-accent">
                      Saldo Devedor
                      <strong className="block">
                        {moeda(soma(editar.parcelas.filter((p) => p.status === "pending")))}
                      </strong>
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold">Recalcular Parcelas</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                      Número de Parcelas
                      <Input
                        required
                        type="number"
                        min={1}
                        max={120}
                        value={qtd}
                        onChange={(e) => setQtd(Number(e.target.value))}
                      />
                    </label>
                    <label className="text-sm">
                      Primeiro Vencimento
                      <Input
                        required
                        type="date"
                        value={venc}
                        onChange={(e) => setVenc(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    Adicionar juros sobre o saldo (%)
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={juros}
                      onChange={(e) => setJuros(e.target.value)}
                    />
                  </label>
                  <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
                    Previsão: {qtd}x de aproximadamente{" "}
                    {moeda(
                      Math.round(
                        (soma(editar.parcelas.filter((p) => p.status === "pending")) *
                          (1 + Number(juros) / 100)) /
                          Math.max(qtd, 1),
                      ),
                    )}
                  </p>
                  <Button className="w-full rounded-full" disabled={ocupado}>
                    Recalcular Parcelas
                  </Button>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
