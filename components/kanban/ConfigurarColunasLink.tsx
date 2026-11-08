"use client";

import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Gear } from "@/lib/ui/icons";
import { configuracaoDasColunas } from "@/lib/kanban/links-de-configuracao";

export function ConfigurarColunasLink({
  pipelineId,
  nomeDoFunil,
  variant = "outline",
}: {
  pipelineId: string;
  nomeDoFunil: string;
  variant?: "outline" | "ghost";
}) {
  const t = useT();
  return (
    <Button asChild variant={variant} size="sm" className="rounded-full">
      <Link
        href={configuracaoDasColunas(pipelineId)}
        aria-label={`${t("Configurar colunas de")} «${nomeDoFunil}»`}
      >
        <Gear size={16} aria-hidden />
        {t("Configurar colunas")}
      </Link>
    </Button>
  );
}
