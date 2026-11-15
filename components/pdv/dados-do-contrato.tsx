"use client";

import {
  camposDaEmpresa,
  type EmpresaContrato,
  type DadosDoContrato,
  type regularizacaoSchema,
} from "@/lib/pdv/modelo-contrato";
import type { PagamentoDaNegociacao } from "@/lib/pdv/regras";
import type { BlocosDaOperacao } from "@/lib/pdv/retrato-da-operacao";
import type { z } from "zod";

const estilo = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
/** Asterisco por CSS: fica fora do nome acessível do campo, que já leva `aria-required`. */
const ASTERISCO = "after:ml-0.5 after:text-destructive after:content-['*']";

function Rotulo({ nome, obrigatorio }: { nome: string; obrigatorio?: boolean }) {
  return <span className={obrigatorio ? ASTERISCO : undefined}>{nome}</span>;
}

export function Campo({
  nome,
  valor,
  mudar,
  tipo = "text",
  obrigatorio,
  falta,
  testid,
  campo,
  ...resto
}: {
  nome: string;
  valor?: string | number | null;
  mudar: (v: string) => void;
  tipo?: string;
  obrigatorio?: boolean;
  /** Pendente agora: borda de alerta e `aria-invalid`. */
  falta?: boolean;
  testid?: string;
  /** Chave da pendência (`<onde>.<campo>`), para levar o operador até aqui. */
  campo?: string;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      <Rotulo nome={nome} obrigatorio={obrigatorio} />
      <input
        type={tipo}
        className={falta ? `${estilo} border-destructive` : estilo}
        value={valor ?? ""}
        aria-required={obrigatorio || undefined}
        aria-invalid={falta || undefined}
        data-testid={testid}
        data-campo={campo}
        onChange={(e) => mudar(e.target.value)}
        {...resto}
      />
    </label>
  );
}

function Escolha<T extends string>({
  nome,
  valor,
  opcoes,
  mudar,
  obrigatorio,
  falta,
  testid,
  campo,
}: {
  nome: string;
  falta?: boolean;
  campo?: string;
  valor?: T | null;
  opcoes: readonly (readonly [T, string])[];
  mudar: (v: T | undefined) => void;
  obrigatorio?: boolean;
  testid?: string;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      <Rotulo nome={nome} obrigatorio={obrigatorio} />
      <select
        className={falta ? `${estilo} border-destructive` : estilo}
        value={valor ?? ""}
        aria-required={obrigatorio || undefined}
        aria-invalid={falta || undefined}
        data-testid={testid}
        data-campo={campo}
        onChange={(e) => mudar((e.target.value || undefined) as T | undefined)}
      >
        <option value="">Selecione</option>
        {opcoes.map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Campos da empresa que o contrato exige (os demais imprimem em branco). */
export const EMPRESA_OBRIGATORIA: readonly (keyof EmpresaContrato)[] = [
  "razao_social",
  "cnpj",
  "endereco",
  "numero",
  "cidade",
  "uf",
];

export function EditorDaEmpresa({
  valor,
  onChange,
  somenteComplemento = false,
  comObrigatorios = false,
  faltando,
}: {
  valor: Partial<EmpresaContrato>;
  onChange: (v: Partial<EmpresaContrato>) => void;
  somenteComplemento?: boolean;
  /** No PDV, marca com asterisco o que bloqueia o contrato. */
  comObrigatorios?: boolean;
  /** Campos pendentes (`empresa.<campo>`), para destacar. */
  faltando?: ReadonlySet<string>;
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
            obrigatorio={comObrigatorios && EMPRESA_OBRIGATORIA.includes(k)}
            falta={faltando?.has(`empresa.${k}`)}
            campo={`empresa.${k}`}
            mudar={(v) => onChange({ ...valor, [k]: v })}
          />
        ))}
    </div>
  );
}

/** Representante legal e e-mail de privacidade: padrões da loja, revisáveis em cada contrato. */
export function EditorDoRepresentante({
  valor,
  onChange,
}: {
  valor: Partial<
    Pick<
      DadosDoContrato,
      "representante_nome" | "representante_cpf" | "representante_cargo" | "email_lgpd"
    >
  >;
  onChange: (v: typeof valor) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Campo
        nome="Representante legal (nome)"
        valor={valor.representante_nome}
        campo="contrato.representante_nome"
        mudar={(representante_nome) => onChange({ ...valor, representante_nome })}
      />
      <Campo
        nome="CPF do representante"
        valor={valor.representante_cpf}
        campo="contrato.representante_cpf"
        mudar={(representante_cpf) => onChange({ ...valor, representante_cpf })}
      />
      <Campo
        nome="Cargo do representante"
        valor={valor.representante_cargo}
        mudar={(representante_cargo) => onChange({ ...valor, representante_cargo })}
      />
      <Campo
        nome="E-mail para assuntos de privacidade (LGPD)"
        tipo="email"
        valor={valor.email_lgpd}
        mudar={(email_lgpd) => onChange({ ...valor, email_lgpd })}
      />
    </div>
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

/** O que a operação exige do contrato; decide os asteriscos condicionais. */
export interface RequisitosDoContrato {
  venda: boolean;
  blocos: BlocosDaOperacao;
}

const numero = (v: string) => (v.trim() === "" ? undefined : Number(v));
const reais = (c?: number) => (c == null ? "" : (c / 100).toString());

function Setor({
  titulo,
  id,
  descricao,
  children,
}: {
  titulo: string;
  id: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <details open className="space-y-3 rounded-lg border p-3" id={id} data-testid={id}>
      <summary className="cursor-pointer text-sm font-medium">{titulo}</summary>
      {descricao ? <p className="text-xs text-muted-foreground">{descricao}</p> : null}
      {children}
    </details>
  );
}

export function EditorDoContrato({
  contrato,
  pagamentos,
  onChange,
  requisitos,
  faltando,
}: {
  contrato?: DadosDoContrato | null;
  pagamentos: PagamentoDaNegociacao[];
  onChange: (v: DadosDoContrato, p: PagamentoDaNegociacao[]) => void;
  /** Sem requisitos (ex.: compra), só os campos fixos levam asterisco. */
  requisitos?: RequisitosDoContrato;
  /** Campos pendentes agora, como `contrato.entrega_em` ou `empresa.cnpj`. */
  faltando?: ReadonlySet<string>;
}) {
  if (!contrato)
    return <p className="text-xs text-muted-foreground">Contrato no modelo anterior.</p>;
  const c = contrato;
  const mudar = (v: Partial<DadosDoContrato>) => onChange({ ...c, ...v }, pagamentos);
  function pagamento(i: number, v: Partial<PagamentoDaNegociacao>) {
    onChange(
      c,
      pagamentos.map((p, j) => (i === j ? { ...p, ...v } : p)),
    );
  }
  const venda = requisitos?.venda ?? false;
  const blocos = requisitos?.blocos;
  const f = (campo: string) => faltando?.has(`contrato.${campo}`);
  const debitos = c.debitos ?? {};
  const mudarDebitos = (v: Partial<NonNullable<DadosDoContrato["debitos"]>>) =>
    mudar({ debitos: { ...debitos, ...v } });
  const testemunhas = [0, 1].map((i) => c.testemunhas?.[i] ?? { nome: "", cpf: "" });
  function testemunha(i: number, v: Partial<{ nome: string; cpf: string }>) {
    const lista = testemunhas.map((t, j) => (i === j ? { ...t, ...v } : t));
    mudar({ testemunhas: lista.filter((t) => t.nome.trim() || t.cpf.trim()) });
  }
  const garantia = c.garantia_contratual ?? { prazo: "", componentes: "" };
  function mudarGarantia(v: Partial<typeof garantia>) {
    const g = { ...garantia, ...v };
    mudar({ garantia_contratual: g.prazo.trim() || g.componentes.trim() ? g : undefined });
  }
  return (
    <section className="space-y-3" data-testid="pdv-dados-contrato">
      <h3 className="text-sm font-normal text-muted-foreground">Dados do contrato</h3>
      <p className="text-xs text-muted-foreground">
        Campos com <span className="text-destructive">*</span> são obrigatórios para concluir. Os
        demais saem em branco no contrato, para preenchimento à mão.
      </p>

      <Setor id="pdv-setor-loja" titulo="Loja (vendedora)">
        <EditorDaEmpresa
          comObrigatorios
          faltando={faltando}
          valor={c.empresa ?? {}}
          onChange={(empresa) =>
            mudar({ empresa: { ...c.empresa, ...empresa } as EmpresaContrato })
          }
        />
        <EditorDoRepresentante valor={c} onChange={(v) => mudar(v)} />
        <Campo
          nome="Atendido por"
          valor={c.atendido_por}
          mudar={(atendido_por) => mudar({ atendido_por })}
        />
      </Setor>

      <Setor id="pdv-setor-entrega" titulo="Entrega e transferência">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            nome="Entrega do veículo"
            tipo="date"
            obrigatorio
            falta={f("entrega_em")}
            campo="contrato.entrega_em"
            valor={c.entrega_em}
            mudar={(entrega_em) => mudar({ entrega_em })}
          />
          <Campo
            nome="Hora da entrega"
            tipo="time"
            valor={c.entrega_hora}
            mudar={(entrega_hora) => mudar({ entrega_hora })}
          />
          {!requisitos || blocos?.troca ? (
            <>
              <Campo
                nome="Recebimento do veículo na troca"
                tipo="date"
                obrigatorio={!!blocos?.troca}
                falta={f("recebimento_troca_em")}
                campo="contrato.recebimento_troca_em"
                valor={c.recebimento_troca_em}
                mudar={(recebimento_troca_em) => mudar({ recebimento_troca_em })}
              />
              <Campo
                nome="Hora do recebimento da troca"
                tipo="time"
                valor={c.recebimento_troca_hora}
                mudar={(recebimento_troca_hora) => mudar({ recebimento_troca_hora })}
              />
            </>
          ) : null}
          <Escolha
            nome="Taxas de transferência pagas por"
            obrigatorio={venda}
            falta={f("transferencia_taxas_por")}
            campo="contrato.transferencia_taxas_por"
            valor={c.transferencia_taxas_por}
            opcoes={[
              ["comprador", "Comprador"],
              ["vendedora", "Loja (vendedora)"],
            ]}
            mudar={(transferencia_taxas_por) => mudar({ transferencia_taxas_por })}
          />
          <Campo
            nome="Prazo da transferência (dias)"
            tipo="number"
            min={1}
            max={90}
            obrigatorio={venda}
            falta={f("transferencia_prazo_dias")}
            campo="contrato.transferencia_prazo_dias"
            valor={c.transferencia_prazo_dias}
            mudar={(v) => mudar({ transferencia_prazo_dias: numero(v) })}
          />
          <Escolha
            nome="Prazo contado a partir da"
            valor={c.transferencia_conta_de}
            opcoes={[
              ["assinatura", "Assinatura"],
              ["quitacao", "Quitação"],
            ]}
            mudar={(transferencia_conta_de) => mudar({ transferencia_conta_de })}
          />
          <Campo
            nome="Despachante (R$)"
            tipo="number"
            min={0}
            step="0.01"
            valor={reais(c.despachante_cents)}
            mudar={(v) =>
              mudar({
                despachante_cents: v.trim() === "" ? undefined : Math.round(Number(v) * 100),
              })
            }
          />
        </div>
      </Setor>

      <Setor id="pdv-setor-contrato" titulo="Contrato">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            nome="Local da assinatura (cidade/UF)"
            obrigatorio
            falta={f("local")}
            campo="contrato.local"
            valor={c.local}
            mudar={(local) => mudar({ local })}
          />
          <Campo
            nome="Data e hora da assinatura"
            tipo="datetime-local"
            valor={
              c.assinatura_em
                ? new Date(
                    new Date(c.assinatura_em).getTime() -
                      new Date(c.assinatura_em).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : ""
            }
            mudar={(v) => mudar({ assinatura_em: v ? new Date(v).toISOString() : undefined })}
          />
          <Escolha
            nome="Test drive"
            valor={c.test_drive}
            campo="contrato.test_drive"
            opcoes={[
              ["fez", "O comprador fez o test drive"],
              ["dispensou", "O comprador dispensou"],
            ]}
            mudar={(test_drive) => mudar({ test_drive })}
          />
          {blocos?.quitacao_da_troca ? (
            <Campo
              nome="Prazo para a loja quitar a troca (dias)"
              tipo="number"
              min={1}
              max={90}
              obrigatorio
              falta={f("quitacao_troca_prazo_dias")}
              campo="contrato.quitacao_troca_prazo_dias"
              valor={c.quitacao_troca_prazo_dias}
              mudar={(v) => mudar({ quitacao_troca_prazo_dias: numero(v) })}
            />
          ) : null}
          {blocos?.financiamento_bancario ? (
            <Campo
              nome="Prazo de liberação do financiamento (dias)"
              tipo="number"
              min={1}
              max={90}
              obrigatorio
              falta={f("financiamento_prazo_dias")}
              campo="contrato.financiamento_prazo_dias"
              valor={c.financiamento_prazo_dias}
              mudar={(v) => mudar({ financiamento_prazo_dias: numero(v) })}
            />
          ) : null}
          {blocos?.financiamento_bancario || blocos?.parcelas_a_loja ? (
            <Campo
              nome="Retenção por mês de uso, se desfeito (%)"
              tipo="number"
              min={0}
              max={10}
              step="0.1"
              valor={c.retencao_percentual_mes}
              campo="contrato.retencao_percentual_mes"
              mudar={(v) => mudar({ retencao_percentual_mes: numero(v) })}
            />
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!c.venda_fora_do_estabelecimento}
            onChange={(e) => mudar({ venda_fora_do_estabelecimento: e.target.checked })}
          />
          Venda fora do estabelecimento (dá ao comprador 7 dias de arrependimento)
        </label>

        <details className="space-y-3">
          <summary className="cursor-pointer text-sm">Consulta de débitos do veículo</summary>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo
              nome="Data da consulta no Detran"
              tipo="date"
              valor={c.consulta_debitos_em}
              campo="contrato.consulta_debitos_em"
              mudar={(consulta_debitos_em) => mudar({ consulta_debitos_em })}
            />
            <Escolha
              nome="Débitos anteriores à entrega pagos por"
              valor={debitos.responsavel}
              opcoes={[
                ["vendedora", "Loja (vendedora)"],
                ["comprador", "Comprador"],
              ]}
              mudar={(responsavel) => mudarDebitos({ responsavel })}
            />
            <Campo
              nome="IPVA e licenciamento"
              valor={debitos.ipva_licenciamento}
              mudar={(ipva_licenciamento) => mudarDebitos({ ipva_licenciamento })}
            />
            <Campo
              nome="Multas"
              valor={debitos.multas}
              mudar={(multas) => mudarDebitos({ multas })}
            />
            <Campo
              nome="Restrições"
              valor={debitos.restricoes}
              mudar={(restricoes) => mudarDebitos({ restricoes })}
            />
            <Campo
              nome="Leilão ou sinistro"
              valor={debitos.leilao_sinistro}
              mudar={(leilao_sinistro) => mudarDebitos({ leilao_sinistro })}
            />
            <Campo
              nome="Recall"
              valor={debitos.recall}
              mudar={(recall) => mudarDebitos({ recall })}
            />
          </div>
        </details>

        <details className="space-y-3">
          <summary className="cursor-pointer text-sm">Garantia contratual (opcional)</summary>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo
              nome="Prazo da garantia"
              placeholder="ex.: 3 meses"
              valor={garantia.prazo}
              mudar={(prazo) => mudarGarantia({ prazo })}
            />
            <Campo
              nome="Componentes cobertos"
              placeholder="ex.: motor e câmbio"
              valor={garantia.componentes}
              mudar={(componentes) => mudarGarantia({ componentes })}
            />
          </div>
        </details>

        <details className="space-y-3">
          <summary className="cursor-pointer text-sm">Testemunhas</summary>
          {testemunhas.map((t, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                nome={`Testemunha ${i + 1} (nome)`}
                valor={t.nome}
                mudar={(nome) => testemunha(i, { nome })}
              />
              <Campo
                nome={`CPF da testemunha ${i + 1}`}
                valor={t.cpf}
                mudar={(cpf) => testemunha(i, { cpf })}
              />
            </div>
          ))}
        </details>

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
                valor={p.intervalo_dias}
                mudar={(v) => pagamento(i, { intervalo_dias: numero(v) })}
              />
              <Campo
                nome="Tipo e chave PIX"
                valor={p.chave_pix}
                mudar={(chave_pix) => pagamento(i, { chave_pix })}
              />
            </div>
          ))}
        </details>

        <p className="text-xs text-muted-foreground">
          As cláusulas do contrato são as do modelo da loja e não se editam aqui. Condições
          específicas desta operação entram na cláusula especial.
        </p>
        <label className="block text-xs text-muted-foreground">
          Cláusula especial
          <textarea
            className={estilo}
            rows={4}
            maxLength={6000}
            value={c.clausula_especial ?? ""}
            onChange={(e) => mudar({ clausula_especial: e.target.value })}
          />
        </label>
      </Setor>
    </section>
  );
}
