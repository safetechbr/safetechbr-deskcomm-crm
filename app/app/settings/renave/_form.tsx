"use client";

/**
 * Painel da integração RENAVE (Renave Fácil). A chave de API só passa por aqui
 * no corpo do PUT; depois do envio o campo é limpo e a tela só mostra os 4
 * últimos dígitos que a rota devolve.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConfigRenaveDaTela {
  last4: string | null; tem_chave: boolean; cnpj: string | null; url_plataforma: string | null;
  ativo: boolean; limite_creditos_aviso: number; bloquear_venda_sem_confirmacao: boolean;
}

async function chamar(url: string, metodo: string, corpo?: unknown): Promise<{ ok: boolean; data?: unknown; msg?: string }> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = (await res.json().catch(() => null)) as { data?: unknown; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, msg: json?.error?.message ?? "Não foi possível concluir." };
    return { ok: true, data: json?.data };
  } catch {
    return { ok: false, msg: "Sem conexão com o servidor." };
  }
}

export function PainelRenave({ config }: { config: ConfigRenaveDaTela | null }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [chave, setChave] = useState("");
  const [cnpj, setCnpj] = useState(config?.cnpj ?? "");
  const [url, setUrl] = useState(config?.url_plataforma ?? "");
  const [ativo, setAtivo] = useState(config?.ativo ?? false);
  const [limite, setLimite] = useState(String(config?.limite_creditos_aviso ?? 5));
  const [bloquear, setBloquear] = useState(config?.bloquear_venda_sem_confirmacao ?? false);
  const [teste, setTeste] = useState<string | null>(null);
  const [saldo, setSaldo] = useState<{ seminovos: number; zero_km: number; baixo: boolean } | null>(null);

  const salvar = () => iniciar(async () => {
    const res = await chamar("/api/v1/renave/config", "PUT", {
      api_key: chave.trim() || undefined, cnpj, url_plataforma: url.trim() || null, ativo,
      limite_creditos_aviso: Number(limite) || 0, bloquear_venda_sem_confirmacao: bloquear,
    });
    if (res.ok) { setChave(""); toast.success("Configuração do RENAVE salva."); router.refresh(); }
    else toast.error(res.msg ?? "Erro.");
  });
  const testar = () => iniciar(async () => {
    const res = await chamar("/api/v1/renave/testar", "POST");
    const d = res.data as { mensagem?: string; pronto?: boolean } | undefined;
    setTeste(res.ok ? d?.mensagem ?? "Conexão OK." : res.msg ?? "Erro.");
    if (res.ok && d?.pronto) toast.success(d.mensagem ?? "Conexão OK."); else toast.error(res.ok ? d?.mensagem ?? "" : res.msg ?? "Erro.");
  });
  const verSaldo = () => iniciar(async () => {
    const res = await chamar("/api/v1/renave/saldo", "GET");
    if (res.ok) setSaldo(res.data as { seminovos: number; zero_km: number; baixo: boolean });
    else toast.error(res.msg ?? "Erro.");
  });

  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <div className="space-y-1.5">
        <Label htmlFor="renave-chave">Chave de API da Renave Fácil</Label>
        <Input id="renave-chave" type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)}
          placeholder={config?.tem_chave ? `Chave salva terminando em ${config.last4 ?? "****"} — deixe vazio para manter` : "Cole a chave gerada no painel da Renave Fácil"} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="renave-cnpj">CNPJ da loja</Label>
          <Input id="renave-cnpj" inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Só números" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="renave-limite">Avisar quando restarem (créditos)</Label>
          <Input id="renave-limite" inputMode="numeric" value={limite} onChange={(e) => setLimite(e.target.value.replace(/\D/g, ""))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="renave-url">Endereço do painel da Renave Fácil (opcional)</Label>
        <Input id="renave-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Integração ativa
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
        Avisar com mais força ao vender carro sem entrada confirmada no RENAVE
      </label>
      <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
        <Button onClick={salvar} disabled={pendente}>Salvar</Button>
        <Button variant="outline" onClick={testar} disabled={pendente || !config?.tem_chave}>Testar conexão</Button>
        <Button variant="outline" onClick={verSaldo} disabled={pendente || !config?.tem_chave}>Ver saldo</Button>
      </div>
      {teste ? <p className="text-sm text-muted-foreground" data-testid="renave-teste">{teste}</p> : null}
      {saldo ? (
        <p className={saldo.baixo ? "text-sm text-warning-fg" : "text-sm text-muted-foreground"} data-testid="renave-saldo">
          Créditos: {saldo.seminovos} seminovos · {saldo.zero_km} 0 km{saldo.baixo ? " — saldo baixo, compre mais na Renave Fácil." : ""}
        </p>
      ) : null}
    </Card>
  );
}
