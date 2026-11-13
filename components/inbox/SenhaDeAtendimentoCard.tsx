"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";

export function SenhaDeAtendimentoCard() {
  const t = useT();
  const qc = useQueryClient();
  const [senha, setSenha] = useState("");
  const config = useQuery({
    queryKey: ["senha-atendimento"],
    queryFn: async () =>
      (await apiClient.get<{ data: { configurada: boolean } }>("/api/v1/settings/atendimento"))
        .data,
  });
  const salvar = useMutation({
    mutationFn: () => apiClient.put("/api/v1/settings/atendimento", { senha }),
    onSuccess: () => {
      setSenha("");
      void qc.invalidateQueries({ queryKey: ["senha-atendimento"] });
      toast.success(t("Senha de atendimento salva."));
    },
    onError: showApiError,
  });
  function gerar() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    setSenha(Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join(""));
  }
  return (
    <Card className="space-y-4 p-5" data-testid="senha-de-atendimento">
      <div>
        <h2 className="font-semibold">{t("Senha para troca de atendimento")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Autoriza um vendedor a assumir o cliente de outro. Somente administradores podem gerar ou alterar esta senha.",
          )}
        </p>
      </div>
      <p className="text-sm">
        {config.isError
          ? t("Não foi possível consultar a configuração.")
          : !config.data
            ? t("Carregando...")
            : config.data.configurada
              ? t("Senha configurada")
              : t("Senha ainda não configurada")}
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <label className="block space-y-1 text-sm">
          <span>{t("Nova senha administrativa")}</span>
          <Input
            type="text"
            autoComplete="off"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={8}
            maxLength={72}
            placeholder={t("Pelo menos 8 caracteres")}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={gerar} disabled={salvar.isPending}>
            {t("Gerar senha")}
          </Button>
          <Button type="submit" disabled={senha.length < 8 || salvar.isPending}>
            {salvar.isPending ? t("Salvando...") : t("Salvar senha")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
