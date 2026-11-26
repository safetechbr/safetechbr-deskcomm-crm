/**
 * PDFs do Recibo de Pagamento (parte A, um por lançamento recebido) e do Termo
 * de Quitação Total (parte B, quando nada mais está pendente). Redação própria.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { formatarPreco } from "@/lib/veiculos/regras";

import { assinanteDaLoja } from "./clausulas-fixas";
import type { LojaDoContrato } from "./contrato";
import {
  linhasDaQuitacao,
  rotuloDaForma,
  rotuloDaParcela,
  saldoAposRecibo,
  type LancamentoDaVenda,
  type ReciboDePagamento,
} from "./recibo-pagamento";
import { formatarDocumento, type Negociacao, resumoDaNegociacao, tituloDoVeiculoDaNegociacao } from "./regras";
import { reaisPorExtenso } from "./valor-por-extenso";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, lineHeight: 1.45, fontFamily: "Helvetica" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4 },
  subtitulo: { fontSize: 9, textAlign: "center", color: "#555", marginBottom: 14 },
  secao: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  caixa: { borderWidth: 0.5, borderColor: "#999", padding: 8 },
  linha: { flexDirection: "row", flexWrap: "wrap" },
  campo: { width: "50%", marginBottom: 2 },
  campoInteiro: { width: "100%", marginBottom: 2 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  paragrafo: { marginBottom: 5, textAlign: "justify" },
  tabelaLinha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#ccc", paddingVertical: 3 },
  tabelaTopo: { flexDirection: "row", borderBottomWidth: 0.8, paddingVertical: 3, fontFamily: "Helvetica-Bold" },
  colDescricao: { width: "42%" },
  colRef: { width: "24%" },
  colData: { width: "14%" },
  colValor: { width: "20%", textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, fontFamily: "Helvetica-Bold" },
  assinaturas: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  assinatura: { width: "45%", borderTopWidth: 0.5, paddingTop: 4, textAlign: "center" },
  assinaturaSo: { width: "60%", marginTop: 40, marginLeft: "20%", borderTopWidth: 0.5, paddingTop: 4, textAlign: "center" },
  rodape: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7.5, color: "#777", textAlign: "center" },
});

const FUSO = "America/Sao_Paulo";
const data = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("pt-BR", { timeZone: FUSO }) : "—";
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
const brl = (c: number) => formatarPreco(c);
const comExtenso = (c: number) => `${brl(c)} (${reaisPorExtenso(c)})`;

function Campo({ rotulo, valor, inteiro }: { rotulo: string; valor: string | null | undefined; inteiro?: boolean }) {
  return (
    <Text style={inteiro ? s.campoInteiro : s.campo}>
      <Text style={s.rotulo}>{rotulo}: </Text>
      {valor && String(valor).trim() ? valor : "—"}
    </Text>
  );
}

function Partes({ n, loja }: { n: Negociacao; loja: LojaDoContrato }) {
  const c = n.cliente;
  return (
    <View style={[s.caixa, s.linha]}>
      <Campo rotulo="Loja (vendedora)" valor={loja.razaoSocial} inteiro />
      <Campo rotulo="CNPJ" valor={loja.cnpj ? formatarDocumento(loja.cnpj) : null} />
      <Campo rotulo="Nome fantasia" valor={loja.nomeFantasia} />
      <Campo rotulo="Cliente (comprador)" valor={c.nome} inteiro />
      <Campo rotulo="CPF/CNPJ" valor={c.documento ? formatarDocumento(c.documento) : null} />
      <Campo rotulo="Cidade/UF" valor={[c.cidade, c.uf].filter(Boolean).join("/")} />
    </View>
  );
}

function Veiculo({ n }: { n: Negociacao }) {
  const v = n.veiculo;
  return (
    <View style={[s.caixa, s.linha]}>
      <Campo rotulo="Veículo" valor={tituloDoVeiculoDaNegociacao(v)} inteiro />
      <Campo rotulo="Placa" valor={v.placa} />
      <Campo rotulo="Chassi" valor={v.chassi} />
      <Campo rotulo="Renavam" valor={v.renavam} />
      <Campo rotulo="Negociação" valor={`nº ${n.numero}`} />
    </View>
  );
}

const localEData = (n: Negociacao, loja: LojaDoContrato, iso: string) =>
  `${n.contrato?.local?.trim() || loja.cidade || "________________"}, ${data(iso)}.`;

const assinaturaDaLoja = (n: Negociacao, loja: LojaDoContrato) => assinanteDaLoja(n) ?? `p/ ${loja.razaoSocial}`;

export interface ReciboPdfInput {
  negociacao: Negociacao;
  loja: LojaDoContrato;
  recibo: ReciboDePagamento;
  lancamentos: LancamentoDaVenda[];
  recibos: ReciboDePagamento[];
}

function ReciboDoc({ negociacao: n, loja, recibo: r, lancamentos, recibos }: ReciboPdfInput) {
  const saldo = saldoAposRecibo(r, lancamentos, recibos);
  const parcela = rotuloDaParcela(r.parcela_numero, r.parcela_total);
  return (
    <Document title={`Recibo nº ${r.numero}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.titulo}>RECIBO DE PAGAMENTO Nº {r.numero}</Text>
        <Text style={s.subtitulo}>{loja.nomeFantasia}</Text>

        <Text style={s.paragrafo}>
          A loja abaixo identificada declara que recebeu de {n.cliente.nome || "________________"} a quantia de{" "}
          {comExtenso(r.valor_cents)}, {parcela ? `referente à ${parcela}` : "referente ao pagamento"} do preço do
          veículo descrito, objeto da negociação nº {n.numero}.
        </Text>

        <Text style={s.secao}>Partes</Text>
        <Partes n={n} loja={loja} />

        <Text style={s.secao}>Veículo</Text>
        <Veiculo n={n} />

        <Text style={s.secao}>Pagamento recebido</Text>
        <View style={[s.caixa, s.linha]}>
          <Campo rotulo="Forma" valor={[rotuloDaForma(r.forma_pagamento), parcela].filter(Boolean).join(", ")} />
          <Campo rotulo="Recebido em" valor={dataHora(r.recebido_em)} />
          <Campo rotulo="Valor" valor={brl(r.valor_cents)} />
          <Campo rotulo="Encargos (juros/multa)" valor={null} />
          <Campo rotulo="Pago por terceiro" valor={null} />
          <Campo rotulo="Identificação da transação" valor={null} />
          <Campo rotulo="Saldo a receber após este recibo" valor={brl(saldo)} inteiro />
        </View>

        <Text style={s.secao}>Declarações</Text>
        <Text style={s.paragrafo}>
          1. Este recibo vale somente para a quantia acima. Ele não quita parcelas futuras nem o saldo a receber
          indicado.
        </Text>
        <Text style={s.paragrafo}>
          2. Pagamento por PIX, transferência ou cartão só se considera feito depois que o valor é creditado à loja.
        </Text>
        {saldo === 0 ? (
          <Text style={s.paragrafo}>
            3. Com este recebimento não resta saldo a receber. A quitação total do preço é dada em termo próprio, que
            relaciona todos os pagamentos desta venda.
          </Text>
        ) : null}

        <Text style={{ marginTop: 14 }}>{localEData(n, loja, r.recebido_em)}</Text>
        <Text style={s.assinaturaSo}>{assinaturaDaLoja(n, loja)}</Text>

        <Text style={s.rodape} fixed>
          {loja.nomeFantasia} — Recibo nº {r.numero} — Negociação nº {n.numero}
        </Text>
      </Page>
    </Document>
  );
}

export interface QuitacaoPdfInput {
  negociacao: Negociacao;
  loja: LojaDoContrato;
  lancamentos: LancamentoDaVenda[];
  recibos: ReciboDePagamento[];
}

function QuitacaoDoc({ negociacao: n, loja, lancamentos, recibos }: QuitacaoPdfInput) {
  const linhas = linhasDaQuitacao(n, lancamentos, recibos);
  const soma = linhas.reduce((t, l) => t + l.valor_cents, 0);
  const ultima = linhas.reduce<string>(
    (max, l) => (l.data && l.data > max ? l.data : max),
    n.concluida_em ?? new Date().toISOString(),
  );
  const prazo = n.contrato?.prazo_atpve_dias;
  return (
    <Document title={`Termo de quitação — negociação nº ${n.numero}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.titulo}>TERMO DE QUITAÇÃO TOTAL</Text>
        <Text style={s.subtitulo}>Negociação nº {n.numero}</Text>

        <Text style={s.secao}>Partes</Text>
        <Partes n={n} loja={loja} />

        <Text style={s.secao}>Veículo</Text>
        <Veiculo n={n} />

        <Text style={s.secao}>Pagamentos que compõem o preço</Text>
        <View style={s.tabelaTopo}>
          <Text style={s.colDescricao}>Forma</Text>
          <Text style={s.colRef}>Referência</Text>
          <Text style={s.colData}>Data</Text>
          <Text style={s.colValor}>Valor</Text>
        </View>
        {linhas.map((l, i) => (
          <View key={i} style={s.tabelaLinha} wrap={false}>
            <Text style={s.colDescricao}>{l.descricao}</Text>
            <Text style={s.colRef}>{l.referencia}</Text>
            <Text style={s.colData}>{data(l.data)}</Text>
            <Text style={s.colValor}>{brl(l.valor_cents)}</Text>
          </View>
        ))}
        <View style={s.total}>
          <Text>Total</Text>
          <Text>{brl(soma)}</Text>
        </View>

        <Text style={s.secao}>Declarações</Text>
        <Text style={s.paragrafo}>
          1. A loja declara que recebeu o preço integral do veículo, de {comExtenso(resumoDaNegociacao(n).total_cents)},
          pelas formas relacionadas acima, e dá ao comprador quitação plena desse preço, sem nada mais a cobrar a esse
          título.
        </Text>
        <Text style={s.paragrafo}>
          2. A quitação alcança somente o preço. Continuam valendo a garantia legal e a contratual, a entrega e a
          assinatura da ATPV-e para a transferência e as demais obrigações do contrato de compra e venda.
        </Text>
        <Text style={s.paragrafo}>
          3. Notas promissórias ligadas a esta venda, se houver, perdem o efeito e são devolvidas ao comprador:
          ________________________________.
        </Text>
        <Text style={s.paragrafo}>
          4. Prazo para a loja entregar a ATPV-e preenchida: {prazo ? `${prazo} dia(s) úteis` : "________"} a contar
          desta data.
        </Text>

        <Text style={{ marginTop: 14 }}>{localEData(n, loja, ultima)}</Text>
        <View style={s.assinaturas}>
          <Text style={s.assinatura}>{assinaturaDaLoja(n, loja)}</Text>
          <Text style={s.assinatura}>{n.cliente.nome || "Comprador"} (ciente)</Text>
        </View>

        <Text style={s.rodape} fixed>
          {loja.nomeFantasia} — Termo de quitação — Negociação nº {n.numero}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderReciboPdf(input: ReciboPdfInput): Promise<Buffer> {
  return (await renderToBuffer(<ReciboDoc {...input} />)) as Buffer;
}

export async function renderQuitacaoPdf(input: QuitacaoPdfInput): Promise<Buffer> {
  return (await renderToBuffer(<QuitacaoDoc {...input} />)) as Buffer;
}
