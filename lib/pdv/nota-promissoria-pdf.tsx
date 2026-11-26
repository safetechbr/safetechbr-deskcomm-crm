/**
 * PDF da Nota Promissória: uma página por parcela paga direto à loja, com a
 * frente (requisitos da LUG, art. 75) e o verso de quitação. Redação própria;
 * encargos de atraso ficam no contrato, a nota não os repete.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { formatarPreco } from "@/lib/veiculos/regras";

import { assinanteDaLoja } from "./clausulas-fixas";
import type { LojaDoContrato } from "./contrato";
import type { NotaPromissoria } from "./nota-promissoria";
import { formatarDocumento, type Negociacao, tituloDoVeiculoDaNegociacao } from "./regras";
import { reaisPorExtenso } from "./valor-por-extenso";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, lineHeight: 1.5, fontFamily: "Helvetica" },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  naoOrdem: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 2 },
  valor: { borderWidth: 1, padding: 6, fontSize: 13, fontFamily: "Helvetica-Bold" },
  caixa: { borderWidth: 0.5, borderColor: "#999", padding: 8, marginBottom: 8 },
  linha: { flexDirection: "row", flexWrap: "wrap" },
  campo: { width: "50%", marginBottom: 2 },
  campoInteiro: { width: "100%", marginBottom: 2 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  paragrafo: { marginBottom: 6, textAlign: "justify" },
  pequeno: { fontSize: 8.5, color: "#444", textAlign: "justify", marginBottom: 4 },
  assinaturaSo: { width: "60%", marginTop: 34, marginLeft: "20%", borderTopWidth: 0.5, paddingTop: 4, textAlign: "center" },
  corte: { marginVertical: 18, borderTopWidth: 0.5, borderStyle: "dashed", borderColor: "#777" },
  secao: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  devolver: { marginTop: 10, padding: 6, borderWidth: 1, textAlign: "center", fontFamily: "Helvetica-Bold" },
  rodape: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7.5, color: "#777", textAlign: "center" },
});

const FUSO = "America/Sao_Paulo";
const data = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("pt-BR", { timeZone: FUSO }) : "—";
const brl = (c: number) => formatarPreco(c);

function Campo({ rotulo, valor, inteiro }: { rotulo: string; valor: string | null | undefined; inteiro?: boolean }) {
  return (
    <Text style={inteiro ? s.campoInteiro : s.campo}>
      <Text style={s.rotulo}>{rotulo}: </Text>
      {valor && String(valor).trim() ? valor : "—"}
    </Text>
  );
}

const enderecoDoCliente = (c: Negociacao["cliente"]) =>
  [
    [c.endereco, c.numero].filter(Boolean).join(", "),
    c.complemento,
    c.bairro,
    [c.cidade, c.uf].filter(Boolean).join("/"),
    c.cep ? `CEP ${c.cep}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

export interface NotaPromissoriaPdfInput {
  negociacao: Negociacao;
  loja: LojaDoContrato;
  notas: NotaPromissoria[];
}

function Nota({ n, loja, nota }: { n: Negociacao; loja: LojaDoContrato; nota: NotaPromissoria }) {
  const c = n.cliente;
  const praca = n.contrato?.local?.trim() || loja.cidade || "";
  const emissao = n.concluida_em ?? new Date().toISOString();
  const forma = nota.forma === "crediario" ? "crediário" : "promissória";
  return (
    <Page size="A4" style={s.page}>
      <View style={s.topo}>
        <View>
          <Text style={s.titulo}>
            NOTA PROMISSÓRIA Nº {nota.numero}/{nota.total}
          </Text>
          <Text style={s.naoOrdem}>NÃO À ORDEM</Text>
        </View>
        <Text style={s.valor}>{brl(nota.valor_cents)}</Text>
      </View>

      <View style={[s.caixa, s.linha]}>
        <Campo rotulo="Vencimento" valor={data(nota.vencimento)} />
        <Campo rotulo="Praça de pagamento" valor={praca} />
      </View>

      <Text style={s.paragrafo}>
        No dia {data(nota.vencimento)}, pagarei por esta nota promissória, não à ordem, a {loja.razaoSocial}, CNPJ{" "}
        {loja.cnpj ? formatarDocumento(loja.cnpj) : "—"}, a quantia de {brl(nota.valor_cents)} (
        {reaisPorExtenso(nota.valor_cents)}), em moeda corrente nacional, na praça de {praca}.
      </Text>

      <Text style={s.secao}>Emitente</Text>
      <View style={[s.caixa, s.linha]}>
        <Campo rotulo="Nome" valor={c.nome} inteiro />
        <Campo rotulo="CPF/CNPJ" valor={c.documento ? formatarDocumento(c.documento) : null} />
        <Campo rotulo="Telefone" valor={c.telefone} />
        <Campo rotulo="Endereço" valor={enderecoDoCliente(c)} inteiro />
      </View>

      <Text style={s.pequeno}>
        Emitida em garantia da parcela {nota.numero} de {nota.total} ({forma}) do preço do veículo{" "}
        {tituloDoVeiculoDaNegociacao(n.veiculo)}
        {n.veiculo.placa ? `, placa ${n.veiculo.placa}` : ""}, vendido na negociação nº {n.numero}. A nota não
        substitui a obrigação do contrato de compra e venda: a dívida só se extingue com o pagamento. Atraso, encargos
        e antecipação seguem o que o contrato estabelece; esta nota não acrescenta juros nem multa.
      </Text>

      <Text style={{ marginTop: 8 }}>
        {praca}, {data(emissao)}.
      </Text>
      <Text style={s.assinaturaSo}>{c.nome} (emitente)</Text>

      <View style={s.corte} />

      <Text style={s.secao}>VERSO — QUITAÇÃO</Text>
      {nota.paga_em ? (
        <>
          <Text style={s.paragrafo}>
            {loja.razaoSocial} declara que recebeu, em {data(nota.paga_em)}, o valor desta nota promissória, de{" "}
            {brl(nota.valor_cents)}, e dá quitação desta parcela. Quitada, a nota perde o efeito e o original é
            devolvido ao emitente.
          </Text>
          <Text style={s.assinaturaSo}>{assinanteDaLoja(n) ?? `p/ ${loja.razaoSocial}`}</Text>
          <Text style={s.devolver}>NOTA QUITADA — DEVOLVER O ORIGINAL AO CLIENTE</Text>
        </>
      ) : (
        <>
          <Text style={s.paragrafo}>
            Recebi o valor desta nota promissória em ____/____/________ e dou quitação desta parcela. Quitada, o
            original deve ser devolvido ao emitente.
          </Text>
          <Text style={s.assinaturaSo}>{assinanteDaLoja(n) ?? `p/ ${loja.razaoSocial}`}</Text>
        </>
      )}

      <Text style={s.rodape} fixed>
        {loja.nomeFantasia} — Nota promissória {nota.numero}/{nota.total} — Negociação nº {n.numero}
      </Text>
    </Page>
  );
}

function NotasDoc({ negociacao, loja, notas }: NotaPromissoriaPdfInput) {
  return (
    <Document title={`Notas promissórias — negociação nº ${negociacao.numero}`}>
      {notas.map((nota) => (
        <Nota key={nota.numero} n={negociacao} loja={loja} nota={nota} />
      ))}
    </Document>
  );
}

/** Uma página por nota; passe uma nota só para imprimir uma parcela. */
export async function renderNotasPromissoriasPdf(input: NotaPromissoriaPdfInput): Promise<Buffer> {
  return (await renderToBuffer(<NotasDoc {...input} />)) as Buffer;
}
