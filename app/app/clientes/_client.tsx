"use client";

import * as React from "react";
import Link from "next/link";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiClient } from "@/lib/api/client";
import { useDeleteContact } from "@/hooks/contacts/useDeleteContact";
import { CadastroClienteModal } from "@/app/pdv/cadastro-cliente-modal";
import { clienteDoContato, type ContatoDoCadastro } from "@/lib/pdv/cadastro-cliente";
import type { ClienteDaNegociacao } from "@/lib/pdv/regras";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useContactList } from "@/hooks/contacts/useContactList";
import { useT } from "@/hooks/i18n/useT";
import {
  Eye,
  MagnifyingGlass,
  MapPin,
  PencilSimple,
  Phone,
  Trash,
  UsersThree,
} from "@/lib/ui/icons";
import {
  resumoDaNegociacao,
  ROTULO_DO_STATUS_DA_NEGOCIACAO,
  tituloDoVeiculoDaNegociacao,
  type Negociacao,
  type StatusDaNegociacao,
} from "@/lib/pdv/regras";
import type { Contact } from "@/lib/types/contacts";
import { formatarPreco } from "@/lib/veiculos/regras";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";

const COR_DO_STATUS: Record<StatusDaNegociacao, string> = {
  concluida: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rascunho: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  cancelada: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function nomeDe(c: Contact, t: (s: string) => string): string {
  return rotuloDoContato(c, t);
}

function iniciais(nome: string): string {
  const partes = nome.split(/\s+/).filter(Boolean);
  return (
    (partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
}

/** `YYYY-MM-DD` sem passar por `Date`: o fuso não pode andar um dia com o aniversário. */
function dataCivil(iso: string | null): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

function formatarDocumento(d: string | null | undefined): string | null {
  const n = (d ?? "").replace(/\D/g, "");
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d?.trim() || null;
}

function enderecoEmLinha(c: ClienteDaNegociacao): string | null {
  const rua = [c.endereco, c.numero].filter(Boolean).join(", ");
  const resto = [c.complemento, c.bairro, [c.cidade, c.uf].filter(Boolean).join("/")]
    .filter(Boolean)
    .join(" · ");
  const linha = [rua, resto, c.cep ? `CEP ${c.cep}` : ""].filter(Boolean).join(" — ");
  return linha || null;
}

/** Cadastro completo (CPF decifrado e endereço) do contato, lido só quando a ficha ou a edição abre. */
function useCadastroDoCliente(id: string | null) {
  return useQuery({
    queryKey: ["contact", id, "ficha"],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<{ data: ContatoDoCadastro }>(`/api/v1/contacts/${id}`, {
        headers: { "X-Decrypt-Purpose": "Exibir e editar o cadastro do cliente" },
      });
      return clienteDoContato(res.data);
    },
  });
}

function EditarCliente({ id, onFechar }: { id: string; onFechar: () => void }) {
  const q = useCadastroDoCliente(id);
  const retorno = React.useRef<HTMLElement | null>(null);
  if (!q.data) return null;
  return (
    <CadastroClienteModal
      open
      contactId={id}
      inicial={q.data}
      retornoDoFoco={retorno}
      onOpenChange={(v) => !v && onFechar()}
      onSalvo={() => undefined}
    />
  );
}

export function ClientesClient({ negociacoes }: { negociacoes: Negociacao[] }) {
  const t = useT();
  const [entrada, setEntrada] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [aberto, setAberto] = React.useState<Contact | null>(null);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [excluir, setExcluir] = React.useState<Contact | null>(null);
  const apagar = useDeleteContact();
  const ficha = useCadastroDoCliente(aberto?.id ?? null);

  React.useEffect(() => {
    const id = setTimeout(() => setBusca(entrada.trim()), 250);
    return () => clearTimeout(id);
  }, [entrada]);

  // Cliente = quem foi cadastrado à mão OU tem negociação no PDV. Lead que veio de canal
  // (source "whatsapp", "instagram"…) e comprou é o MESMO contato, com a origem preservada.
  const q = useContactList({
    search: busca || undefined,
    order_by: "created_at",
    order_dir: "desc",
    limit: 100,
  });

  const porCliente = React.useMemo(() => {
    const mapa = new Map<string, Negociacao[]>();
    for (const n of negociacoes) {
      if (!n.contact_id) continue;
      const lista = mapa.get(n.contact_id) ?? [];
      lista.push(n);
      mapa.set(n.contact_id, lista);
    }
    return mapa;
  }, [negociacoes]);

  const clientes = React.useMemo(
    () =>
      (q.data?.pages.flatMap((p) => p.data) ?? []).filter(
        (c) => c.contact_type !== "fornecedor" && (c.source === "manual" || porCliente.has(c.id)),
      ),
    [q.data, porCliente],
  );

  // A lista traz todos os contatos (leads inclusive) e o filtro é local: puxa as páginas
  // seguintes sozinho, com teto, para o lead que comprou não ficar escondido atrás de outros.
  const paginas = q.data?.pages.length ?? 0;
  React.useEffect(() => {
    if (q.hasNextPage && !q.isFetchingNextPage && paginas < 30) void q.fetchNextPage();
  }, [q, paginas]);

  const comEmail = clientes.filter((c) => c.email).length;
  const comTelefone = clientes.filter((c) => c.phone_number).length;
  const historico = aberto ? (porCliente.get(aberto.id) ?? []) : [];

  return (
    <div className="space-y-6 p-6" data-testid="clientes">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("Clientes")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Todos os clientes cadastrados e o histórico de cada um na loja.")}
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link href="/app/clientes/novo">{t("Adicionar Cliente")}</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { id: "total", rotulo: t("Total de clientes"), valor: clientes.length },
          { id: "email", rotulo: t("Com e-mail"), valor: comEmail },
          { id: "telefone", rotulo: t("Com telefone"), valor: comTelefone },
        ].map((k, i) => (
          <div
            key={k.id}
            className="ds-entra rounded-xl border border-border/60 bg-surface p-5 shadow-xs"
            style={{ animationDelay: `${i * 50}ms` }}
            data-testid={`cartao-${k.id}`}
          >
            <div className="text-xs font-medium text-muted-foreground">{k.rotulo}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{k.valor}</div>
          </div>
        ))}
      </div>

      <label className="relative block max-w-sm">
        <MagnifyingGlass
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder={t("Buscar por nome, telefone ou e-mail")}
          className="h-10 rounded-full border-border/80 bg-surface pr-4 pl-9 shadow-xs focus-visible:border-accent/50 focus-visible:ring-accent/20"
          aria-label={t("Buscar")}
        />
      </label>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
      ) : clientes.length === 0 ? (
        <div className="ds-entra flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-surface p-10 text-center text-sm text-muted-foreground">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <UsersThree aria-hidden weight="duotone" className="size-6" />
          </span>
          {busca
            ? t("Nenhum cliente encontrado para essa busca.")
            : t("Nenhum cliente cadastrado ainda.")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clientes.map((c, i) => {
            const nome = nomeDe(c, t);
            const n = porCliente.get(c.id)?.length ?? 0;
            return (
              <div
                key={c.id}
                className="ds-entra ds-elevavel rounded-xl border border-border/60 bg-surface p-4 shadow-xs"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                data-testid={`cliente-${c.id}`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                    {iniciais(nome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("Cliente desde")} {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
                <dl className="mt-4 space-y-1.5 border-t border-border/50 pt-3 text-sm">
                  {c.phone_number && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone aria-hidden className="size-3.5" />
                        {t("Telefone")}
                      </dt>
                      <dd className="tabular-nums">{c.phone_number}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{t("Negociações")}</dt>
                    <dd>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                        {n}
                      </span>
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex gap-2 border-t border-border/50 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-full"
                    aria-label={`${t("Ver")} ${nome}`}
                    onClick={() => setAberto(c)}
                    data-testid={`ver-${c.id}`}
                  >
                    <Eye aria-hidden className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-full"
                    aria-label={`${t("Editar")} ${nome}`}
                    onClick={() => setEditandoId(c.id)}
                    data-testid={`editar-${c.id}`}
                  >
                    <PencilSimple aria-hidden className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-full text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                    aria-label={`${t("Excluir")} ${nome}`}
                    onClick={() => setExcluir(c)}
                    data-testid={`excluir-${c.id}`}
                  >
                    <Trash aria-hidden className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {q.hasNextPage && (
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          {t("Carregar mais")}
        </Button>
      )}

      <Dialog open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
          data-testid="ficha-do-cliente"
        >
          {aberto && (
            <>
              <DialogHeader>
                <DialogTitle>{nomeDe(aberto, t)}</DialogTitle>
                <DialogDescription>{t("Ficha do cliente")}</DialogDescription>
              </DialogHeader>
              <dl className="grid gap-3 rounded-xl bg-muted/60 p-4 text-sm sm:grid-cols-2">
                <Info rotulo={t("Nome completo")} valor={nomeDe(aberto, t)} />
                <Info rotulo={t("CPF/CNPJ")} valor={formatarDocumento(ficha.data?.documento)} />
                <Info rotulo={t("Telefone")} valor={aberto.phone_number} />
                <Info rotulo={t("E-mail")} valor={aberto.email} />
                <Info rotulo={t("Data de nascimento")} valor={dataCivil(aberto.birthdate)} />
                <Info
                  rotulo={t("Cliente desde")}
                  valor={new Date(aberto.created_at).toLocaleDateString("pt-BR")}
                />
              </dl>
              {ficha.data && (
                <dl
                  className="grid gap-3 rounded-xl bg-muted/60 p-4 text-sm sm:grid-cols-2"
                  data-testid="ficha-cadastro"
                >
                  <Info rotulo={t("Nacionalidade")} valor={ficha.data.nacionalidade ?? null} />
                  <Info rotulo={t("Estado civil")} valor={ficha.data.estado_civil ?? null} />
                  <Info rotulo={t("Profissão")} valor={ficha.data.profissao ?? null} />
                  <Info
                    rotulo={t("RG")}
                    valor={
                      [ficha.data.rg, ficha.data.rg_orgao_expedidor, ficha.data.rg_uf]
                        .filter(Boolean)
                        .join(" ") || null
                    }
                  />
                  <Info rotulo={t("CNH")} valor={ficha.data.cnh ?? null} />
                  <div className="sm:col-span-2">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin aria-hidden className="size-3.5" />
                      {t("Endereço")}
                    </dt>
                    <dd className="font-medium" data-testid="ficha-endereco">
                      {enderecoEmLinha(ficha.data) || "—"}
                    </dd>
                  </div>
                </dl>
              )}
              <section className="space-y-2" data-testid="historico-do-cliente">
                <h3 className="font-semibold">{t("Histórico")}</h3>
                {historico.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground">
                    {t("Nenhuma compra ou venda registrada para este cliente.")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {historico.map((h) => (
                      <li
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface p-3 text-sm shadow-xs"
                      >
                        <div>
                          <div className="font-medium">
                            {h.tipo === "venda" ? t("Comprou") : t("Vendeu")}{" "}
                            {tituloDoVeiculoDaNegociacao(h.veiculo)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(h.concluida_em ?? h.created_at).toLocaleDateString("pt-BR")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">
                            {formatarPreco(resumoDaNegociacao(h).total_cents)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${COR_DO_STATUS[h.status]}`}
                          >
                            {t(ROTULO_DO_STATUS_DA_NEGOCIACAO[h.status])}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="rounded-full"
                  onClick={() => {
                    setEditandoId(aberto.id);
                    setAberto(null);
                  }}
                >
                  <PencilSimple aria-hidden className="size-4" />
                  {t("Editar")}
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/app/contacts/${aberto.id}`}>{t("Abrir ficha completa")}</Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {editandoId && <EditarCliente id={editandoId} onFechar={() => setEditandoId(null)} />}

      <AlertDialog open={excluir !== null} onOpenChange={(v) => !v && setExcluir(null)}>
        <AlertDialogContent data-testid="confirmar-exclusao">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Excluir cliente")}</AlertDialogTitle>
            <AlertDialogDescription>
              {excluir ? nomeDe(excluir, t) : ""} —{" "}
              {t("Esta ação não pode ser desfeita. Deseja continuar?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (excluir) apagar.mutate(excluir.id);
                setExcluir(null);
              }}
            >
              {t("Excluir")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">{valor || "—"}</dd>
    </div>
  );
}
