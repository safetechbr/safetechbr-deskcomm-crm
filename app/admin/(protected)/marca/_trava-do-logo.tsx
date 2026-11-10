"use client";

import { useState, useTransition } from "react";

import { definirTravaDoLogo } from "@/app/actions/settings/definirTravaDoLogo";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/IdiomaProvider";

/**
 * O interruptor do admin mestre: com a trava ligada (padrão) nenhuma empresa
 * troca o logo — todas veem o da instalação.
 */
export function TravaDoLogo({ bloqueadoInicial }: { bloqueadoInicial: boolean }) {
  const t = useT();
  const [bloqueado, setBloqueado] = useState(bloqueadoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function alternar(novo: boolean) {
    setErro(null);
    iniciar(async () => {
      const r = await definirTravaDoLogo(novo);
      if (r.ok) setBloqueado(novo);
      else setErro(t("Não consegui salvar a trava. Tente de novo."));
    });
  }

  return (
    <Card className="space-y-2 p-6" data-testid="trava-do-logo">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={bloqueado}
          disabled={pendente}
          onChange={(e) => alternar(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium">
            {t("Bloquear a troca do logo pelas empresas")}
          </span>
          <span className="block text-xs text-text-muted">
            {t(
              "Ligado: todas as empresas veem o logo do sistema e não conseguem trocá-lo. Desligue para deixar cada empresa subir o próprio logo.",
            )}
          </span>
        </span>
      </label>
      {erro ? (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      ) : null}
    </Card>
  );
}
