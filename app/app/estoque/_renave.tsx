"use client";

/**
 * Bloco RENAVE no card do veículo: situação, enviar entrada/saída, atualizar
 * status e baixar documentos. Cada ação fala com `/api/v1/renave/veiculos/:id/*`;
 * o envio leva `Idempotency-Key` para um duplo clique não gastar crédito duas vezes.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { randomId } from "@/lib/random-id";
import { ROTULO_DA_SITUACAO, ROTULO_DO_DOCUMENTO, type RenaveDoVeiculo } from "@/lib/renave/situacao";

async function chamar(url: string, metodo: string, corpo?: unknown, headers?: Record<string, string>) {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { ...(corpo === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const json = (await res.json().catch(() => null)) as
      | { data?: unknown; error?: { message?: string; details?: { pendencias?: string[] } } }
      | null;
    if (!res.ok) {
      const pend = json?.error?.details?.pendencias;
      return { ok: false as const, msg: [json?.error?.message ?? "Não foi possível concluir.", ...(pend ?? [])].join(" ") };
    }
    return { ok: true as const, data: json?.data };
  } catch {
    return { ok: false as const, msg: "Sem conexão com o servidor." };
  }
}

export function BlocoRenave({
  veiculoId, statusDoVeiculo, renave, urlPlataforma,
}: {
  veiculoId: string; statusDoVeiculo: string; renave: RenaveDoVeiculo | undefined; urlPlataforma: string | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = React.useTransition();
  const s = renave?.situacao ?? "";
  const operacao = statusDoVeiculo === "vendido" ? "venda" : "compra";
  const podeEnviar = operacao === "compra" ? ["", "X"].includes(s) : s === "C";
  const docs = Object.entries(renave?.documentos ?? {}).filter(([, d]) => d?.disponivel);

  const enviar = () => iniciar(async () => {
    const r = await chamar(`/api/v1/renave/veiculos/${veiculoId}/enviar`, "POST", { operacao },
      { "Idempotency-Key": randomId() });
    if (r.ok) { toast.success(operacao === "compra" ? "Entrada enviada ao RENAVE." : "Saída enviada ao RENAVE."); router.refresh(); }
    else toast.error(r.msg);
  });
  const atualizar = () => iniciar(async () => {
    const r = await chamar(`/api/v1/renave/veiculos/${veiculoId}/atualizar`, "POST");
    if (r.ok) { toast.success("Situação do RENAVE atualizada."); router.refresh(); } else toast.error(r.msg);
  });
  const baixar = (tipo: string) => iniciar(async () => {
    const r = await chamar(`/api/v1/renave/veiculos/${veiculoId}/documento?tipo=${tipo}`, "GET");
    const arquivos = (r.ok ? (r.data as { arquivos?: { url: string }[] })?.arquivos : undefined) ?? [];
    if (!r.ok) toast.error(r.msg);
    else if (arquivos.length === 0) toast.error("Documento ainda não disponível.");
    else for (const a of arquivos) window.open(a.url, "_blank", "noopener");
  });

  return (
    <div className="space-y-1.5 border-t border-border/50 pt-3 text-xs" data-testid={`renave-${veiculoId}`}>
      <div className="font-medium">{ROTULO_DA_SITUACAO[s] ?? s}</div>
      {renave?.ultimo_erro ? <p className="text-warning-fg">{renave.ultimo_erro}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {podeEnviar ? (
          <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" disabled={pendente} onClick={enviar}>
            {operacao === "compra" ? "Enviar entrada" : "Enviar saída"}
          </Button>
        ) : null}
        {renave ? (
          <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs" disabled={pendente} onClick={atualizar}>
            Atualizar
          </Button>
        ) : null}
        {docs.map(([tipo]) => (
          <Button key={tipo} size="sm" variant="ghost" className="h-7 rounded-full text-xs" disabled={pendente} onClick={() => baixar(tipo)}>
            {ROTULO_DO_DOCUMENTO[tipo] ?? tipo}
          </Button>
        ))}
        {urlPlataforma ? (
          <a href={urlPlataforma} target="_blank" rel="noopener noreferrer" className="self-center text-accent underline-offset-2 hover:underline">
            Abrir na Renave Fácil
          </a>
        ) : null}
      </div>
    </div>
  );
}
