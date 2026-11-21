"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPERACOES, STATUS, chamar, reais } from "./_util";

interface Linha {
  id: string; operacao: string; status: string; numero: number | null; valor_total_cents: number | null;
  created_at: string; ambiente: string; motivo_rejeicao: string | null;
  rascunho: { veiculo?: { placa?: string; modelo?: string } } | null;
}

const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

export function ListaFiscal({ podeInutilizar }: { podeInutilizar: boolean }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [f, setF] = useState({ status: "", operacao: "", de: "", ate: "", q: "" });
  const [inut, setInut] = useState(false);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    const r = await chamar(`/api/v1/fiscal/documentos?${p}`, "GET");
    if (r.ok) setLinhas(r.data as Linha[]); else toast.error(r.msg ?? "Erro ao carregar.");
  }, [f]);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Notas fiscais</h1>
        {podeInutilizar && <Button variant="outline" onClick={() => setInut((v) => !v)}>Inutilizar numeração</Button>}
      </header>

      {inut && <Inutilizar onFim={() => { setInut(false); void carregar(); }} />}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div><Label>Situação</Label>
          <select className={selectCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">Todas</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select></div>
        <div><Label>Operação</Label>
          <select className={selectCls} value={f.operacao} onChange={(e) => setF({ ...f, operacao: e.target.value })}>
            <option value="">Todas</option>
            {Object.entries(OPERACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><Label>De</Label><Input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></div>
        <div><Label>Até</Label><Input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></div>
        <div><Label>Placa ou chassi</Label><Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr><th className="p-3">Data</th><th className="p-3">Operação</th><th className="p-3">Veículo</th><th className="p-3">Nº</th><th className="p-3">Valor</th><th className="p-3">Situação</th></tr>
          </thead>
          <tbody>
            {linhas === null && <tr><td className="p-3" colSpan={6}>Carregando…</td></tr>}
            {linhas?.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={6}>Nenhuma nota encontrada.</td></tr>}
            {linhas?.map((l) => (
              <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="p-3"><Link className="underline" href={`/app/fiscal/${l.id}`}>{new Date(l.created_at).toLocaleDateString("pt-BR")}</Link></td>
                <td className="p-3">{OPERACOES[l.operacao] ?? l.operacao}</td>
                <td className="p-3">{[l.rascunho?.veiculo?.modelo, l.rascunho?.veiculo?.placa].filter(Boolean).join(" · ") || "—"}</td>
                <td className="p-3">{l.numero ?? "—"}</td>
                <td className="p-3">{reais(l.valor_total_cents)}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[l.status]?.cor ?? ""}`}>{STATUS[l.status]?.rotulo ?? l.status}</span>
                  {l.ambiente === "homologacao" && <span className="ml-1 text-xs text-muted-foreground">(teste)</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Inutilizar({ onFim }: { onFim: () => void }) {
  const [v, setV] = useState({ serie: "1", ini: "", fim: "", just: "" });
  const [env, setEnv] = useState(false);
  async function enviar() {
    setEnv(true);
    const r = await chamar("/api/v1/fiscal/documentos/inutilizar", "POST", {
      serie: Number(v.serie), numero_inicial: Number(v.ini), numero_final: Number(v.fim), justificativa: v.just,
    });
    setEnv(false);
    if (r.ok) { toast.success("Numeração inutilizada."); onFim(); } else toast.error(r.msg ?? "Erro.");
  }
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted-foreground">Use quando um número da sequência foi pulado e não será usado. Não dá para desfazer.</p>
      <div className="flex flex-wrap gap-3">
        <div><Label>Série</Label><Input className="w-20" value={v.serie} onChange={(e) => setV({ ...v, serie: e.target.value })} /></div>
        <div><Label>Número inicial</Label><Input className="w-32" value={v.ini} onChange={(e) => setV({ ...v, ini: e.target.value })} /></div>
        <div><Label>Número final</Label><Input className="w-32" value={v.fim} onChange={(e) => setV({ ...v, fim: e.target.value })} /></div>
      </div>
      <div><Label>Justificativa (mínimo 15 caracteres)</Label><Input value={v.just} onChange={(e) => setV({ ...v, just: e.target.value })} /></div>
      <div><Button disabled={env} onClick={enviar}>Inutilizar</Button></div>
    </Card>
  );
}
