/**
 * Configurações → Notas Fiscais. Checklist "Ativar Notas Fiscais" da loja:
 * dados da empresa, credenciamento, certificado A1, numeração, regras e nota de teste.
 *
 * Papel mínimo `manager`, o mesmo das rotas `/api/v1/fiscal/*` (a rota é quem
 * defende o dado; este gate só evita mostrar a tela a quem não pode usá-la).
 */
import { Receipt as IconeDoTitulo } from "@/lib/ui/icons";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { COLUNAS_CONFIG_PUBLICAS } from "@/lib/fiscal/config-servidor";
import { montarChecklist, type ConfigParaChecklist } from "@/lib/fiscal/checklist";
import { alertaDeCertificado } from "@/lib/fiscal/certificado-alertas";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

import { PainelFiscal, type ConfigDaTela, type RegraDaTela } from "./_form";

export const metadata = { title: "Notas Fiscais" };
export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  // Admin client com `organization_id` vindo da sessão: as tabelas fiscais só
  // têm leitura pela RLS e a tela precisa das mesmas colunas públicas da rota.
  const admin = createAdminClient();
  const [{ data: config }, { data: regras }] = await Promise.all([
    admin.from("config_fiscal_loja").select(COLUNAS_CONFIG_PUBLICAS).eq("organization_id", activeOrg.orgId).limit(1).maybeSingle(),
    admin.from("regras_fiscais").select("*").eq("organization_id", activeOrg.orgId)
      .order("operacao").order("destino").order("tipo_pessoa"),
  ]);

  const c = (config ?? null) as unknown as ConfigDaTela | null;
  const checklist = montarChecklist(
    (c ?? {
      cnpj: null, inscricao_estadual: null, inscricao_municipal: null, crt: null, cnae: null, uf: "PI",
      credenciado_sefaz: false, certificado_validade: null, serie_nfe: null, proximo_numero_nfe: null,
      regras_revisadas_em: null, email_contador: null, ambiente: "homologacao", nota_teste_ok_em: null,
    }) as ConfigParaChecklist,
  );
  const alerta = alertaDeCertificado(c?.certificado_validade ?? null);
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header className="ds-entra flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconeDoTitulo size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Notas Fiscais", idioma)}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {traduzir("Ative a emissão de NF-e da loja. Toda nota nasce como rascunho e só sai depois que você revisa e emite.", idioma)}
          </p>
        </div>
      </header>

      <PainelFiscal
        config={c}
        regras={(regras ?? []) as unknown as RegraDaTela[]}
        checklist={checklist}
        alerta={alerta}
      />
    </div>
  );
}
