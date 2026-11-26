"use client";

import Link from "next/link";
import { useState } from "react";

import {
  camposDaEmpresa,
  type EmpresaContrato,
  type DadosDoContrato,
  type regularizacaoSchema,
} from "@/lib/pdv/modelo-contrato";
import { ROTULO_DA_FORMA, type PagamentoDaNegociacao } from "@/lib/pdv/regras";
import type { BlocosDaOperacao } from "@/lib/pdv/retrato-da-operacao";
import type { z } from "zod";
import {
  CONFERENCIAS,
  ITENS_DA_VISTORIA,
  RESULTADOS_DA_CAUTELAR,
  SITUACOES,
  SULCO_MINIMO_MM,
  usaLaudoDeVistoria,
  type Vistoria,
} from "@/lib/pdv/laudo-vistoria";
import {
  COMBUSTIVEIS,
  ITENS_DA_ENTREGA,
  type ItemDaEntrega,
  type TermoDeEntrega,
} from "@/lib/pdv/termo-entrega";
import {
  DECLARACOES_DO_CLIENTE,
  ITENS_DO_RECEBIMENTO,
  PAGADORES_DOS_DEBITOS,
  type DeclaracaoDoCliente,
  type ItemDoRecebimento,
  type TermoDeRecebimento,
} from "@/lib/pdv/termo-recebimento";

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

const numeroOuNada = (t: string) => (t.trim() === "" ? undefined : Number(t));

/** Termo de entrega (Anexo II da venda), preenchido no ato da entrega. */
function EditorDoTermoDeEntrega({
  valor: t,
  mudar,
}: {
  valor: TermoDeEntrega;
  mudar: (t: TermoDeEntrega) => void;
}) {
  const set = (p: Partial<TermoDeEntrega>) => mudar({ ...t, ...p });
  const fun = t.funcionario ?? {};
  const ret = t.retirada_por ?? {};
  const [terceiro, setTerceiro] = useState(Boolean(ret.nome || ret.cpf || ret.cnh));
  const item = (k: ItemDaEntrega) => t.itens?.[k] ?? {};
  const setItem = (k: ItemDaEntrega, p: Partial<ReturnType<typeof item>>) =>
    set({ itens: { ...t.itens, [k]: { ...item(k), ...p } } });
  const opcao = (ativo: boolean) =>
    `px-3 py-1.5 ${ativo ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`;
  return (
    <div className="@container space-y-4 border-t pt-4" data-testid="pdv-termo-entrega">
      <div>
        <p className="text-sm">Termo de entrega e responsabilidade (Anexo II do contrato)</p>
        <p className="text-xs text-muted-foreground">
          Preencha no ato da entrega. A quilometragem vem da vistoria.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
        <Escolha
          nome="Nível de combustível"
          campo="contrato.termo_entrega.combustivel"
          valor={t.combustivel}
          opcoes={COMBUSTIVEIS}
          mudar={(combustivel) => set({ combustivel })}
        />
        <Campo
          nome="Local da entrega"
          placeholder="Em branco: endereço da loja"
          valor={t.local}
          mudar={(local) => set({ local })}
        />
        <Campo
          nome="Fotos da entrega (quantidade)"
          tipo="number"
          min={0}
          max={500}
          valor={t.fotos}
          mudar={(v) => set({ fotos: numeroOuNada(v) })}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        <Campo
          nome="Funcionário que entrega"
          placeholder="Em branco: representante da loja"
          valor={fun.nome}
          mudar={(nome) => set({ funcionario: { ...fun, nome } })}
        />
        <Campo
          nome="CPF do funcionário"
          valor={fun.cpf}
          mudar={(cpf) => set({ funcionario: { ...fun, cpf } })}
        />
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={terceiro}
            onChange={(e) => {
              setTerceiro(e.target.checked);
              if (!e.target.checked) set({ retirada_por: undefined });
            }}
          />
          Outra pessoa retira o veículo no lugar do comprador
        </label>
        {terceiro ? (
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
            <Campo
              nome="Nome de quem retira"
              valor={ret.nome}
              mudar={(nome) => set({ retirada_por: { ...ret, nome } })}
            />
            <Campo
              nome="CPF de quem retira"
              campo="contrato.termo_entrega.retirada_por.cpf"
              valor={ret.cpf}
              mudar={(cpf) => set({ retirada_por: { ...ret, cpf } })}
            />
            <Campo
              nome="CNH de quem retira"
              valor={ret.cnh}
              mudar={(cnh) => set({ retirada_por: { ...ret, cnh } })}
            />
          </div>
        ) : null}
      </div>

      <fieldset className="rounded-lg border" data-campo="contrato.termo_entrega.itens">
        <legend className="ml-2 px-1 text-xs text-muted-foreground">
          Itens entregues com o veículo
        </legend>
        <ul className="divide-y">
          {ITENS_DA_ENTREGA.map(([k, rotulo]) => {
            const it = item(k);
            return (
              <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm">{rotulo}</span>
                <div
                  role="group"
                  aria-label={rotulo}
                  className="flex overflow-hidden rounded-md border text-xs"
                >
                  {([true, false] as const).map((sim) => (
                    <button
                      key={String(sim)}
                      type="button"
                      aria-pressed={it.entregue === sim}
                      className={opcao(it.entregue === sim)}
                      onClick={() =>
                        setItem(k, { entregue: it.entregue === sim ? undefined : sim })
                      }
                    >
                      {sim ? "Entregue" : "Não entregue"}
                    </button>
                  ))}
                </div>
                <input
                  aria-label={`Observação: ${rotulo}`}
                  placeholder="Observação"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs @md:w-56"
                  value={it.obs ?? ""}
                  onChange={(e) => setItem(k, { obs: e.target.value })}
                />
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label className="block text-xs text-muted-foreground">
        Avarias ou observações no ato da entrega
        <textarea
          className={estilo}
          rows={2}
          placeholder="Além do que já consta no laudo de vistoria"
          value={t.avarias ?? ""}
          onChange={(e) => set({ avarias: e.target.value })}
        />
      </label>
    </div>
  );
}

/** Laudo de vistoria da venda (Anexo I). Campos simples; o visual fica para depois. */
/** Termo de recebimento do VEÍCULO EM PAGAMENTO, preenchido no ato do recebimento. */
function EditorDoTermoDeRecebimento({
  valor: t,
  mudar,
}: {
  valor: TermoDeRecebimento;
  mudar: (t: TermoDeRecebimento) => void;
}) {
  const set = (p: Partial<TermoDeRecebimento>) => mudar({ ...t, ...p });
  const fun = t.funcionario ?? {};
  const ent = t.entregue_por ?? {};
  const deb = t.debitos ?? {};
  const [terceiro, setTerceiro] = useState(Boolean(ent.nome || ent.cpf));
  const item = (k: ItemDoRecebimento) => t.itens?.[k] ?? {};
  const setItem = (k: ItemDoRecebimento, p: Partial<ReturnType<typeof item>>) =>
    set({ itens: { ...t.itens, [k]: { ...item(k), ...p } } });
  const decl = (k: DeclaracaoDoCliente) => t.declaracoes?.[k] ?? {};
  const setDecl = (k: DeclaracaoDoCliente, p: Partial<ReturnType<typeof decl>>) =>
    set({ declaracoes: { ...t.declaracoes, [k]: { ...decl(k), ...p } } });
  const setDeb = (p: Partial<typeof deb>) => set({ debitos: { ...deb, ...p } });
  const opcao = (ativo: boolean) =>
    `px-3 py-1.5 ${ativo ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`;
  const obs = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs @md:w-56";
  return (
    <div className="@container space-y-4 border-t pt-4" data-testid="pdv-termo-recebimento">
      <div>
        <p className="text-sm">Termo de recebimento do veículo em pagamento</p>
        <p className="text-xs text-muted-foreground">
          Preencha no ato do recebimento. Data, hora, km e chaves ficam nos campos do recebimento acima.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
        <Escolha
          nome="Nível de combustível"
          campo="contrato.termo_recebimento.combustivel"
          valor={t.combustivel}
          opcoes={COMBUSTIVEIS}
          mudar={(combustivel) => set({ combustivel })}
        />
        <Campo
          nome="Local do recebimento"
          placeholder="Em branco: endereço da loja"
          valor={t.local}
          mudar={(local) => set({ local })}
        />
        <Campo
          nome="Fotos do recebimento (quantidade)"
          tipo="number"
          min={0}
          max={500}
          valor={t.fotos}
          mudar={(v) => set({ fotos: numeroOuNada(v) })}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
        <Campo
          nome="Funcionário que recebe"
          placeholder="Em branco: representante da loja"
          valor={fun.nome}
          mudar={(nome) => set({ funcionario: { ...fun, nome } })}
        />
        <Campo
          nome="CPF do funcionário"
          valor={fun.cpf}
          mudar={(cpf) => set({ funcionario: { ...fun, cpf } })}
        />
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={terceiro}
            onChange={(e) => {
              setTerceiro(e.target.checked);
              if (!e.target.checked) set({ entregue_por: undefined });
            }}
          />
          Outra pessoa entrega o veículo no lugar do comprador
        </label>
        {terceiro ? (
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            <Campo
              nome="Nome de quem entrega"
              valor={ent.nome}
              mudar={(nome) => set({ entregue_por: { ...ent, nome } })}
            />
            <Campo
              nome="CPF de quem entrega"
              campo="contrato.termo_recebimento.entregue_por.cpf"
              valor={ent.cpf}
              mudar={(cpf) => set({ entregue_por: { ...ent, cpf } })}
            />
          </div>
        ) : null}
      </div>

      <fieldset className="rounded-lg border" data-campo="contrato.termo_recebimento.itens">
        <legend className="ml-2 px-1 text-xs text-muted-foreground">
          Itens recebidos com o veículo
        </legend>
        <ul className="divide-y">
          {ITENS_DO_RECEBIMENTO.map(([k, rotulo]) => {
            const it = item(k);
            return (
              <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm">{rotulo}</span>
                <div
                  role="group"
                  aria-label={rotulo}
                  className="flex overflow-hidden rounded-md border text-xs"
                >
                  {([true, false] as const).map((sim) => (
                    <button
                      key={String(sim)}
                      type="button"
                      aria-pressed={it.recebido === sim}
                      className={opcao(it.recebido === sim)}
                      onClick={() =>
                        setItem(k, { recebido: it.recebido === sim ? undefined : sim })
                      }
                    >
                      {sim ? "Recebido" : "Não recebido"}
                    </button>
                  ))}
                </div>
                <input
                  aria-label={`Observação: ${rotulo}`}
                  placeholder="Observação"
                  className={obs}
                  value={it.obs ?? ""}
                  onChange={(e) => setItem(k, { obs: e.target.value })}
                />
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label className="block text-xs text-muted-foreground">
        Avarias ou observações no ato do recebimento
        <textarea
          className={estilo}
          rows={2}
          value={t.avarias ?? ""}
          onChange={(e) => set({ avarias: e.target.value })}
        />
      </label>

      <fieldset className="rounded-lg border" data-campo="contrato.termo_recebimento.declaracoes">
        <legend className="ml-2 px-1 text-xs text-muted-foreground">
          Declarações do comprador sobre o veículo (pergunte e registre a resposta)
        </legend>
        <ul className="divide-y">
          {DECLARACOES_DO_CLIENTE.map(([k, pergunta]) => {
            const d = decl(k);
            return (
              <li
                key={k}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
                data-campo={`contrato.termo_recebimento.declaracoes.${k}`}
              >
                <span className="min-w-0 flex-1 text-sm">{pergunta}</span>
                <div
                  role="group"
                  aria-label={pergunta}
                  className="flex overflow-hidden rounded-md border text-xs"
                >
                  {([true, false] as const).map((sim) => (
                    <button
                      key={String(sim)}
                      type="button"
                      aria-pressed={d.resposta === sim}
                      className={opcao(d.resposta === sim)}
                      onClick={() =>
                        setDecl(k, { resposta: d.resposta === sim ? undefined : sim })
                      }
                    >
                      {sim ? "Sim" : "Não"}
                    </button>
                  ))}
                </div>
                <input
                  aria-label={`Detalhe: ${pergunta}`}
                  placeholder="Detalhe"
                  className={obs}
                  value={d.detalhe ?? ""}
                  onChange={(e) => setDecl(k, { detalhe: e.target.value })}
                />
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Consulta de débitos do veículo recebido</p>
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
          <Campo
            nome="Consulta feita em"
            tipo="date"
            valor={deb.consulta_em}
            mudar={(consulta_em) => setDeb({ consulta_em })}
          />
          <Campo nome="IPVA" placeholder="Ex.: quitado" valor={deb.ipva} mudar={(ipva) => setDeb({ ipva })} />
          <Campo
            nome="Licenciamento"
            valor={deb.licenciamento}
            mudar={(licenciamento) => setDeb({ licenciamento })}
          />
          <Campo nome="Multas" valor={deb.multas} mudar={(multas) => setDeb({ multas })} />
          <Campo
            nome="Restrições"
            valor={deb.restricoes}
            mudar={(restricoes) => setDeb({ restricoes })}
          />
          <Escolha
            nome="Débitos encontrados são pagos por"
            valor={deb.pagos_por}
            opcoes={PAGADORES_DOS_DEBITOS}
            mudar={(pagos_por) => setDeb({ pagos_por })}
          />
        </div>
      </div>
    </div>
  );
}

function EditorDaVistoria({
  valor: v,
  mudar,
  f,
}: {
  valor: Vistoria;
  mudar: (v: Vistoria) => void;
  f: (campo: string) => boolean | undefined;
}) {
  const id = v.identificacao ?? {};
  const set = (p: Partial<Vistoria>) => mudar({ ...v, ...p });
  const setId = (p: Partial<typeof id>) => set({ identificacao: { ...id, ...p } });
  const item = (k: (typeof ITENS_DA_VISTORIA)[number][0]) => v.itens?.[k] ?? {};
  const setItem = (k: (typeof ITENS_DA_VISTORIA)[number][0], p: Partial<ReturnType<typeof item>>) =>
    set({ itens: { ...v.itens, [k]: { ...item(k), ...p } } });
  const avarias = v.avarias ?? [];
  const cautelar = v.cautelar ?? {};
  const setCautelar = (p: Partial<typeof cautelar>) => set({ cautelar: { ...cautelar, ...p } });
  return (
    <div className="space-y-3" data-testid="pdv-vistoria">
      <p className="text-sm">Laudo de vistoria e estado do veículo (Anexo I do contrato)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          nome="Data da vistoria"
          tipo="date"
          obrigatorio
          falta={f("vistoria.data")}
          campo="contrato.vistoria.data"
          valor={v.data}
          mudar={(data) => set({ data: data || undefined })}
        />
        <Campo nome="Hora" tipo="time" valor={v.hora} mudar={(hora) => set({ hora })} />
        <Campo
          nome="Vistoriador (em branco: representante da loja)"
          falta={f("vistoria.vistoriador")}
          campo="contrato.vistoria.vistoriador"
          valor={v.vistoriador}
          mudar={(vistoriador) => set({ vistoriador })}
        />
        <Escolha
          nome="O comprador acompanhou?"
          obrigatorio
          falta={f("vistoria.comprador_acompanhou")}
          campo="contrato.vistoria.comprador_acompanhou"
          valor={
            v.comprador_acompanhou == null ? undefined : v.comprador_acompanhou ? "sim" : "nao"
          }
          opcoes={
            [
              ["sim", "Sim"],
              ["nao", "Não"],
            ] as const
          }
          mudar={(r) => set({ comprador_acompanhou: r == null ? undefined : r === "sim" })}
        />
        <Campo
          nome="Km conferida"
          tipo="number"
          min={0}
          obrigatorio
          falta={f("vistoria.km")}
          campo="contrato.vistoria.km"
          valor={v.km}
          mudar={(km) => set({ km: numeroOuNada(km) })}
        />
      </div>

      <p className="text-xs text-muted-foreground">Identificação conferida com o documento</p>
      {f("vistoria.identificacao") ? (
        <p role="alert" className="text-sm text-destructive">
          Chassi ou motor divergente, ou com sinal de remarcação: não conclua a venda e verifique a
          origem do veículo.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["placa", "chassi", "motor", "renavam"] as const).map((k) => (
          <Escolha
            key={k}
            nome={
              { placa: "Placa", chassi: "Chassi", motor: "Número do motor", renavam: "Renavam" }[k]
            }
            obrigatorio
            falta={f(`vistoria.identificacao.${k}`)}
            campo={`contrato.vistoria.identificacao.${k}`}
            valor={id[k]}
            opcoes={CONFERENCIAS}
            mudar={(r) => setId({ [k]: r })}
          />
        ))}
        <Escolha
          nome="Sinal de remarcação"
          obrigatorio
          falta={f("vistoria.identificacao.remarcacao")}
          campo="contrato.vistoria.identificacao.remarcacao"
          valor={id.remarcacao}
          opcoes={
            [
              ["nao", "Não"],
              ["sim", "Sim"],
            ] as const
          }
          mudar={(remarcacao) => setId({ remarcacao })}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Itens (A = avaria: descreva; NV = não verificado: justifique)
      </p>
      <div className="space-y-2">
        {ITENS_DA_VISTORIA.map(([k, , rotulo]) => {
          const it = item(k);
          return (
            <div key={k} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Escolha
                nome={rotulo}
                obrigatorio
                falta={f(`vistoria.itens.${k}`)}
                campo={`contrato.vistoria.itens.${k}`}
                valor={it.estado}
                opcoes={SITUACOES}
                mudar={(estado) => setItem(k, { estado })}
              />
              <Campo
                nome={it.estado === "A" ? "Descrição da avaria" : "Observação"}
                valor={it.obs}
                mudar={(obs) => setItem(k, { obs })}
              />
              {it.estado === "NV" ? (
                <Campo
                  nome="Justificativa"
                  valor={it.justificativa}
                  mudar={(justificativa) => setItem(k, { justificativa })}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo
          nome={`Menor sulco dos pneus (mm; mínimo ${SULCO_MINIMO_MM})`}
          tipo="number"
          min={0}
          step="0.1"
          valor={v.sulco_mm}
          mudar={(t) => set({ sulco_mm: numeroOuNada(t) })}
        />
        <Campo
          nome="Fotos (quantidade)"
          tipo="number"
          min={0}
          valor={v.fotos?.quantidade}
          mudar={(t) => set({ fotos: { ...v.fotos, quantidade: numeroOuNada(t) } })}
        />
        <Campo
          nome="Fotos (onde estão)"
          placeholder="ex.: WhatsApp do cliente"
          valor={v.fotos?.meio}
          mudar={(meio) => set({ fotos: { ...v.fotos, meio } })}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Outras avarias (as marcadas A nos itens já entram no laudo)
      </p>
      {avarias.map((a, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Campo
            nome={`Avaria ${i + 1}`}
            valor={a.descricao}
            mudar={(descricao) =>
              set({ avarias: avarias.map((x, j) => (i === j ? { ...x, descricao } : x)) })
            }
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={a.loja_repara}
              onChange={(e) =>
                set({
                  avarias: avarias.map((x, j) =>
                    i === j ? { ...x, loja_repara: e.target.checked } : x,
                  ),
                })
              }
            />
            Loja repara antes da entrega
          </label>
          <button
            type="button"
            className="text-left text-xs underline"
            onClick={() => set({ avarias: avarias.filter((_, j) => j !== i) })}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs underline"
        onClick={() => set({ avarias: [...avarias, { descricao: "", loja_repara: false }] })}
      >
        Adicionar avaria
      </button>

      <details className="space-y-3">
        <summary className="cursor-pointer text-sm">Laudo cautelar (opcional)</summary>
        {cautelar.resultado === "reprovado" ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            Laudo cautelar REPROVADO: o comprador vai declarar no contrato que sabe disso e decidiu
            prosseguir.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            nome="Empresa"
            valor={cautelar.empresa}
            mudar={(empresa) => setCautelar({ empresa })}
          />
          <Campo nome="CNPJ" valor={cautelar.cnpj} mudar={(cnpj) => setCautelar({ cnpj })} />
          <Campo
            nome="Número do laudo"
            valor={cautelar.numero}
            mudar={(numero) => setCautelar({ numero })}
          />
          <Campo
            nome="Data"
            tipo="date"
            valor={cautelar.data}
            mudar={(data) => setCautelar({ data: data || undefined })}
          />
          <Escolha
            nome="Resultado"
            valor={cautelar.resultado}
            opcoes={RESULTADOS_DA_CAUTELAR}
            mudar={(resultado) => setCautelar({ resultado })}
          />
          <Campo
            nome="Apontamentos"
            valor={cautelar.apontamentos}
            mudar={(apontamentos) => setCautelar({ apontamentos })}
          />
        </div>
      </details>
    </div>
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

/** RENAVE e fruição: padrões da loja, revisáveis em cada contrato. */
export function EditorDosPrazos({
  valor,
  onChange,
}: {
  valor: Partial<
    Pick<DadosDoContrato, "usa_renave" | "prazo_renave_dias" | "prazo_atpve_dias" | "taxa_fruicao">
  >;
  onChange: (v: typeof valor) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!valor.usa_renave}
          onChange={(e) => onChange({ ...valor, usa_renave: e.target.checked })}
        />
        A loja registra a saída no RENAVE
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {valor.usa_renave ? (
          <Campo
            nome="Prazo do registro no RENAVE (dias úteis)"
            tipo="number"
            min={1}
            max={10}
            valor={valor.prazo_renave_dias}
            campo="contrato.prazo_renave_dias"
            mudar={(v) => onChange({ ...valor, prazo_renave_dias: numero(v) })}
          />
        ) : (
          <Campo
            nome="Prazo de entrega do ATPV-e (dias úteis)"
            tipo="number"
            min={1}
            max={10}
            valor={valor.prazo_atpve_dias}
            campo="contrato.prazo_atpve_dias"
            mudar={(v) => onChange({ ...valor, prazo_atpve_dias: numero(v) })}
          />
        )}
        <Campo
          nome="Fruição por mês de uso, se desfeito (%)"
          tipo="number"
          min={0}
          max={10}
          step="0.1"
          valor={valor.taxa_fruicao}
          campo="contrato.taxa_fruicao"
          mudar={(v) => onChange({ ...valor, taxa_fruicao: numero(v) })}
        />
      </div>
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
    <details className="space-y-3 rounded-lg border p-3" id={id} data-testid={id}>
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
  onSalvarPadrao,
  mostrarTitulo = true,
  recebimentoNaTroca = false,
}: {
  contrato?: DadosDoContrato | null;
  mostrarTitulo?: boolean;
  recebimentoNaTroca?: boolean;
  pagamentos: PagamentoDaNegociacao[];
  onChange: (v: DadosDoContrato, p: PagamentoDaNegociacao[]) => void;
  /** Sem requisitos (ex.: compra), só os campos fixos levam asterisco. */
  requisitos?: RequisitosDoContrato;
  /** Campos pendentes agora, como `contrato.entrega_em` ou `empresa.cnpj`. */
  faltando?: ReadonlySet<string>;
  /** Presente só para quem pode administrar a empresa: grava os dados da loja como padrão. */
  onSalvarPadrao?: (c: DadosDoContrato) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editandoLoja, setEditandoLoja] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [avisoPadrao, setAvisoPadrao] = useState<string | null>(null);
  const [condicaoAberta, setCondicaoAberta] = useState<boolean>();
  if (!contrato)
    return <p className="text-xs text-muted-foreground">Contrato no modelo anterior.</p>;
  const c = contrato;
  const temCondicao = Boolean(c.clausula_especial?.trim());
  const mostrarCondicao = condicaoAberta ?? temCondicao;
  const mudar = (v: Partial<DadosDoContrato>) => onChange({ ...c, ...v }, pagamentos);
  function pagamento(i: number, v: Partial<PagamentoDaNegociacao>) {
    onChange(
      c,
      pagamentos.map((p, j) => (i === j ? { ...p, ...v } : p)),
    );
  }
  const detalhesDosPagamentos = pagamentos.flatMap((p, indice) => {
    const temValor = p.valor_cents > 0;
    const temTitulo = temValor && ["boleto", "cheque", "promissoria"].includes(p.forma);
    const aPrazo = temTitulo || (temValor && ["financiamento", "consorcio"].includes(p.forma));
    const campos = {
      situacao: aPrazo || Boolean(p.situacao?.trim()),
      emissao: temTitulo || Boolean(p.data_emissao),
      previsao: aPrazo || Boolean(p.data_pagamento),
      intervalo: (temTitulo && p.parcelas > 1) || Boolean(p.intervalo_dias),
      chavePix: Boolean(p.chave_pix?.trim()),
    };
    return Object.values(campos).some(Boolean) ? [{ p, indice, campos }] : [];
  });
  const lojaCompleta = EMPRESA_OBRIGATORIA.every((k) => (c.empresa?.[k] ?? "").trim() !== "");
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
  const estado = c.estado_veiculo ?? {};
  const mudarEstado = (v: Partial<typeof estado>) => mudar({ estado_veiculo: { ...estado, ...v } });
  const garantia = c.garantia_contratual ?? { prazo: "", componentes: "" };
  function mudarGarantia(v: Partial<typeof garantia>) {
    const g = { ...garantia, ...v };
    mudar({ garantia_contratual: g.prazo.trim() || g.componentes.trim() ? g : undefined });
  }
  return (
    <section className="space-y-3" data-testid="pdv-dados-contrato">
      {mostrarTitulo && (
        <h3 className="text-sm font-normal text-muted-foreground">Dados do contrato</h3>
      )}
      <p className="text-xs text-muted-foreground">
        Campos com <span className="text-destructive">*</span> são obrigatórios para concluir. Os
        demais saem em branco no contrato, para preenchimento à mão.
      </p>

      <Setor id="pdv-setor-loja" titulo="Loja (vendedora)">
        {lojaCompleta && !editandoLoja ? (
          <div className="flex items-start justify-between gap-3" data-testid="pdv-loja-resumo">
            <div className="text-sm">
              <p className="font-medium">{c.empresa?.razao_social}</p>
              <p className="text-xs text-muted-foreground">
                CNPJ {c.empresa?.cnpj} · {c.empresa?.cidade}/{c.empresa?.uf}
                {c.atendido_por ? ` · Atendido por ${c.atendido_por}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border px-3 py-1 text-xs"
              onClick={() => setEditandoLoja(true)}
            >
              Editar
            </button>
          </div>
        ) : (
          <>
            {!lojaCompleta ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 p-2 text-xs"
                data-testid="pdv-loja-alerta"
              >
                Faltam dados da loja. Preencha uma vez em{" "}
                <Link href="/app/settings/tenant" className="underline">
                  Configurações › Empresa
                </Link>{" "}
                e eles virão prontos em toda venda.
              </p>
            ) : null}
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
            {onSalvarPadrao ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1 text-xs disabled:opacity-50"
                  disabled={salvando}
                  onClick={async () => {
                    setSalvando(true);
                    setAvisoPadrao(null);
                    const r = await onSalvarPadrao(c);
                    setSalvando(false);
                    setAvisoPadrao(
                      r.ok ? "Salvo como padrão da loja." : (r.error ?? "Não foi possível salvar."),
                    );
                  }}
                >
                  Salvar como padrão da loja
                </button>
                {avisoPadrao ? (
                  <span className="text-xs text-muted-foreground" role="status">
                    {avisoPadrao}
                  </span>
                ) : null}
              </div>
            ) : null}
          </>
        )}
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
          <Campo
            nome="Quilometragem na entrega"
            tipo="number"
            min={0}
            max={10_000_000}
            falta={f("entrega_km")}
            campo="contrato.entrega_km"
            placeholder="vazio = a do cadastro do veículo"
            valor={c.entrega_km}
            mudar={(v) => mudar({ entrega_km: numero(v) })}
          />
          <Campo
            nome="Chaves entregues"
            tipo="number"
            min={1}
            max={10}
            obrigatorio
            falta={f("entrega_chaves")}
            campo="contrato.entrega_chaves"
            valor={c.entrega_chaves}
            mudar={(v) => mudar({ entrega_chaves: numero(v) })}
          />
          {!requisitos || blocos?.troca ? (
            <>
              {!recebimentoNaTroca && (
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
              )}
              <Campo
                nome="Quilometragem da troca no recebimento"
                tipo="number"
                min={0}
                max={10_000_000}
                obrigatorio={!!blocos?.troca}
                falta={f("recebimento_troca_km")}
                campo="contrato.recebimento_troca_km"
                placeholder="km no ato do recebimento"
                valor={c.recebimento_troca_km}
                mudar={(v) => mudar({ recebimento_troca_km: numero(v) })}
              />
              <Campo
                nome="Chaves recebidas com a troca"
                tipo="number"
                min={1}
                max={10}
                obrigatorio={!!blocos?.troca}
                falta={f("recebimento_troca_chaves")}
                campo="contrato.recebimento_troca_chaves"
                valor={c.recebimento_troca_chaves}
                mudar={(v) => mudar({ recebimento_troca_chaves: numero(v) })}
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
        {venda ? (
          <EditorDoTermoDeEntrega
            valor={c.termo_entrega ?? {}}
            mudar={(termo_entrega) => mudar({ termo_entrega })}
          />
        ) : null}
        {venda && blocos?.troca ? (
          <EditorDoTermoDeRecebimento
            valor={c.termo_recebimento ?? {}}
            mudar={(termo_recebimento) => mudar({ termo_recebimento })}
          />
        ) : null}
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
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Escolha
            nome="Canal da venda"
            valor={
              c.canal_venda ??
              (c.venda_fora_do_estabelecimento ? "fora_do_estabelecimento" : "presencial")
            }
            opcoes={[
              ["presencial", "Presencial, na loja"],
              ["fora_do_estabelecimento", "Fora da loja (7 dias de arrependimento)"],
            ]}
            mudar={(canal_venda) => mudar({ canal_venda })}
          />
        </div>
        {venda ? <EditorDosPrazos valor={c} onChange={(v) => mudar(v)} /> : null}

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

        {venda && usaLaudoDeVistoria(c) ? (
          <EditorDaVistoria
            valor={c.vistoria ?? {}}
            mudar={(vistoria) => mudar({ vistoria })}
            f={f}
          />
        ) : (
          <div className="space-y-3" data-testid="pdv-estado-veiculo">
            <p className="text-sm">Estado do veículo na assinatura (anexo do contrato)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                nome="Lataria e pintura"
                placeholder="ex.: sem amassados, risco no para-choque"
                obrigatorio
                falta={f("estado_veiculo.lataria")}
                campo="contrato.estado_veiculo.lataria"
                valor={estado.lataria}
                mudar={(lataria) => mudarEstado({ lataria })}
              />
              <Campo
                nome="Interior"
                placeholder="ex.: bancos sem rasgos, painel íntegro"
                obrigatorio
                falta={f("estado_veiculo.interior")}
                campo="contrato.estado_veiculo.interior"
                valor={estado.interior}
                mudar={(interior) => mudarEstado({ interior })}
              />
              <Campo
                nome="Pneus"
                placeholder="ex.: 4 pneus meia-vida, estepe novo"
                obrigatorio
                falta={f("estado_veiculo.pneus")}
                campo="contrato.estado_veiculo.pneus"
                valor={estado.pneus}
                mudar={(pneus) => mudarEstado({ pneus })}
              />
              <Campo
                nome="Itens e acessórios"
                placeholder="ex.: manual, chave de roda, macaco, triângulo"
                obrigatorio
                falta={f("estado_veiculo.itens")}
                campo="contrato.estado_veiculo.itens"
                valor={estado.itens}
                mudar={(itens) => mudarEstado({ itens })}
              />
              <Campo
                nome="Observações"
                valor={estado.observacoes}
                mudar={(observacoes) => mudarEstado({ observacoes })}
              />
            </div>
          </div>
        )}

        <details className="space-y-3">
          <summary className="cursor-pointer text-sm">Garantia contratual (opcional)</summary>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo
              nome="Prazo da garantia"
              placeholder="ex.: 3 meses"
              obrigatorio={!!c.garantia_contratual}
              falta={f("garantia_contratual.prazo")}
              campo="contrato.garantia_contratual.prazo"
              valor={garantia.prazo}
              mudar={(prazo) => mudarGarantia({ prazo })}
            />
            <Campo
              nome="Componentes cobertos"
              placeholder="ex.: motor e câmbio"
              obrigatorio={!!c.garantia_contratual}
              falta={f("garantia_contratual.componentes")}
              campo="contrato.garantia_contratual.componentes"
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

        {detalhesDosPagamentos.length > 0 && (
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm">
              Detalhes contratuais dos pagamentos
            </summary>
            {detalhesDosPagamentos.map(({ p, indice, campos }) => (
              <div key={indice} className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium">
                  Pagamento {indice + 1} · {ROTULO_DA_FORMA[p.forma]}
                </p>
                {campos.situacao && (
                  <Campo
                    nome="Situação / responsável pelo pagamento"
                    valor={p.situacao}
                    mudar={(situacao) => pagamento(indice, { situacao })}
                  />
                )}
                {campos.emissao && (
                  <Campo
                    nome="Data de emissão"
                    tipo="date"
                    valor={p.data_emissao}
                    mudar={(data_emissao) =>
                      pagamento(indice, { data_emissao: data_emissao || null })
                    }
                  />
                )}
                {campos.previsao && (
                  <Campo
                    nome="Data de pagamento / previsão"
                    tipo="date"
                    valor={p.data_pagamento}
                    mudar={(data_pagamento) =>
                      pagamento(indice, { data_pagamento: data_pagamento || null })
                    }
                  />
                )}
                {campos.intervalo && (
                  <Campo
                    nome="Intervalo entre parcelas (dias)"
                    tipo="number"
                    valor={p.intervalo_dias}
                    mudar={(v) => pagamento(indice, { intervalo_dias: numero(v) })}
                  />
                )}
                {campos.chavePix && (
                  <Campo
                    nome="Tipo e chave PIX"
                    valor={p.chave_pix}
                    mudar={(chave_pix) => pagamento(indice, { chave_pix })}
                  />
                )}
              </div>
            ))}
          </details>
        )}

        <button
          type="button"
          aria-expanded={mostrarCondicao}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden disabled:opacity-60"
          onClick={() => setCondicaoAberta(!mostrarCondicao)}
        >
          {temCondicao ? "Condição especial" : "Adicionar condição especial"}
        </button>
        {mostrarCondicao && (
          <>
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
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!c.clausula_especial_limitativa}
                onChange={(e) => mudar({ clausula_especial_limitativa: e.target.checked })}
              />
              Restringe direito do comprador (sai em destaque no contrato)
            </label>
          </>
        )}
      </Setor>
    </section>
  );
}
