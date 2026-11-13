import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatarPreco } from "@/lib/veiculos/regras";
import {
  resumoDaNegociacao,
  ROTULO_DA_FORMA,
  formatarDocumento,
  tituloDoVeiculoDaNegociacao,
  type Negociacao,
  type VeiculoDaNegociacao,
} from "./regras";
import type { EmpresaContrato } from "./modelo-contrato";

const s = StyleSheet.create({
  pagina: {
    padding: 34,
    paddingBottom: 44,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    lineHeight: 1.3,
    color: "#333",
  },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 16, marginBottom: 4 },
  codigo: { textAlign: "center", marginBottom: 14 },
  paragrafo: { textAlign: "justify", marginBottom: 8 },
  secao: { fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#aaa", padding: 4 },
  tabela: { borderWidth: 0.5, borderColor: "#aaa", marginBottom: 6 },
  celula: { width: "25%", paddingRight: 4 },
  total: { textAlign: "right", fontFamily: "Helvetica-Bold", padding: 4 },
  rodape: {
    position: "absolute",
    bottom: 20,
    left: 34,
    right: 34,
    textAlign: "center",
    fontSize: 8,
  },
  assinatura: { width: "44%", borderTopWidth: 0.5, paddingTop: 10, textAlign: "center" },
});
const vazio = "________________";
const txt = (v?: string | number | null) =>
  v == null || String(v).trim() === "" ? vazio : String(v);
function data(v?: string | null): string {
  return v ? v.slice(0, 10).split("-").reverse().join("/") : vazio;
}
function endereco(e: Partial<Record<keyof EmpresaContrato, string | null>>): string {
  return (
    [
      e.endereco,
      e.numero,
      e.complemento,
      e.bairro,
      [e.cidade, e.uf].filter(Boolean).join("/"),
      e.cep,
    ]
      .filter(Boolean)
      .join(", ") || vazio
  );
}
function Rodape() {
  return (
    <Text
      style={s.rodape}
      fixed
      render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
    />
  );
}
function Veiculo({ v, titulo, valor }: { v: VeiculoDaNegociacao; titulo: string; valor: string }) {
  const celulas = [
    ["Ano fabricação / modelo", `${v.ano_fabricacao ?? "___"}/${v.ano_modelo ?? "___"}`],
    ["Cor", v.cor],
    ["Combustível", v.combustivel],
    ["Placa", v.placa],
    ["Chassi", v.chassi],
    ["Renavam", v.renavam],
    ["Condição", v.condicao === "novo" ? "Novo" : v.condicao === "usado" ? "Usado" : null],
    ["Quilometragem", v.km == null ? null : `${v.km.toLocaleString("pt-BR")} km`],
  ];
  return (
    <View wrap={false}>
      <Text style={s.secao}>{titulo}</Text>
      <View style={s.tabela}>
        <View style={s.linha}>
          <Text>
            Marca / modelo / versão: {txt([v.marca, v.modelo, v.versao].filter(Boolean).join(" "))}
          </Text>
        </View>
        {[0, 4].map((inicio) => (
          <View key={inicio} style={s.linha}>
            {celulas.slice(inicio, inicio + 4).map(([nome, valor], i) => (
              <Text key={i} style={s.celula}>
                {nome}: {txt(valor)}
              </Text>
            ))}
          </View>
        ))}
        <Text style={s.total}>Valor: {valor}</Text>
      </View>
    </View>
  );
}

/** Modelo recebido da loja; dados variáveis e texto contratual saem somente da fotografia. */
export function ContratoModelo({ n }: { n: Negociacao }) {
  const d = n.contrato!;
  const e = d.empresa!;
  const c = n.cliente;
  const preco = (v: number) => formatarPreco(v, n.moeda || "BRL");
  const resumo = resumoDaNegociacao(n);
  const loja = `${txt(e.razao_social)}${e.nome_fantasia && e.nome_fantasia !== e.razao_social ? ` (${e.nome_fantasia})` : ""}, com sede em ${endereco(e)}, CNPJ ${txt(formatarDocumento(e.cnpj))}, telefone ${txt(e.telefone)}, e-mail ${txt(e.email)}`;
  const cliente = `${txt(c.nome)}, nacionalidade ${txt(c.nacionalidade)}, nascimento ${data(c.nascimento)}, residente em ${endereco(c)}, CPF/CNPJ ${txt(formatarDocumento(c.documento))}, RG ${txt(c.rg)}, telefone ${txt(c.telefone)}, e-mail ${txt(c.email)}`;
  const venda = n.tipo === "venda";
  const debitos = [
    { v: n.veiculo, nome: tituloDoVeiculoDaNegociacao(n.veiculo) },
    ...(n.troca ? [{ v: n.troca, nome: tituloDoVeiculoDaNegociacao(n.troca) }] : []),
  ];
  const assinada = d.assinatura_em ?? n.concluida_em ?? n.created_at;
  const instante = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(assinada));
  return (
    <Document title={`Contrato de Compra e Venda ${n.numero}`}>
      <Page size="A4" style={s.pagina}>
        <Text style={s.titulo}>Contrato de Compra e Venda</Text>
        <Text style={s.codigo}>
          Código: {n.numero}
          {n.status === "rascunho" ? " · RASCUNHO" : ""}
        </Text>
        <Text style={s.paragrafo}>De um lado, como COMPRADOR: {venda ? cliente : loja}.</Text>
        <Text style={s.paragrafo}>De outro lado, como VENDEDOR: {venda ? loja : cliente}.</Text>
        <Text style={s.paragrafo}>
          As partes acima identificadas ajustam a compra e venda descrita nas condições abaixo.
        </Text>
        <Text style={s.secao}>Cláusula 1ª: Do(s) veículo(s)</Text>
        <Veiculo
          v={n.veiculo}
          titulo={venda ? "Veículo vendido" : "Veículo comprado pela loja"}
          valor={preco(resumo.total_cents)}
        />
        {n.troca ? (
          <Veiculo
            v={n.troca}
            titulo="Veículo recebido na troca"
            valor={preco(n.troca.valor_cents)}
          />
        ) : null}
        {n.troca ? (
          <Text style={s.paragrafo}>
            Quitação da troca: {preco(n.troca.quitacao_cents)} · Valor líquido da troca:{" "}
            {preco(resumo.troca_liquida_cents)}
          </Text>
        ) : null}
        <Text style={s.secao}>Situação de regulamentação do(s) veículo(s)</Text>
        <View style={s.tabela}>
          <View style={s.linha}>
            {["Veículo / descrição", "Situação / responsável", "Observação", "Valor"].map((v) => (
              <Text key={v} style={s.celula}>
                {v}
              </Text>
            ))}
          </View>
          {debitos.flatMap(({ v, nome }, j) =>
            (v.regularizacao?.length
              ? v.regularizacao
              : [
                  {
                    descricao: "Não informado",
                    responsavel: "a_definir" as const,
                    observacao: "",
                    valor_cents: 0,
                  },
                ]
            ).map((r, i) => (
              <View key={`${j}-${i}`} style={s.linha} wrap={false}>
                <Text style={s.celula}>
                  {nome}: {r.descricao}
                </Text>
                <Text style={s.celula}>
                  {
                    {
                      cliente: "Cliente paga",
                      loja: "Loja paga",
                      quitado: "Quitado / sem débito",
                      a_definir: "A definir",
                    }[r.responsavel]
                  }
                </Text>
                <Text style={s.celula}>{txt(r.observacao)}</Text>
                <Text style={s.celula}>{preco(r.valor_cents)}</Text>
              </View>
            )),
          )}
        </View>
        <Text style={s.secao}>Cláusula 2ª: Do pagamento</Text>
        <Text style={s.paragrafo}>
          Valor negociado: {preco(n.valor_cents)} · Desconto: {preco(n.desconto_cents)} · Total:{" "}
          {preco(resumo.total_cents)}
        </Text>
        <View style={s.tabela}>
          <View style={s.linha}>
            {["Forma de pagamento", "Situação / responsável", "Data base / detalhes", "Valor"].map(
              (v) => (
                <Text key={v} style={s.celula}>
                  {v}
                </Text>
              ),
            )}
          </View>
          {n.troca ? (
            <View style={s.linha}>
              <Text style={{ width: "75%" }}>Veículo na troca (valor líquido)</Text>
              <Text style={s.celula}>{preco(resumo.troca_liquida_cents)}</Text>
            </View>
          ) : null}
          {n.pagamentos.map((p, i) => (
            <View key={i} style={s.linha} wrap={false}>
              <Text style={s.celula}>{ROTULO_DA_FORMA[p.forma]}</Text>
              <Text style={s.celula}>{txt(p.situacao)}</Text>
              <Text style={s.celula}>
                {[
                  p.banco,
                  p.data_emissao ? `Emissão: ${data(p.data_emissao)}` : null,
                  p.data_pagamento ? `Pagamento/previsão: ${data(p.data_pagamento)}` : null,
                  p.primeiro_vencimento ? `1º vencimento: ${data(p.primeiro_vencimento)}` : null,
                  `${p.parcelas} parcela(s)${p.valor_parcela_cents != null ? ` de ${preco(p.valor_parcela_cents)}` : ""}`,
                  p.intervalo_dias ? `Intervalo: ${p.intervalo_dias} dias` : null,
                  p.chave_pix ? `PIX: ${p.chave_pix}` : null,
                  p.observacao,
                ]
                  .filter(Boolean)
                  .join("; ")}
              </Text>
              <Text style={s.celula}>{preco(p.valor_cents)}</Text>
            </View>
          ))}
          <Text style={s.total}>
            Valor total: {preco(resumo.pagamentos_cents + resumo.troca_liquida_cents)}
          </Text>
        </View>
        <Rodape />
      </Page>
      <Page size="A4" style={s.pagina}>
        <Text style={s.secao}>Cláusula 3ª: Da entrega e recebimento</Text>
        <Text style={s.paragrafo}>
          {tituloDoVeiculoDaNegociacao(n.veiculo)} — Data de {venda ? "entrega" : "recebimento"}:{" "}
          {data(d.entrega_em)}
        </Text>
        {n.troca ? (
          <Text style={s.paragrafo}>
            {tituloDoVeiculoDaNegociacao(n.troca)} — Recebimento da troca:{" "}
            {data(d.recebimento_troca_em)}
          </Text>
        ) : null}
        {(d.clausulas ?? []).map((v, i) => (
          <Text key={i} style={s.paragrafo}>
            {v}
          </Text>
        ))}
        <Text style={s.secao}>Cláusula Especial</Text>
        <Text style={s.paragrafo}>{txt(d.clausula_especial)}</Text>
        {n.observacoes ? (
          <>
            <Text style={s.secao}>Observações da negociação</Text>
            <Text style={s.paragrafo}>{n.observacoes}</Text>
          </>
        ) : null}
        <Text style={s.paragrafo}>
          E, por estarem de comum acordo, assinam o presente instrumento em 2 (duas) vias de igual
          teor.
        </Text>
        <Text style={{ textAlign: "right", marginTop: 12 }}>
          Atendido por: {txt(d.atendido_por)}
        </Text>
        <Rodape />
      </Page>
      <Page size="A4" style={s.pagina}>
        <Text style={{ textAlign: "center", fontFamily: "Helvetica-Bold" }}>
          {txt(d.local)}, {instante}
        </Text>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 55 }}
          wrap={false}
        >
          <View style={s.assinatura}>
            <Text>{venda ? txt(e.razao_social) : txt(c.nome)}</Text>
            <Text>Vendedor</Text>
          </View>
          <View style={s.assinatura}>
            <Text>{venda ? txt(c.nome) : txt(e.razao_social)}</Text>
            <Text>Comprador</Text>
          </View>
        </View>
        <Rodape />
      </Page>
    </Document>
  );
}
