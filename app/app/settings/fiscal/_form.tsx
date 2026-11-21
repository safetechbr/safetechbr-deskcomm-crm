"use client";

/**
 * Painel "Ativar Notas Fiscais". Cada bloco fala com a sua rota `/api/v1/fiscal/*`
 * e, ao terminar, recarrega a página (`router.refresh`) para o checklist ser
 * recalculado pelo servidor — a tela não decide sozinha o que está pronto.
 *
 * O arquivo .pfx e a senha só passam por aqui em memória: vão no corpo do POST
 * e nunca são guardados em estado depois do envio nem em armazenamento local.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ItemChecklist } from "@/lib/fiscal/checklist";
import type { AlertaCertificado } from "@/lib/fiscal/certificado-alertas";
import { CheckCircle, Warning } from "@/lib/ui/icons";

export interface ConfigDaTela {
  cnpj: string | null; razao_social: string | null; nome_fantasia: string | null;
  inscricao_estadual: string | null; inscricao_municipal: string | null;
  crt: number | null; cnae: string | null;
  logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null;
  municipio: string | null; uf: string; cep: string | null; telefone: string | null;
  ambiente: string; serie_nfe: number | null; proximo_numero_nfe: number | null;
  certificado_validade: string | null; email_contador: string | null; credenciado_sefaz: boolean;
  entrega_automatica?: boolean; renave_ativo?: boolean;
  regras_revisadas_em: string | null; nota_teste_ok_em: string | null;
}

export interface RegraDaTela {
  id: string; operacao: string; destino: string; tipo_pessoa: string; presencial: boolean;
  cfop: string; natureza_operacao: string; csosn_ou_cst: string | null;
  aliq_icms: number | null; reducao_bc_pct: number | null;
  cst_ibscbs: string | null; cclasstrib: string | null; texto_inf_adic: string | null;
  validado_contador: boolean; ativo: boolean;
}

const URL_GOV_PI = "https://sistemas.sefaz.pi.gov.br/";

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

const vazioParaNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** Uma regra, com edição em linha dos campos que o contador costuma ajustar. */
function LinhaDaRegra({ r }: { r: RegraDaTela }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [v, setV] = useState({
    cfop: r.cfop, natureza_operacao: r.natureza_operacao, csosn_ou_cst: r.csosn_ou_cst ?? "",
    aliq_icms: r.aliq_icms === null ? "" : String(r.aliq_icms), texto_inf_adic: r.texto_inf_adic ?? "",
  });
  const salvar = () => iniciar(async () => {
    const res = await chamar("/api/v1/fiscal/regras", "PATCH", {
      id: r.id, cfop: v.cfop, natureza_operacao: v.natureza_operacao,
      csosn_ou_cst: v.csosn_ou_cst.trim() || null,
      aliq_icms: v.aliq_icms.trim() === "" ? null : Number(v.aliq_icms.replace(",", ".")),
      texto_inf_adic: v.texto_inf_adic.trim() || null,
    });
    if (res.ok) { toast.success("Regra salva. Marque as regras como revisadas de novo."); setEditando(false); router.refresh(); }
    else toast.error(res.msg ?? "Erro.");
  });
  return (
    <li className="rounded-md border p-2">
      <div className="flex items-start justify-between gap-2">
        <span>
          <span className="font-medium">{r.operacao}</span> · {r.destino} · {r.tipo_pessoa} · CFOP {r.cfop}
          {" · "}{r.natureza_operacao}{r.csosn_ou_cst ? ` · CSOSN/CST ${r.csosn_ou_cst}` : ""}
          {!r.ativo && " · inativa"}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditando((e) => !e)}>
          {editando ? "Fechar" : "Editar"}
        </Button>
      </div>
      {editando && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Label className="flex flex-col gap-1">CFOP
            <Input value={v.cfop} inputMode="numeric" maxLength={4} onChange={(e) => setV({ ...v, cfop: e.target.value })} />
          </Label>
          <Label className="flex flex-col gap-1">Natureza da operação
            <Input value={v.natureza_operacao} onChange={(e) => setV({ ...v, natureza_operacao: e.target.value })} />
          </Label>
          <Label className="flex flex-col gap-1">CSOSN/CST
            <Input value={v.csosn_ou_cst} maxLength={4} onChange={(e) => setV({ ...v, csosn_ou_cst: e.target.value })} />
          </Label>
          <Label className="flex flex-col gap-1">Alíquota ICMS (%)
            <Input value={v.aliq_icms} inputMode="decimal" onChange={(e) => setV({ ...v, aliq_icms: e.target.value })} />
          </Label>
          <Label className="flex flex-col gap-1 sm:col-span-2">Texto em informações adicionais
            <Input value={v.texto_inf_adic} onChange={(e) => setV({ ...v, texto_inf_adic: e.target.value })} />
          </Label>
          <div className="sm:col-span-2"><Button type="button" size="sm" onClick={salvar} disabled={pendente}>Salvar regra</Button></div>
        </div>
      )}
    </li>
  );
}

export function PainelFiscal(props: {
  config: ConfigDaTela | null;
  regras: RegraDaTela[];
  checklist: ItemChecklist[];
  alerta: AlertaCertificado | null;
}) {
  const { config, regras, checklist, alerta } = props;
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const arquivo = useRef<HTMLInputElement>(null);
  const [senha, setSenha] = useState("");
  const [validade, setValidade] = useState(config?.certificado_validade ?? "");
  const [f, setF] = useState({
    cnpj: config?.cnpj ?? "", razao_social: config?.razao_social ?? "", nome_fantasia: config?.nome_fantasia ?? "",
    inscricao_estadual: config?.inscricao_estadual ?? "", inscricao_municipal: config?.inscricao_municipal ?? "",
    crt: String(config?.crt ?? 1), cnae: config?.cnae ?? "",
    logradouro: config?.logradouro ?? "", numero: config?.numero ?? "", complemento: config?.complemento ?? "",
    bairro: config?.bairro ?? "", municipio: config?.municipio ?? "", uf: config?.uf ?? "PI",
    cep: config?.cep ?? "", telefone: config?.telefone ?? "",
    ambiente: config?.ambiente ?? "homologacao",
    serie_nfe: String(config?.serie_nfe ?? 1), proximo_numero_nfe: String(config?.proximo_numero_nfe ?? 1),
    email_contador: config?.email_contador ?? "", credenciado_sefaz: config?.credenciado_sefaz ?? false,
    entrega_automatica: config?.entrega_automatica ?? false, renave_ativo: config?.renave_ativo ?? false,
  });
  const [competencia, setCompetencia] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const campo = (k: keyof typeof f) => ({
    value: String(f[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value })),
  });

  const rodar = (fn: () => Promise<{ ok: boolean; msg?: string }>, sucesso: string) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) { toast.success(sucesso); router.refresh(); } else toast.error(r.msg ?? "Erro.");
    });

  const salvarConfig = () =>
    rodar(() => chamar("/api/v1/fiscal/config", "PUT", {
      cnpj: f.cnpj, razao_social: f.razao_social, nome_fantasia: vazioParaNull(f.nome_fantasia),
      inscricao_estadual: vazioParaNull(f.inscricao_estadual), inscricao_municipal: vazioParaNull(f.inscricao_municipal),
      crt: Number(f.crt), cnae: vazioParaNull(f.cnae),
      logradouro: vazioParaNull(f.logradouro), numero: vazioParaNull(f.numero), complemento: vazioParaNull(f.complemento),
      bairro: vazioParaNull(f.bairro), municipio: vazioParaNull(f.municipio), uf: f.uf,
      cep: vazioParaNull(f.cep), telefone: vazioParaNull(f.telefone),
      ambiente: f.ambiente, serie_nfe: Number(f.serie_nfe), proximo_numero_nfe: Number(f.proximo_numero_nfe),
      email_contador: vazioParaNull(f.email_contador), credenciado_sefaz: f.credenciado_sefaz,
      entrega_automatica: f.entrega_automatica, renave_ativo: f.renave_ativo,
    }), "Dados fiscais salvos.");

  const gerarPacote = () =>
    rodar(() => chamar("/api/v1/fiscal/pacote-mensal", "POST", { competencia }), "Pacote gerado e enviado ao contador.");

  const enviarCertificado = () => {
    const file = arquivo.current?.files?.[0];
    if (!file || !senha || !validade) { toast.error("Escolha o arquivo .pfx, digite a senha e a validade."); return; }
    rodar(async () => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (const b of buf) bin += String.fromCharCode(b);
      const r = await chamar("/api/v1/fiscal/certificado", "POST", {
        pfx_base64: btoa(bin), senha, certificado_validade: validade,
      });
      // Senha e arquivo saem da tela em qualquer resultado.
      setSenha("");
      if (arquivo.current) arquivo.current.value = "";
      return r;
    }, "Certificado enviado ao provedor.");
  };

  const emitirTeste = () => rodar(async () => {
    const r = await chamar("/api/v1/fiscal/nota-teste", "POST");
    const rej = (r.data as { rejeicao?: string } | undefined)?.rejeicao;
    return rej ? { ok: false, msg: `Nota de teste rejeitada: ${rej}` } : r;
  }, "Nota de teste enviada. Aguarde a autorização.");

  const revisar = () => rodar(() => chamar("/api/v1/fiscal/regras", "POST", { acao: "revisar" }), "Regras marcadas como revisadas.");

  return (
    <div className="flex flex-col gap-6">
      {alerta && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <Warning size={18} aria-hidden /> {alerta.mensagem}
        </div>
      )}

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold">Checklist</h2>
        <ol className="flex flex-col gap-2" data-testid="checklist-fiscal">
          {checklist.map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-sm" data-ok={i.ok}>
              {i.ok ? <CheckCircle size={18} weight="fill" className="mt-0.5 text-green-600" aria-hidden />
                    : <Warning size={18} className="mt-0.5 text-amber-600" aria-hidden />}
              <div>
                <p className="font-medium">{i.id}. {i.titulo}</p>
                {i.pendencias.map((p) => <p key={p} className="text-muted-foreground">{p}</p>)}
                {i.id === 2 && !i.ok && (
                  <a className="text-accent underline" href={URL_GOV_PI} target="_blank" rel="noopener noreferrer">
                    GOV.PI Empresas → Autorização de NF-e
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">Dados da empresa e numeração</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>CNPJ</Label><Input inputMode="numeric" {...campo("cnpj")} /></div>
          <div className="md:col-span-2"><Label>Razão social</Label><Input {...campo("razao_social")} /></div>
          <div><Label>Nome fantasia</Label><Input {...campo("nome_fantasia")} /></div>
          <div><Label>Inscrição estadual</Label><Input {...campo("inscricao_estadual")} /></div>
          <div><Label>Inscrição municipal</Label><Input {...campo("inscricao_municipal")} /></div>
          <div>
            <Label>Regime tributário (CRT)</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.crt}
              onChange={(e) => setF((x) => ({ ...x, crt: e.target.value }))}>
              <option value="1">1 – Simples Nacional</option>
              <option value="2">2 – Simples (excesso de sublimite)</option>
              <option value="3">3 – Regime normal</option>
              <option value="4">4 – MEI</option>
            </select>
          </div>
          <div><Label>CNAE (7 dígitos)</Label><Input inputMode="numeric" {...campo("cnae")} /></div>
          <div className="md:col-span-2"><Label>Rua</Label><Input {...campo("logradouro")} /></div>
          <div><Label>Número</Label><Input {...campo("numero")} /></div>
          <div><Label>Complemento</Label><Input {...campo("complemento")} /></div>
          <div><Label>Bairro</Label><Input {...campo("bairro")} /></div>
          <div><Label>Cidade</Label><Input {...campo("municipio")} /></div>
          <div><Label>UF</Label><Input maxLength={2} {...campo("uf")} /></div>
          <div><Label>CEP</Label><Input inputMode="numeric" {...campo("cep")} /></div>
          <div><Label>Telefone</Label><Input {...campo("telefone")} /></div>
          <div><Label>Série da NF-e</Label><Input inputMode="numeric" {...campo("serie_nfe")} /></div>
          <div><Label>Próximo número</Label><Input inputMode="numeric" {...campo("proximo_numero_nfe")} /></div>
          <div><Label>E-mail do contador</Label><Input type="email" {...campo("email_contador")} /></div>
          <div>
            <Label>Ambiente</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.ambiente}
              onChange={(e) => setF((x) => ({ ...x, ambiente: e.target.value }))}>
              <option value="homologacao">Homologação (testes, sem valor fiscal)</option>
              <option value="producao" disabled={!config?.nota_teste_ok_em}>Produção</option>
            </select>
            {!config?.nota_teste_ok_em && (
              <p className="mt-1 text-xs text-muted-foreground">Produção só libera depois da nota de teste autorizada.</p>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.credenciado_sefaz}
            onChange={(e) => setF((x) => ({ ...x, credenciado_sefaz: e.target.checked }))} />
          A loja já está credenciada como emissora de NF-e na SEFAZ-PI
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.entrega_automatica}
            onChange={(e) => setF((x) => ({ ...x, entrega_automatica: e.target.checked }))} />
          Enviar DANFE e XML ao comprador automaticamente após a venda (WhatsApp/e-mail)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.renave_ativo}
            onChange={(e) => setF((x) => ({ ...x, renave_ativo: e.target.checked }))} />
          Enviar as notas ao RENAVE automaticamente
        </label>
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div><Label>Pacote do contador (mês)</Label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></div>
          <Button variant="outline" onClick={gerarPacote} disabled={pendente || !competencia}>Gerar e enviar pacote</Button>
        </div>
        <div><Button onClick={salvarConfig} disabled={pendente}>Salvar dados</Button></div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">Certificado digital A1</h2>
        <p className="text-sm text-muted-foreground">
          O arquivo e a senha vão direto ao provedor fiscal e não ficam guardados aqui.
          {config?.certificado_validade && <> Validade informada: {config.certificado_validade}.</>}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div><Label>Arquivo .pfx</Label><Input ref={arquivo} type="file" accept=".pfx,.p12" /></div>
          <div><Label>Senha</Label><Input type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
          <div><Label>Validade</Label><Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} /></div>
        </div>
        <div><Button onClick={enviarCertificado} disabled={pendente}>Enviar certificado</Button></div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Regras fiscais</h2>
          <Button variant="outline" onClick={revisar} disabled={pendente || regras.length === 0}>
            Marcar como revisadas
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          CFOP, CST e alíquotas vêm das regras abaixo. Peça ao contador para conferir antes de emitir.
        </p>
        {regras.length === 0 ? (
          <p className="text-sm">Salve os dados da empresa para criar as regras padrão.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm" data-testid="regras-fiscais">
            {regras.map((r) => (
              <LinhaDaRegra key={r.id} r={r} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">Nota de teste</h2>
        <p className="text-sm text-muted-foreground">
          Emite uma NF-e de R$ 0,01 em homologação, sem valor fiscal. Precisa dos itens 1 a 5 do checklist.
          {config?.nota_teste_ok_em && " Já autorizada."}
        </p>
        <div>
          <Button onClick={emitirTeste}
            disabled={pendente || !checklist.filter((i) => i.id <= 5).every((i) => i.ok)}>
            Emitir nota de teste
          </Button>
        </div>
      </Card>
    </div>
  );
}
