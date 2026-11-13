"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useCarteiraDoContato } from "@/hooks/contacts/useCarteiraDoContato";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useT } from "@/hooks/i18n/useT";
import { roleAtLeast } from "@/lib/auth/types";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UsersThree } from "@/lib/ui/icons";

interface Props {
  contactId: string;
  papelDoUsuario: string | null | undefined;
  conversationId?: string;
  assignedTo?: string | null;
  assignedName?: string | null;
}

export function CartaoDaCarteira(props: Props) {
  return (
    <AtendimentoDoCliente key={`${props.contactId}:${props.conversationId ?? ""}`} {...props} />
  );
}

/** Uma identidade por cliente; a autorização e a concorrência são do banco. */
function AtendimentoDoCliente({
  contactId,
  papelDoUsuario,
  conversationId,
  assignedTo,
  assignedName,
}: Props) {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const carteira = useCarteiraDoContato(contactId, true);
  const membros = useAssignableMembers(true);
  const [pedirSenha, setPedirSenha] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const dono = carteira.data?.qualificado ? carteira.data.dono_user_id : (assignedTo ?? null);
  const nome =
    membros.data?.find((m) => m.user_id === dono)?.full_name ??
    (dono === assignedTo ? assignedName : null) ??
    t("Vendedor responsável");
  const meu = dono === user.id;
  const podeLiberar = meu && (!conversationId || assignedTo === user.id);
  const pode =
    roleAtLeast(papelDoUsuario, "agent") && user.support?.access_mode !== "support_readonly";
  const alterar = useMutation({
    mutationFn: (acao: "assumir" | "liberar") =>
      apiClient.post(`/api/v1/contacts/${contactId}/atendimento`, {
        acao,
        ...(senha ? { senha } : {}),
        conversation_id: conversationId,
        expected_assignee: assignedTo ?? null,
      }),
    onSuccess: () => {
      setSenha("");
      setPedirSenha(false);
      setErro(null);
      for (const queryKey of [
        ["carteira-do-contato", contactId],
        ["contact", contactId],
        ["conversations"],
        ["conversation"],
        ["leads"],
      ])
        void qc.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      setSenha("");
      setErro(e instanceof Error ? e.message : t("Não foi possível alterar o atendimento."));
      if (e instanceof ApiError && e.code === "atendimento_senha_necessaria") setPedirSenha(true);
      void qc.invalidateQueries({ queryKey: ["carteira-do-contato", contactId] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  function assumir() {
    setErro(null);
    if (dono && !meu) setPedirSenha(true);
    else alterar.mutate("assumir");
  }
  return (
    <Card className="p-4" data-testid="carteira-do-contato">
      <div className="flex items-start gap-3">
        <UsersThree
          size={20}
          weight="duotone"
          aria-hidden
          className="mt-0.5 text-muted-foreground"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="text-sm font-semibold">{t("Atendimento")}</h2>
          {carteira.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {t("Não foi possível consultar o responsável.")}
            </p>
          ) : !carteira.data ? (
            <Skeleton className="h-6 w-32" />
          ) : (
            <>
              {dono ? (
                <Badge
                  variant="secondary"
                  className="max-w-full break-words whitespace-normal"
                  data-testid="carteira-dono"
                >
                  {nome}
                </Badge>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="carteira-vazio">
                  {t("Sem vendedor responsável")}
                </p>
              )}
              {pode && (
                <Button
                  size="sm"
                  className="w-full"
                  variant={podeLiberar ? "outline" : "default"}
                  disabled={alterar.isPending}
                  onClick={() => (podeLiberar ? alterar.mutate("liberar") : assumir())}
                >
                  {alterar.isPending
                    ? t("Aguarde...")
                    : podeLiberar
                      ? t("Liberar atendimento")
                      : t("Assumir atendimento")}
                </Button>
              )}
              {erro && !pedirSenha && (
                <p role="alert" className="text-xs text-destructive">
                  {t(erro)}
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <Dialog
        open={pedirSenha}
        onOpenChange={(open) => {
          if (!alterar.isPending) {
            setPedirSenha(open);
            setSenha("");
            setErro(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Assumir atendimento")}</DialogTitle>
            <DialogDescription>
              {t(
                "Este cliente já tem um vendedor responsável. Informe a senha administrativa para assumir.",
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              alterar.mutate("assumir");
            }}
          >
            <label className="block space-y-2 text-sm">
              <span>{t("Senha administrativa")}</span>
              <Input
                type="password"
                autoComplete="off"
                value={senha}
                maxLength={72}
                autoFocus
                onChange={(e) => setSenha(e.target.value)}
                disabled={alterar.isPending}
              />
            </label>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {t(erro)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={alterar.isPending}
                onClick={() => {
                  setPedirSenha(false);
                  setSenha("");
                  setErro(null);
                }}
              >
                {t("Cancelar")}
              </Button>
              <Button type="submit" disabled={!senha || alterar.isPending}>
                {alterar.isPending ? t("Aguarde...") : t("Assumir")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
