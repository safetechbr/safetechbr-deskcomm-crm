"use client";

import {
  camposDaEmpresa,
  type EmpresaContrato,
  type DadosDoContrato,
  type regularizacaoSchema,
} from "@/lib/pdv/modelo-contrato";
import type { PagamentoDaNegociacao } from "@/lib/pdv/regras";
import type { z } from "zod";

const estilo = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
function Campo({
  nome,
  valor,
  mudar,
  tipo = "text",
}: {
  nome: string;
  valor?: string | null;
  mudar: (v: string) => void;
  tipo?: string;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {nome}
      <input
        type={tipo}
        className={estilo}
        value={valor ?? ""}
        onChange={(e) => mudar(e.target.value)}
      />
    </label>
  );
}

export function EditorDaEmpresa({
  valor,
  onChange,
  somenteComplemento = false,
}: {
  valor: Partial<EmpresaContrato>;
  onChange: (v: Partial<EmpresaContrato>) => void;
  somenteComplemento?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(Object.keys(camposDaEmpresa) as (keyof EmpresaContrato)[])
        .filter(
          (k) => !somenteComplemento || !["razao_social", "nome_fantasia", "cnpj"].includes(k),
        )
        .map((k) => (
          <Campo
            key={k}
            nome={camposDaEmpresa[k]}
            valor={valor[k]}
            mudar={(v) => onChange({ ...valor, [k]: v })}
          />
        ))}
    </div>
  );
}

export function EditorDeClausulas({
  valor,
  onChange,
}: {
  valor: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer text-sm">Cláusulas do modelo ({valor.length})</summary>
      <p className="text-xs text-muted-foreground">
        Texto do modelo fornecido pela loja. Revise as cláusulas com seu responsável jurídico,
        especialmente as condições de garantia.
      </p>
      {valor.map((texto, i) => (
        <div key={i} className="block text-xs">
          <label>
            Cláusula {i + 4}
            <textarea
              className={estilo}
              rows={4}
              maxLength={6000}
              value={texto}
              onChange={(e) => onChange(valor.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </label>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => onChange(valor.filter((_, j) => j !== i))}
          >
            Remover cláusula {i + 4}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={valor.length >= 30}
        className="rounded-lg border px-3 py-2 text-xs"
        onClick={() => onChange([...valor, "Nova cláusula"])}
      >
        Adicionar cláusula
      </button>
    </details>
  );
}

type Regularizacao = z.infer<typeof regularizacaoSchema>;
export function EditorRegularizacao({
  valor,
  onChange,
}: {
  valor: Regularizacao;
  onChange: (v: Regularizacao) => void;
}) {
  function mudar(i: number, novo: Partial<Regularizacao[number]>) {
    onChange(valor.map((v, j) => (i === j ? { ...v, ...novo } : v)));
  }
  return (
    <details className="space-y-3 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm">Débitos e regularização ({valor.length})</summary>
      <p className="text-xs text-muted-foreground">
        Informe débitos, restrições ou ausência de pendências e quem fica responsável.
      </p>
      {valor.map((v, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-2">
          <Campo
            nome={`Descrição da pendência ${i + 1}`}
            valor={v.descricao}
            mudar={(descricao) => mudar(i, { descricao })}
          />
          <label className="block text-xs">
            Responsável / situação
            <select
              className={estilo}
              value={v.responsavel}
              onChange={(e) =>
                mudar(i, { responsavel: e.target.value as Regularizacao[number]["responsavel"] })
              }
            >
              <option value="a_definir">A definir</option>
              <option value="cliente">Cliente paga</option>
              <option value="loja">Loja paga</option>
              <option value="quitado">Quitado / sem débito</option>
            </select>
          </label>
          <label className="block text-xs">
            Valor (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              className={estilo}
              value={v.valor_cents / 100}
              onChange={(e) => mudar(i, { valor_cents: Math.round(Number(e.target.value) * 100) })}
            />
          </label>
          <Campo
            nome="Observação da pendência"
            valor={v.observacao}
            mudar={(observacao) => mudar(i, { observacao })}
          />
          <button
            type="button"
            className="text-xs underline"
            onClick={() => onChange(valor.filter((_, j) => j !== i))}
          >
            Remover pendência {i + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="rounded-lg border px-3 py-2 text-xs"
        disabled={valor.length >= 30}
        onClick={() =>
          onChange([
            ...valor,
            { descricao: "", responsavel: "a_definir", valor_cents: 0, observacao: "" },
          ])
        }
      >
        Adicionar informação de regularização
      </button>
    </details>
  );
}

export function EditorDoContrato({
  contrato,
  pagamentos,
  onChange,
}: {
  contrato?: DadosDoContrato | null;
  pagamentos: PagamentoDaNegociacao[];
  onChange: (v: DadosDoContrato, p: PagamentoDaNegociacao[]) => void;
}) {
  if (!contrato)
    return <p className="text-xs text-muted-foreground">Contrato no modelo anterior.</p>;
  const mudar = (v: Partial<DadosDoContrato>) => onChange({ ...contrato, ...v }, pagamentos);
  function pagamento(i: number, v: Partial<PagamentoDaNegociacao>) {
    onChange(
      contrato!,
      pagamentos.map((p, j) => (i === j ? { ...p, ...v } : p)),
    );
  }
  return (
    <details className="space-y-4 rounded-xl border p-3" data-testid="pdv-dados-contrato">
      <summary className="cursor-pointer text-sm font-medium">Dados do contrato</summary>
      <p className="text-xs text-muted-foreground">
        Revise antes de concluir. Os dados ficam guardados nesta negociação. Campos vazios aparecem
        com uma linha para preenchimento no PDF.
      </p>
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm">Empresa neste contrato</summary>
        <EditorDaEmpresa
          valor={contrato.empresa ?? {}}
          onChange={(empresa) =>
            mudar({ empresa: { ...contrato.empresa, ...empresa } as EmpresaContrato })
          }
        />
      </details>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          nome="Local da assinatura (cidade/UF)"
          valor={contrato.local}
          mudar={(local) => mudar({ local })}
        />
        <Campo
          nome="Data e hora da assinatura"
          tipo="datetime-local"
          valor={
            contrato.assinatura_em
              ? new Date(
                  new Date(contrato.assinatura_em).getTime() -
                    new Date(contrato.assinatura_em).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : ""
          }
          mudar={(v) => mudar({ assinatura_em: v ? new Date(v).toISOString() : undefined })}
        />
        <Campo
          nome="Entrega do veículo"
          tipo="date"
          valor={contrato.entrega_em}
          mudar={(entrega_em) => mudar({ entrega_em })}
        />
        <Campo
          nome="Recebimento do veículo na troca"
          tipo="date"
          valor={contrato.recebimento_troca_em}
          mudar={(recebimento_troca_em) => mudar({ recebimento_troca_em })}
        />
        <Campo
          nome="Atendido por"
          valor={contrato.atendido_por}
          mudar={(atendido_por) => mudar({ atendido_por })}
        />
      </div>
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm">Detalhes contratuais dos pagamentos</summary>
        {pagamentos.map((p, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium">
              Pagamento {i + 1} · {p.forma}
            </p>
            <Campo
              nome="Situação / responsável pelo pagamento"
              valor={p.situacao}
              mudar={(situacao) => pagamento(i, { situacao })}
            />
            <Campo
              nome="Data de emissão"
              tipo="date"
              valor={p.data_emissao}
              mudar={(data_emissao) => pagamento(i, { data_emissao: data_emissao || null })}
            />
            <Campo
              nome="Data de pagamento / previsão"
              tipo="date"
              valor={p.data_pagamento}
              mudar={(data_pagamento) => pagamento(i, { data_pagamento: data_pagamento || null })}
            />
            <Campo
              nome="Intervalo entre parcelas (dias)"
              tipo="number"
              valor={p.intervalo_dias?.toString()}
              mudar={(v) => pagamento(i, { intervalo_dias: v ? Number(v) : undefined })}
            />
            <Campo
              nome="Tipo e chave PIX"
              valor={p.chave_pix}
              mudar={(chave_pix) => pagamento(i, { chave_pix })}
            />
          </div>
        ))}
      </details>
      <EditorDeClausulas
        valor={contrato.clausulas ?? []}
        onChange={(clausulas) => mudar({ clausulas })}
      />
      <label className="block text-xs">
        Cláusula especial
        <textarea
          className={estilo}
          rows={4}
          maxLength={6000}
          value={contrato.clausula_especial ?? ""}
          onChange={(e) => mudar({ clausula_especial: e.target.value })}
        />
      </label>
    </details>
  );
}
