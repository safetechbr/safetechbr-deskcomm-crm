/**
 * CONTRATO GENÉRICO de compra e venda de veículo (PDV da loja de carros).
 *
 * Um modelo só, que muda de lado conforme o tipo: na VENDA a loja é a
 * vendedora e o cliente o comprador; na COMPRA, o contrário. Texto padrão de
 * mercado (identificação das partes, do veículo, preço e forma de pagamento,
 * troca, entrega e transferência, assinaturas). Modelos por loja vêm depois.
 */
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { ContratoModelo } from "./contrato-modelo";

import { formatarKm, formatarPreco } from "@/lib/veiculos/regras";

import {
  formatarDocumento,
  type Negociacao,
  resumoDaNegociacao,
  ROTULO_DA_FORMA,
  type TrocaDaNegociacao,
  type VeiculoDaNegociacao,
  tituloDoVeiculoDaNegociacao,
} from "./regras";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, lineHeight: 1.45, fontFamily: "Helvetica" },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  logo: { width: 96, height: 40, objectFit: "contain" },
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
  colForma: { width: "40%" },
  colDetalhe: { width: "40%" },
  colValor: { width: "20%", textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, fontFamily: "Helvetica-Bold" },
  assinaturas: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  assinatura: { width: "45%", borderTopWidth: 0.5, paddingTop: 4, textAlign: "center" },
  testemunhas: { flexDirection: "row", justifyContent: "space-between", marginTop: 34 },
  rodape: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7.5, color: "#777", textAlign: "center" },
});

export interface LojaDoContrato {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string | null;
  logoUrl: string | null;
  cidade: string | null;
}

export interface ContratoInput {
  negociacao: Negociacao;
  loja: LojaDoContrato;
  vendedorNome: string | null;
}

function Campo({ rotulo, valor, inteiro }: { rotulo: string; valor: string | null | undefined; inteiro?: boolean }) {
  return (
    <Text style={inteiro ? styles.campoInteiro : styles.campo}>
      <Text style={styles.rotulo}>{rotulo}: </Text>
      {valor && String(valor).trim() ? valor : "________________"}
    </Text>
  );
}

function BlocoDoVeiculo({ v }: { v: Partial<VeiculoDaNegociacao | TrocaDaNegociacao> }) {
  return (
    <View style={[styles.caixa, styles.linha]}>
      <Campo rotulo="Marca/Modelo" valor={[v.marca, v.modelo].filter(Boolean).join(" ")} />
      <Campo rotulo="Versão" valor={v.versao} />
      <Campo
        rotulo="Ano fab./modelo"
        valor={v.ano_fabricacao || v.ano_modelo ? `${v.ano_fabricacao ?? "-"}/${v.ano_modelo ?? "-"}` : null}
      />
      <Campo rotulo="Cor" valor={v.cor} />
      <Campo rotulo="Placa" valor={v.placa?.toUpperCase()} />
      <Campo rotulo="Quilometragem" valor={v.km != null ? formatarKm(v.km) : null} />
      <Campo rotulo="Chassi" valor={v.chassi?.toUpperCase()} />
      <Campo rotulo="Renavam" valor={v.renavam} />
      <Campo rotulo="Combustível" valor={v.combustivel} />
      <Campo rotulo="Câmbio" valor={v.cambio} />
    </View>
  );
}

function enderecoDoCliente(c: Negociacao["cliente"]): string {
  const rua = [c.endereco, c.numero].filter(Boolean).join(", ");
  const resto = [c.complemento, c.bairro, [c.cidade, c.uf].filter(Boolean).join("/"), c.cep ? `CEP ${c.cep}` : null]
    .filter(Boolean)
    .join(" — ");
  return [rua, resto].filter(Boolean).join(" — ");
}

function dataPorExtenso(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
}

function ContratoDoc({ d }: { d: ContratoInput }): React.ReactElement {
  const n = d.negociacao;
  const venda = n.tipo === "venda";
  const moeda = n.moeda || "BRL";
  const preco = (c: number) => formatarPreco(c, moeda);
  const resumo = resumoDaNegociacao(n);
  const c = n.cliente;
  const lojaTexto = `${d.loja.razaoSocial}${d.loja.nomeFantasia && d.loja.nomeFantasia !== d.loja.razaoSocial ? ` (${d.loja.nomeFantasia})` : ""}${d.loja.cnpj ? `, inscrita no CNPJ ${formatarDocumento(d.loja.cnpj)}` : ""}`;
  const clienteTexto = `${c.nome || "________________"}${c.documento ? `, CPF/CNPJ ${formatarDocumento(c.documento)}` : ""}${c.rg ? `, RG ${c.rg}` : ""}`;
  const vendedor = venda ? lojaTexto : clienteTexto;
  const comprador = venda ? clienteTexto : lojaTexto;
  const dataDoc = n.concluida_em ?? n.created_at;
  const troca = venda ? n.troca : null;

  return (
    <Document title={`Contrato ${n.tipo} #${n.numero}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.topo}>
          {d.loja.logoUrl ? <Image src={d.loja.logoUrl} style={styles.logo} /> : <Text>{d.loja.nomeFantasia}</Text>}
          <Text>Negociação nº {n.numero}</Text>
        </View>
        <Text style={styles.titulo}>CONTRATO PARTICULAR DE COMPRA E VENDA DE VEÍCULO AUTOMOTOR</Text>
        <Text style={styles.subtitulo}>{venda ? "Venda da loja ao cliente" : "Compra pela loja de veículo do cliente"}</Text>

        <Text style={styles.secao}>1. DAS PARTES</Text>
        <Text style={styles.paragrafo}>
          <Text style={styles.rotulo}>VENDEDOR(A): </Text>
          {vendedor}.
        </Text>
        <Text style={styles.paragrafo}>
          <Text style={styles.rotulo}>COMPRADOR(A): </Text>
          {comprador}.
        </Text>
        <View style={[styles.caixa, styles.linha]}>
          <Campo rotulo="Cliente" valor={c.nome} />
          <Campo rotulo="CPF/CNPJ" valor={c.documento ? formatarDocumento(c.documento) : null} />
          <Campo rotulo="RG" valor={c.rg} />
          <Campo rotulo="CNH" valor={c.cnh} />
          <Campo rotulo="Telefone" valor={c.telefone} />
          <Campo rotulo="E-mail" valor={c.email} />
          <Campo rotulo="Endereço" valor={enderecoDoCliente(c)} inteiro />
        </View>

        <Text style={styles.secao}>2. DO OBJETO</Text>
        <Text style={styles.paragrafo}>
          O(A) VENDEDOR(A) vende ao(à) COMPRADOR(A) o veículo abaixo descrito, livre e desembaraçado de quaisquer
          ônus, multas, débitos de IPVA, licenciamento e seguro obrigatório até a data da entrega, salvo o que estiver
          expressamente declarado neste contrato:
        </Text>
        <BlocoDoVeiculo v={n.veiculo} />

        <Text style={styles.secao}>3. DO PREÇO E DA FORMA DE PAGAMENTO</Text>
        <Text style={styles.paragrafo}>
          O preço certo e ajustado é de <Text style={styles.rotulo}>{preco(resumo.total_cents)}</Text>
          {venda && n.desconto_cents > 0 ? ` (preço de ${preco(n.valor_cents)} com desconto de ${preco(n.desconto_cents)})` : ""}, pago
          da seguinte forma:
        </Text>
        <View style={styles.caixa}>
          {troca ? (
            <View style={styles.tabelaLinha}>
              <Text style={styles.colForma}>Veículo na troca</Text>
              <Text style={styles.colDetalhe}>
                {tituloDoVeiculoDaNegociacao(troca)}
                {troca.quitacao_cents > 0 ? ` (avaliado em ${preco(troca.valor_cents)}, quitação de ${preco(troca.quitacao_cents)})` : ""}
              </Text>
              <Text style={styles.colValor}>{preco(resumo.troca_liquida_cents)}</Text>
            </View>
          ) : null}
          {n.pagamentos.map((p, i) => (
            <View key={i} style={styles.tabelaLinha}>
              <Text style={styles.colForma}>{ROTULO_DA_FORMA[p.forma] ?? p.forma}</Text>
              <Text style={styles.colDetalhe}>
                {[
                  p.banco,
                  p.parcelas > 1
                    ? `${p.parcelas}x${p.valor_parcela_cents ? ` de ${preco(p.valor_parcela_cents)}` : ""}`
                    : null,
                  p.primeiro_vencimento ? `1º venc. ${p.primeiro_vencimento.split("-").reverse().join("/")}` : null,
                  p.observacao,
                ]
                  .filter(Boolean)
                  .join(" — ")}
              </Text>
              <Text style={styles.colValor}>{preco(p.valor_cents)}</Text>
            </View>
          ))}
          <View style={styles.total}>
            <Text>Total</Text>
            <Text>{preco(resumo.troca_liquida_cents + resumo.pagamentos_cents)}</Text>
          </View>
        </View>
        <Text style={styles.paragrafo}>
          Pagamentos por financiamento, consórcio, cheque ou boleto só se consideram quitados após a efetiva
          compensação ou liberação do crédito pela instituição.
        </Text>

        {troca ? (
          <>
            <Text style={styles.secao}>4. DO VEÍCULO DADO NA TROCA</Text>
            <Text style={styles.paragrafo}>
              O(A) COMPRADOR(A) entrega como parte do pagamento o veículo abaixo, declarando ser seu legítimo
              proprietário e responsabilizando-se por débitos, multas e ônus anteriores à entrega
              {troca.quitacao_cents > 0
                ? `. O saldo devedor de financiamento de ${preco(troca.quitacao_cents)} será quitado pela loja e já está descontado da avaliação`
                : ""}
              :
            </Text>
            <BlocoDoVeiculo v={troca} />
          </>
        ) : null}

        <Text style={styles.secao}>{troca ? "5" : "4"}. DA ENTREGA, TRANSFERÊNCIA E RESPONSABILIDADES</Text>
        <Text style={styles.paragrafo}>
          A posse do veículo é transmitida na data deste contrato. A partir dela, o(a) COMPRADOR(A) responde civil e
          criminalmente pelo veículo, inclusive por multas e infrações. As partes se obrigam a assinar o documento de
          transferência (ATPV-e/CRV) e o(a) COMPRADOR(A) a transferir o veículo para o seu nome no prazo legal de 30
          (trinta) dias, conforme o art. 123 do Código de Trânsito Brasileiro.
        </Text>
        <Text style={styles.paragrafo}>
          {venda
            ? "O(A) COMPRADOR(A) declara ter examinado o veículo e o recebe no estado em que se encontra, ressalvada a garantia legal prevista no Código de Defesa do Consumidor."
            : "O(A) VENDEDOR(A) declara que o veículo não possui restrições judiciais, administrativas ou de alienação além das informadas, respondendo por vícios ocultos e débitos anteriores à entrega."}
        </Text>
        {n.observacoes ? (
          <>
            <Text style={styles.secao}>Observações</Text>
            <Text style={styles.paragrafo}>{n.observacoes}</Text>
          </>
        ) : null}
        <Text style={styles.paragrafo}>
          Fica eleito o foro da comarca {d.loja.cidade ? `de ${d.loja.cidade}` : "do domicílio do(a) COMPRADOR(A)"} para dirimir
          dúvidas deste contrato. E, por estarem justas e contratadas, as partes assinam em 2 (duas) vias de igual teor.
        </Text>
        <Text style={[styles.paragrafo, { textAlign: "right" }]}>
          {d.loja.cidade ? `${d.loja.cidade}, ` : ""}
          {dataPorExtenso(dataDoc)}.
        </Text>

        <View style={styles.assinaturas} wrap={false}>
          <Text style={styles.assinatura}>VENDEDOR(A)</Text>
          <Text style={styles.assinatura}>COMPRADOR(A)</Text>
        </View>
        <View style={styles.testemunhas} wrap={false}>
          <Text style={styles.assinatura}>Testemunha 1 — Nome/CPF</Text>
          <Text style={styles.assinatura}>Testemunha 2 — Nome/CPF</Text>
        </View>

        <Text
          style={styles.rodape}
          render={({ pageNumber, totalPages }) =>
            `${d.loja.nomeFantasia} — Negociação nº ${n.numero}${d.vendedorNome ? ` — Vendedor: ${d.vendedorNome}` : ""} — Página ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderContratoPdf(input: ContratoInput): Promise<Buffer> {
  const buf = await renderToBuffer(input.negociacao.contrato?.empresa ? <ContratoModelo n={input.negociacao} /> : <ContratoDoc d={input} />);
  return buf as Buffer;
}
