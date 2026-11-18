"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useConversationsRealtime } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloParaAEquipe } from "@/lib/contacts/rotulo-do-contato";
import {
  bolinhasVisiveis,
  conteudoDaBolinha,
  MAXIMO_DE_BOLINHAS,
  textoDoContador,
  type Dispensadas,
} from "@/lib/inbox/bolinhas";
import { ChatCircle, X } from "@/lib/ui/icons";
import { JanelaDaConversa } from "./JanelaDaConversa";

const CHAVE = "bolinhas-dispensadas";
// Referência estável: o filtro vira parte da chave do react-query.
const FILTROS = { unread: true, exclude_finished: true } as const;

function lerDispensadas(): Dispensadas {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE) ?? "{}") as Dispensadas;
  } catch {
    return {};
  }
}

/**
 * A doca de bolinhas: quem escreveu e espera resposta, em TODA tela de `/app`.
 * Clicar abre a conversa numa janela por cima — a rota não muda.
 */
export function DocaDeBolinhas() {
  const t = useT();
  const pathname = usePathname();
  const { activeOrg } = useAuth();
  const [dispensadas, setDispensadas] = useState<Dispensadas>({});
  const [aberta, setAberta] = useState<string | null>(null);
  const lista = useConversationsRealtime(FILTROS, activeOrg?.orgId ?? null);

  useEffect(() => setDispensadas(lerDispensadas()), []);

  const conversas = useMemo(() => lista.data?.pages.flatMap((p) => p.data) ?? [], [lista.data]);
  const visiveis = useMemo(
    () => bolinhasVisiveis(conversas, dispensadas),
    [conversas, dispensadas],
  );
  const abertaNaLista = conversas.find((c) => c.id === aberta);

  // Na central de conversas a lista já está na tela: a doca seria duplicata.
  const naCentral = pathname?.startsWith("/app/inbox") ?? false;
  if (naCentral && !aberta) return null;

  const dispensar = (id: string, marca: string | null) => {
    const prox = { ...dispensadas, [id]: marca ?? new Date().toISOString() };
    setDispensadas(prox);
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(prox));
    } catch {}
  };

  const mostradas = visiveis.slice(0, MAXIMO_DE_BOLINHAS);
  const resto = visiveis.length - mostradas.length;

  return (
    <>
      {!naCentral && mostradas.length > 0 && (
        <div
          data-testid="doca-de-bolinhas"
          className="fixed right-4 bottom-20 z-40 flex flex-col-reverse items-center gap-3 md:bottom-6"
        >
          {mostradas.map((c) => {
            const rotulo = rotuloParaAEquipe(c.contacts ?? null, t);
            const conteudo = conteudoDaBolinha(c.contacts, rotulo);
            const n = c.unread_count_for_assignee ?? 0;
            return (
              <div key={c.id} className="group/bolinha relative">
                <button
                  type="button"
                  onClick={() => setAberta(c.id)}
                  aria-label={`${rotulo} — ${n} ${t("mensagens não lidas")}`}
                  title={rotulo}
                  className="block rounded-full shadow-lg ring-2 ring-background transition-transform hover:scale-105 focus-visible:ring-accent focus-visible:outline-hidden"
                >
                  <Avatar className="size-12">
                    {conteudo.tipo === "foto" && (
                      <AvatarImage src={conteudo.src} alt="" className="object-cover" />
                    )}
                    <AvatarFallback className="bg-accent-soft text-base font-semibold text-accent">
                      {conteudo.tipo === "inicial" ? (
                        conteudo.texto
                      ) : (
                        <ChatCircle size={22} weight="duotone" aria-hidden />
                      )}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums ring-2 ring-background"
                >
                  {textoDoContador(n)}
                </span>
                <button
                  type="button"
                  onClick={() => dispensar(c.id, c.last_message_at)}
                  aria-label={`${t("Dispensar")} ${rotulo}`}
                  className="absolute -bottom-1 -left-1 hidden size-5 items-center justify-center rounded-full bg-surface-elevated text-text-muted shadow-sm ring-1 ring-border group-focus-within/bolinha:flex group-hover/bolinha:flex hover:text-foreground"
                >
                  <X size={10} aria-hidden />
                </button>
              </div>
            );
          })}
          {resto > 0 && (
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text-muted shadow-sm ring-1 ring-border">
              +{resto}
            </span>
          )}
        </div>
      )}
      {aberta && (
        <JanelaDaConversa
          conversationId={aberta}
          inicial={abertaNaLista}
          onFechar={() => setAberta(null)}
          onAbrirConversa={setAberta}
        />
      )}
    </>
  );
}
