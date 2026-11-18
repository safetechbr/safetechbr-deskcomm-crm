/**
 * Configurações → Histórico de atividades. As ações principais da loja (estoque
 * e vendas), com quem fez e, nas exclusões, o motivo. Lê `api_audit_log` pela
 * sessão (a policy de leitura já escopa à organização) — o Audit Log completo
 * continua em /app/audit para quem precisa de tudo.
 */
import { ClockCounterClockwise as IconeDoTitulo } from "@/lib/ui/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Histórico de atividades" };

const POR_PAGINA = 50;

/** Só as ações principais; o resto fica no Audit Log. */
const ROTULOS: Record<string, string> = {
  "veiculo.created": "Adicionou veículo ao estoque",
  "veiculo.updated": "Alterou veículo",
  "veiculo.status_changed": "Mudou a situação do veículo",
  "veiculo.deleted": "Excluiu veículo do estoque",
  "veiculo.reservado": "Reservou veículo",
  "veiculo.reserva_liberada": "Liberou a reserva do veículo",
  "negociacao_veiculo.created": "Abriu negociação",
  "negociacao_veiculo.concluded": "Concluiu negociação",
  "negociacao_veiculo.cancelled": "Cancelou negociação",
  "negociacao_veiculo.deleted": "Excluiu venda",
};

type Meta = Record<string, unknown>;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null;
}

function descrever(resourceType: string | null, m: Meta, numeros: Map<string, number>, id: string | null) {
  if (resourceType === "veiculos") {
    return [texto(m.codigo), texto(m.modelo), texto(m.placa)].filter(Boolean).join(" · ");
  }
  const numero = texto(m.numero) ?? (id && numeros.has(id) ? String(numeros.get(id)) : null);
  const tipo = m.tipo === "compra" ? "Compra" : "Venda";
  return numero ? `${tipo} #${numero}` : "";
}

export default async function AtividadesPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }
  const t = (s: string) => traduzir(s, user.idioma);
  const pagina = Math.max(1, Number.parseInt((await searchParams).pagina ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_audit_log")
    .select("id, created_at, actor_user_id, action, resource_type, resource_id, metadata")
    .eq("organization_id", activeOrg.orgId)
    .in("action", Object.keys(ROTULOS))
    .order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA); // um a mais: diz se há próxima
  const linhas = (data ?? []).slice(0, POR_PAGINA);
  const temProxima = (data?.length ?? 0) > POR_PAGINA;

  // Atualizar/cancelar não gravam o número na linha: busca pelo id.
  const semNumero = linhas
    .filter((l) => l.resource_type === "negociacoes_de_veiculo" && !texto((l.metadata as Meta | null)?.numero))
    .map((l) => l.resource_id)
    .filter((id): id is string => Boolean(id));
  const [nomes, negociacoes] = await Promise.all([
    nomesDosAtendentes(linhas.map((l) => l.actor_user_id)),
    semNumero.length
      ? supabase.from("negociacoes_de_veiculo").select("id, numero").in("id", semNumero)
      : Promise.resolve({ data: [] as { id: string; numero: number }[] }),
  ]);
  const numeros = new Map((negociacoes.data ?? []).map((n) => [n.id, n.numero]));
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="ds-entra flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconeDoTitulo size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Histórico de atividades")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Quem cadastrou, alterou, vendeu ou excluiu no estoque e nas vendas. Exclusões trazem o motivo.")}
          </p>
        </div>
      </header>

      {error ? (
        <p className="text-sm text-destructive">{t("Não foi possível carregar o histórico.")}</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nenhuma atividade registrada ainda.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table data-testid="historico-de-atividades">
            <TableHeader>
              <TableRow>
                <TableHead>{t("Quando")}</TableHead>
                <TableHead>{t("Responsável")}</TableHead>
                <TableHead>{t("Atividade")}</TableHead>
                <TableHead>{t("Item")}</TableHead>
                <TableHead>{t("Motivo")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const m = (l.metadata ?? {}) as Meta;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{quando.format(new Date(l.created_at))}</TableCell>
                    <TableCell>{(l.actor_user_id && nomes.get(l.actor_user_id)) || t("Sistema")}</TableCell>
                    <TableCell>{t(ROTULOS[l.action] ?? l.action)}</TableCell>
                    <TableCell>{descrever(l.resource_type, m, numeros, l.resource_id) || "—"}</TableCell>
                    <TableCell className="max-w-sm whitespace-pre-wrap break-words">{texto(m.motivo) ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pagina > 1 || temProxima ? (
        <div className="flex justify-end gap-2">
          {pagina > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`?pagina=${pagina - 1}`}>{t("Anterior")}</Link>
            </Button>
          ) : null}
          {temProxima ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`?pagina=${pagina + 1}`}>{t("Próxima")}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
