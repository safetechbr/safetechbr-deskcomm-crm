"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OPERACOES, STATUS, chamar, reais } from "../_util";

type Campos = Record<string, string | number | null | undefined>;
interface Doc {
  id: string; operacao: string; status: string; numero: number | null; serie: number | null; chave: string | null;
  protocolo: string | null; valor_total_cents: number | null; ambiente: string; cfop: string | null;
  renave_status: string | null; entrega_enviada_em: string | null;
  motivo_rejeicao: string | null; autorizada_em: string | null; pendencias: string[];
  rascunho: { pessoa: Campos; veiculo: Campos };
  eventos: { id: string; tipo: string; sequencia: number | null; texto: string | null; status: string; data: string }[];
}

const PESSOA: [string, string][] = [
  ["nome", "Nome"], ["documento", "CPF/CNPJ"], ["cep", "CEP"], ["logradouro", "Rua"], ["numero", "Número"], ["bairro", "Bairro"],
  ["municipio", "Cidade"], ["codigo_municipio", "Código IBGE"], ["uf", "UF"], ["email", "E-mail (opcional)"],
];
const VEICULO: [string, string][] = [
  ["marca", "Marca"], ["modelo", "Modelo"], ["cor", "Cor"], ["chassi", "Chassi (17)"], ["placa", "Placa"], ["renavam", "Renavam"],
  ["ncm", "NCM (8)"], ["ano_fabricacao", "Ano fab."], ["ano_modelo", "Ano modelo"], ["km", "Km"],
];
const RENAVE: Record<string, string> = {
  pendente: "Na fila (será reenviado automaticamente)", enviado: "Enviado", erro: "Erro — veja com o suporte", desligado: "Desligado para esta loja",
};
const EVENTO: Record<string, string> = { aceito: "Aceito", rejeitado: "Rejeitado", pendente: "Pendente" };
const NUMEROS = new Set(["ano_fabricacao", "ano_modelo", "km"]);

export function DetalheFiscal({ id, podeAgir }: { id: string; podeAgir: boolean }) {
  const [d, setD] = useState<Doc | null>(null);
  const [ed, setEd] = useState<{ pessoa: Campos; veiculo: Campos } | null>(null);
  const [acao, setAcao] = useState<"cancelar" | "cce" | null>(null);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamar(`/api/v1/fiscal/documentos/${id}`, "GET");
    if (r.ok) { const doc = r.data as Doc; setD(doc); setEd({ pessoa: { ...doc.rascunho.pessoa }, veiculo: { ...doc.rascunho.veiculo } }); }
    else toast.error(r.msg ?? "Erro ao carregar.");
  }, [id]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function rodar(url: string, metodo: string, corpo: unknown, sucesso: string) {
    setBusy(true);
    const r = await chamar(url, metodo, corpo);
    setBusy(false);
    if (r.ok) { toast.success(sucesso); setAcao(null); setTexto(""); await carregar(); } else toast.error(r.msg ?? "Erro.");
  }

  if (!d || !ed) return <div className="p-6">Carregando…</div>;
  const base = `/api/v1/fiscal/documentos/${id}`;
  const editavel = podeAgir && (d.status === "rascunho" || d.status === "rejeitada");
  const autorizada = d.status === "autorizada";
  const set = (grupo: "pessoa" | "veiculo", k: string, v: string) =>
    setEd({ ...ed, [grupo]: { ...ed[grupo], [k]: NUMEROS.has(k) ? (v === "" ? null : Number(v)) : v } });

  const bloco = (titulo: string, grupo: "pessoa" | "veiculo", campos: [string, string][]) => (
    <Card className="p-4">
      <h2 className="mb-3 font-medium">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {campos.map(([k, rot]) => (
          <div key={k}><Label>{rot}</Label>
            <Input disabled={!editavel} value={String(ed[grupo][k] ?? "")} onChange={(e) => set(grupo, k, e.target.value)} /></div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <Link href="/app/fiscal" className="text-sm underline">← Notas fiscais</Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{OPERACOES[d.operacao] ?? d.operacao}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[d.status]?.cor ?? ""}`}>{STATUS[d.status]?.rotulo ?? d.status}</span>
        {d.ambiente === "homologacao" && <span className="text-xs text-muted-foreground">Ambiente de teste (sem valor fiscal)</span>}
      </header>

      <Card className="grid gap-2 p-4 text-sm sm:grid-cols-3">
        <div><span className="text-muted-foreground">Valor</span><br />{reais(d.valor_total_cents)}</div>
        <div><span className="text-muted-foreground">Número / série</span><br />{d.numero ?? "—"} / {d.serie ?? "—"}</div>
        <div><span className="text-muted-foreground">CFOP</span><br />{d.cfop ?? "—"}</div>
        <div className="sm:col-span-3 break-all"><span className="text-muted-foreground">Chave</span><br />{d.chave ?? "—"}</div>
      </Card>

      {autorizada && (
        <Card className="p-4 text-sm">
          <span className="text-muted-foreground">RENAVE:</span> {RENAVE[d.renave_status ?? ""] ?? "Não enviado"}
          {d.entrega_enviada_em && <> · <span className="text-muted-foreground">Enviado ao comprador em</span> {new Date(d.entrega_enviada_em).toLocaleString("pt-BR")}</>}
        </Card>
      )}

      {d.motivo_rejeicao && d.status === "rejeitada" && (
        <Card className="border-red-500/40 bg-red-500/5 p-4 text-sm"><strong>A SEFAZ recusou a nota:</strong> {d.motivo_rejeicao}<br />Corrija os dados abaixo e emita de novo.</Card>
      )}
      {editavel && d.pendencias.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <strong>Antes de emitir, resolva:</strong>
          <ul className="ml-5 mt-1 list-disc">{d.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
        </Card>
      )}

      {bloco(d.operacao === "SAI_VENDA" ? "Comprador" : "Vendedor", "pessoa", PESSOA)}
      {bloco("Veículo", "veiculo", VEICULO)}

      <div className="flex flex-wrap gap-2">
        {editavel && <Button variant="outline" disabled={busy} onClick={() => rodar(base, "PATCH", ed, "Dados salvos.")}>Salvar dados</Button>}
        {editavel && <Button disabled={busy} onClick={async () => {
          setBusy(true);
          const s = await chamar(base, "PATCH", ed);
          setBusy(false);
          if (!s.ok) return toast.error(s.msg ?? "Erro ao salvar.");
          await rodar(`${base}/emitir`, "POST", undefined, d.status === "rejeitada" ? "Nota reenviada." : "Nota enviada.");
        }}>{d.status === "rejeitada" ? "Reemitir após correção" : "Emitir"}</Button>}
        {(autorizada || d.status === "cancelada") && <>
          <Button variant="outline" asChild><a href={`${base}/xml`}>Baixar XML</a></Button>
          <Button variant="outline" asChild><a href={`${base}/danfe`}>Baixar DANFE</a></Button>
        </>}
        {autorizada && podeAgir && d.operacao === "SAI_VENDA" && (
          <Button variant="outline" disabled={busy} onClick={() => rodar(`${base}/entregar`, "POST", undefined, "Enviado ao comprador.")}>
            {d.entrega_enviada_em ? "Reenviar ao comprador" : "Enviar ao comprador"}
          </Button>
        )}
        {autorizada && podeAgir && <>
          <Button variant="outline" onClick={() => setAcao("cce")}>Carta de correção</Button>
          <Button variant="outline" onClick={() => setAcao("cancelar")}>Cancelar nota</Button>
        </>}
      </div>

      {acao && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {acao === "cancelar"
              ? "Só é possível cancelar até 24 horas depois da autorização. Depois disso será preciso emitir uma nota de devolução (em breve)."
              : "A carta de correção só altera textos. Ela NÃO corrige valor, CFOP, destinatário nem data."}
          </p>
          <Label>{acao === "cancelar" ? "Justificativa (mínimo 15 caracteres)" : "Texto da correção (mínimo 15 caracteres)"}</Label>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex gap-2">
            <Button disabled={busy || texto.trim().length < 15} onClick={() => acao === "cancelar"
              ? rodar(`${base}/cancelar`, "POST", { justificativa: texto }, "Nota cancelada.")
              : rodar(`${base}/carta-correcao`, "POST", { texto }, "Carta de correção registrada.")}>Confirmar</Button>
            <Button variant="ghost" onClick={() => setAcao(null)}>Voltar</Button>
          </div>
        </Card>
      )}

      {d.eventos.length > 0 && (
        <Card className="p-4 text-sm">
          <h2 className="mb-2 font-medium">Histórico</h2>
          <ul className="space-y-1">{d.eventos.map((e) => (
            <li key={e.id}>{new Date(e.data).toLocaleString("pt-BR")} · {e.tipo === "cce" ? `Carta de correção ${e.sequencia ?? ""}` : "Cancelamento"} · {EVENTO[e.status] ?? "Em análise"} — {e.texto}</li>
          ))}</ul>
        </Card>
      )}
    </div>
  );
}
