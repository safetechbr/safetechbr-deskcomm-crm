import React from "react";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatarPreco } from "@/lib/veiculos/regras";
import {
  resumoDaNegociacao,
  ROTULO_DA_FORMA,
  formatarDocumento,
  tituloDoVeiculoDaNegociacao,
  type Negociacao,
  type VeiculoDaNegociacao,
} from "./regras";
import { PRAZO_DA_GARANTIA, type EmpresaContrato } from "./modelo-contrato";
import { TITULO_DO_DOCUMENTO } from "./manifesto-da-pasta";
import { reaisPorExtenso } from "./valor-por-extenso";
import {
  assinanteDaLoja,
  clausulasFixas,
  itemLimitativo,
  textoDoItem,
  type AnexoDoContrato,
  type ItemDoContrato,
  type SecaoDoContrato,
} from "./clausulas-fixas";
import {
  avariasDoLaudo,
  ITENS_DA_VISTORIA,
  kmDaVistoria,
  RESULTADOS_DA_CAUTELAR,
  SITUACOES,
  SULCO_MINIMO_MM,
  usaLaudoDeVistoria,
} from "./laudo-vistoria";
import { COMBUSTIVEIS, ITENS_DA_ENTREGA } from "./termo-entrega";
import { decidirVersaoDoContrato, type DecisaoDoContrato } from "./versao-do-contrato";

// A hifenização automática do react-pdf parte palavras em português no lugar
// errado ("mo-delo"); contrato quebra só entre palavras.
Font.registerHyphenationCallback((palavra) => [palavra]);

const TINTA = "#1a1a1a";
const SUAVE = "#5c5c5c";
const FIO = "#c4c4c4";
const FUNDO = "#f1f1f1";

const s = StyleSheet.create({
  pagina: {
    paddingTop: 46,
    paddingBottom: 62,
    paddingHorizontal: 54,
    fontSize: 12,
    fontFamily: "Helvetica",
    color: TINTA,
  },
  // lineHeight fica fora do Page: herdado pelo rodapé fixo com render, o react-pdf não o desenha.
  corpo: { fontSize: 12, lineHeight: 1.4 },
  cabecalho: {
    borderBottomWidth: 1,
    borderColor: TINTA,
    paddingBottom: 8,
    marginBottom: 16,
  },
  titulo: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    letterSpacing: 1.2,
    lineHeight: 1.2,
  },
  codigo: { textAlign: "center", fontSize: 12, color: SUAVE, marginTop: 4 },
  negrito: { fontFamily: "Helvetica-Bold" },
  paragrafo: { textAlign: "justify", marginBottom: 7 },
  clausula: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12.5,
    marginTop: 12,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderColor: FIO,
  },
  subtitulo: { fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 4 },
  item: { flexDirection: "row", marginBottom: 5 },
  itemNumero: { width: 40, fontFamily: "Helvetica-Bold" },
  // Art. 54, § 4º, CDC: cláusula que limita direito do COMPRADOR sai em destaque.
  limitativa: {
    borderWidth: 0.75,
    borderColor: TINTA,
    backgroundColor: FUNDO,
    padding: 4,
    marginBottom: 5,
  },
  itemTexto: { flex: 1, textAlign: "justify" },
  // A borda de baixo vem da última linha; assim não dobra.
  tabela: {
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: FIO,
    marginBottom: 8,
  },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: FIO },
  linhaCabecalho: { backgroundColor: FUNDO },
  celula: { paddingVertical: 4, paddingHorizontal: 5 },
  cabecalhoTexto: { fontFamily: "Helvetica-Bold", fontSize: 12, color: SUAVE },
  rotulo: { fontSize: 12, color: SUAVE, lineHeight: 1.3 },
  direita: { textAlign: "right" },
  totalLinha: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: FUNDO,
    borderBottomWidth: 0.5,
    borderColor: FIO,
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  rodape: {
    position: "absolute",
    bottom: 26,
    left: 54,
    right: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderColor: FIO,
    paddingTop: 5,
    // Só o rodapé pode ficar abaixo de 12pt.
    fontSize: 8,
    color: SUAVE,
  },
  local: { textAlign: "center", marginTop: 18 },
  assinaturas: { flexDirection: "row", justifyContent: "space-between", marginTop: 42 },
  assinatura: {
    width: "42%",
    borderTopWidth: 0.75,
    borderColor: TINTA,
    paddingTop: 5,
    textAlign: "center",
  },
  papel: { fontSize: 12, color: SUAVE },
  minuta: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    borderWidth: 0.75,
    borderColor: TINTA,
    backgroundColor: FUNDO,
    padding: 5,
    marginBottom: 12,
  },
  pendencias: { marginTop: 24 },
  pendencia: { marginBottom: 3, paddingLeft: 8 },
  lacunas: { marginBottom: 6 },
});
const vazio = "________________";
const txt = (v?: string | number | null) =>
  v == null || String(v).trim() === "" ? vazio : String(v);
function data(v?: string | null): string {
  return v ? v.slice(0, 10).split("-").reverse().join("/") : vazio;
}
/** 01001000 → 01001-000; outro formato sai como veio. */
export function formatarCep(v?: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v;
}
/** +5511987654321 → (11) 98765-4321; número estrangeiro sai como veio. */
export function formatarTelefone(v?: string | null): string | null {
  if (!v) return null;
  let d = v.replace(/\D/g, "");
  if (v.trim().startsWith("+") && !d.startsWith("55")) return v;
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}
const FORMAS_A_VISTA = new Set<string>(["pix", "dinheiro", "cartao_debito", "transferencia"]);
function endereco(e: Partial<Record<keyof EmpresaContrato, string | null>>): string {
  return (
    [
      e.endereco,
      e.numero,
      e.complemento,
      e.bairro,
      [e.cidade, e.uf].filter(Boolean).join("/"),
      formatarCep(e.cep),
    ]
      .filter(Boolean)
      .join(", ") || vazio
  );
}
function Rodape({ numero }: { numero: string | number }) {
  return (
    <View style={s.rodape} fixed>
      <Text>Contrato de Compra e Venda nº {numero}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}
/** Título de cláusula que não fica sozinho no pé da página. */
function Clausula({ children }: { children: React.ReactNode }) {
  return (
    <Text style={s.clausula} minPresenceAhead={48}>
      {children}
    </Text>
  );
}
/** Item numerado com recuo pendente: o texto alinha depois do número. */
function Item({ numero, item }: { numero: string; item: ItemDoContrato }) {
  const destaque = itemLimitativo(item);
  return (
    <View style={destaque ? [s.item, s.limitativa] : s.item} wrap={!destaque}>
      <Text style={s.itemNumero}>{numero}</Text>
      <Text style={destaque ? [s.itemTexto, s.negrito] : s.itemTexto}>{textoDoItem(item)}</Text>
    </View>
  );
}
/** Tabela de colunas fixas: cabeçalho sombreado e a última coluna (valor) à direita. */
function Tabela({
  colunas,
  larguras,
  children,
}: {
  colunas: string[];
  larguras: string[];
  children: React.ReactNode;
}) {
  return (
    <View style={s.tabela}>
      <View style={[s.linha, s.linhaCabecalho]}>
        {colunas.map((v, i) => (
          <Text
            key={v}
            style={[
              s.celula,
              s.cabecalhoTexto,
              { width: larguras[i] },
              ...(i === colunas.length - 1 ? [s.direita] : []),
            ]}
          >
            {v}
          </Text>
        ))}
      </View>
      {children}
    </View>
  );
}
function Linha({ larguras, valores }: { larguras: string[]; valores: React.ReactNode[] }) {
  return (
    <View style={s.linha} wrap={false}>
      {valores.map((v, i) => (
        <Text
          key={i}
          style={[
            s.celula,
            { width: larguras[i] },
            ...(i > 0 && i === valores.length - 1 ? [s.direita] : []),
          ]}
        >
          {v}
        </Text>
      ))}
    </View>
  );
}
function Total({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={s.totalLinha} wrap={false}>
      <Text style={[s.negrito, { marginRight: 12 }]}>{rotulo}</Text>
      <Text style={[s.negrito, s.direita, { flex: 1 }]}>{valor}</Text>
    </View>
  );
}
function Campo({ nome, valor, largura }: { nome: string; valor: string; largura: string }) {
  return (
    <View style={[s.celula, { width: largura }]}>
      <Text style={s.rotulo}>{nome}</Text>
      <Text>{valor}</Text>
    </View>
  );
}
function Veiculo({ v, titulo, valor }: { v: VeiculoDaNegociacao; titulo: string; valor: string }) {
  const celulas: [string, string | null | undefined][] = [
    ["Ano fab./modelo", `${v.ano_fabricacao ?? "___"}/${v.ano_modelo ?? "___"}`],
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
      <Text style={s.subtitulo}>{titulo}</Text>
      <View style={s.tabela}>
        <View style={s.linha}>
          <Campo
            nome="Marca / modelo / versão"
            valor={txt([v.marca, v.modelo, v.versao].filter(Boolean).join(" "))}
            largura="100%"
          />
        </View>
        {[0, 2, 4, 6].map((inicio) => (
          <View key={inicio} style={s.linha}>
            {celulas.slice(inicio, inicio + 2).map(([nome, valor]) => (
              <Campo key={nome} nome={nome} valor={txt(valor)} largura="50%" />
            ))}
          </View>
        ))}
        <Total rotulo="Valor" valor={valor} />
      </View>
    </View>
  );
}

interface Parte {
  papel: string;
  nome: string;
  loja: boolean;
}
function Assinaturas({ partes, representante }: { partes: Parte[]; representante: string | null }) {
  return (
    <View style={s.assinaturas}>
      {partes.map((p) => (
        <View key={p.papel} style={s.assinatura}>
          <Text style={s.negrito}>{p.nome}</Text>
          {p.loja && representante ? <Text>{representante}</Text> : null}
          <Text style={s.papel}>{p.papel}</Text>
        </View>
      ))}
    </View>
  );
}
/** "3 meses" a partir de 2026-11-20 → 20/02/2027; prazo sem número e unidade sai em branco. */
export function fimDaGarantia(inicio?: string | null, prazoTexto?: string | null): string {
  const m = prazoTexto?.match(PRAZO_DA_GARANTIA);
  if (!inicio || !m || !/^\d{4}-\d{2}-\d{2}/.test(inicio)) return vazio;
  const [a = 0, mm = 1, dd = 1] = inicio.slice(0, 10).split("-").map(Number);
  const q = Number(m[1]);
  const u = (m[2] ?? "").toLowerCase();
  const fim = new Date(Date.UTC(a, mm - 1, dd));
  if (u.startsWith("d")) fim.setUTCDate(fim.getUTCDate() + q);
  else if (u.startsWith("a")) fim.setUTCFullYear(fim.getUTCFullYear() + q);
  else fim.setUTCMonth(fim.getUTCMonth() + q);
  return data(fim.toISOString());
}
const km = (v?: number | null) => (v == null ? vazio : v.toLocaleString("pt-BR"));
/** Linha "Rótulo: valor"; sem valor, a lacuna para preencher à mão. */
function Preenchidos({ linhas }: { linhas: [string, string | null | undefined][] }) {
  return (
    <>
      {linhas.map(([rotulo, valor]) => (
        <Text key={rotulo} style={s.lacunas}>
          {rotulo}: {valor?.trim() ? valor : `${vazio}${vazio}`}
        </Text>
      ))}
    </>
  );
}
function Lacunas({ campos }: { campos: string[] }) {
  return (
    <>
      {campos.map((c) => (
        <Text key={c} style={s.lacunas}>
          {c}: {vazio}
          {vazio}
        </Text>
      ))}
    </>
  );
}
const rotuloDe = (lista: readonly (readonly [string, string])[], k?: string | null) =>
  lista.find(([v]) => v === k)?.[1] ?? vazio;
const simNao = (b?: boolean | null) => (b == null ? vazio : b ? "Sim" : "Não");

/** Anexo I da venda nova: laudo de vistoria em três itens (vistoria, estado, declarações). */
function LaudoDeVistoria({
  n,
  declaracoes,
  representante,
}: {
  n: Negociacao;
  declaracoes: ItemDoContrato[];
  representante: string | null;
}) {
  const v = n.contrato?.vistoria ?? {};
  const id = v.identificacao ?? {};
  const avarias = avariasDoLaudo(v);
  const c = v.cautelar;
  const confere = (k?: string) =>
    rotuloDe(
      [
        ["confere", "Confere"],
        ["divergente", "Divergente"],
      ],
      k,
    );
  const grupos = [...new Set(ITENS_DA_VISTORIA.map(([, g]) => g))];
  return (
    <>
      <Text style={s.subtitulo}>1. Da vistoria</Text>
      <Preenchidos
        linhas={[
          ["Data e hora", `${data(v.data)}, às ${txt(v.hora)}`],
          ["Vistoriador", v.vistoriador?.trim() || representante],
          [
            "O COMPRADOR acompanhou a vistoria",
            v.comprador_acompanhou == null ? null : simNao(v.comprador_acompanhou),
          ],
          ["Quilometragem conferida", v.km == null ? null : `${km(v.km)} km`],
        ]}
      />
      <View wrap={false}>
        <Tabela
          colunas={["Identificação", "Conferência com o documento"]}
          larguras={["50%", "50%"]}
        >
          <Linha larguras={["50%", "50%"]} valores={["Placa", confere(id.placa)]} />
          <Linha larguras={["50%", "50%"]} valores={["Chassi", confere(id.chassi)]} />
          <Linha larguras={["50%", "50%"]} valores={["Número do motor", confere(id.motor)]} />
          <Linha larguras={["50%", "50%"]} valores={["Renavam", confere(id.renavam)]} />
          <Linha
            larguras={["50%", "50%"]}
            valores={[
              "Sinal de remarcação de chassi ou motor",
              rotuloDe(
                [
                  ["nao", "Não"],
                  ["sim", "Sim"],
                ],
                id.remarcacao,
              ),
            ]}
          />
        </Tabela>
      </View>

      <Text style={s.subtitulo}>2. Do estado do veículo</Text>
      <Text style={s.paragrafo}>
        Legenda: {SITUACOES.map(([k, r]) => `${k} = ${r}`).join("; ")}.
      </Text>
      {grupos.map((g) => (
        <View key={g} wrap={false}>
          <Tabela colunas={[g, "Situação", "Observação"]} larguras={["42%", "14%", "44%"]}>
            {ITENS_DA_VISTORIA.filter(([, gi]) => gi === g).map(([k, , rotulo]) => {
              const item = v.itens?.[k];
              const obs = [item?.obs, item?.estado === "NV" ? item?.justificativa : ""]
                .filter((t) => t?.trim())
                .join(" — ");
              return (
                <Linha
                  key={k}
                  larguras={["42%", "14%", "44%"]}
                  valores={[rotulo, item?.estado ?? vazio, obs || "—"]}
                />
              );
            })}
          </Tabela>
        </View>
      ))}
      <Preenchidos
        linhas={[
          [
            `Menor sulco medido nos pneus (mínimo legal ${SULCO_MINIMO_MM.toLocaleString("pt-BR")} mm)`,
            v.sulco_mm == null ? null : `${v.sulco_mm.toLocaleString("pt-BR")} mm`,
          ],
          [
            "Fotos da vistoria",
            v.fotos?.quantidade == null
              ? null
              : `${v.fotos.quantidade}${v.fotos.meio?.trim() ? `, ${v.fotos.meio.trim()}` : ""}`,
          ],
        ]}
      />
      <View wrap={false}>
        <Tabela
          colunas={["Avarias descritas", "Loja repara antes da entrega"]}
          larguras={["75%", "25%"]}
        >
          {avarias.length ? (
            avarias.map((a, i) => (
              <Linha
                key={i}
                larguras={["75%", "25%"]}
                valores={[a.descricao, simNao(a.loja_repara)]}
              />
            ))
          ) : (
            <Linha larguras={["75%", "25%"]} valores={["Nenhuma avaria descrita.", "—"]} />
          )}
        </Tabela>
      </View>
      {c?.empresa?.trim() || c?.resultado ? (
        <Preenchidos
          linhas={[
            [
              "Laudo cautelar",
              `${txt(c.empresa)}, CNPJ ${txt(c.cnpj)}, nº ${txt(c.numero)}, de ${data(c.data)}`,
            ],
            ["Resultado do laudo cautelar", rotuloDe(RESULTADOS_DA_CAUTELAR, c.resultado)],
          ]}
        />
      ) : null}

      <Text style={s.subtitulo}>3. Das declarações</Text>
      {declaracoes.map((it, i) => (
        <Item key={i} numero={`3.${i + 1}`} item={it} />
      ))}
    </>
  );
}

/** Corpo de cada anexo impresso depois das assinaturas. */
function ConteudoDoAnexo({
  anexo,
  n,
  partes,
  representante,
  localDaLoja,
  laudo,
  termo,
  anexoDoEstado,
}: {
  anexo: AnexoDoContrato;
  n: Negociacao;
  partes: Parte[];
  representante: string | null;
  localDaLoja: string;
  /** Declarações do laudo de vistoria; ausente, sai o anexo antigo. */
  laudo?: ItemDoContrato[];
  /** Declarações do termo de entrega (só na venda). */
  termo?: ItemDoContrato[];
  /** Número do anexo do estado do veículo ("Anexo I"), citado no termo de entrega. */
  anexoDoEstado: string;
}) {
  const d = n.contrato!;
  const e = d.empresa!;
  const veiculo = tituloDoVeiculoDaNegociacao(n.veiculo);
  const condutor = n.tipo === "venda" ? n.cliente : null;
  const fecho = (quando?: string | null) => (
    <View wrap={false} style={{ marginTop: 10 }}>
      <Text style={s.local}>
        {txt(d.local)}, {data(quando)}
      </Text>
      <Assinaturas partes={partes} representante={representante} />
    </View>
  );
  switch (anexo.chave) {
    case "estado_veiculo":
      if (laudo)
        return (
          <>
            <Veiculo
              v={n.veiculo}
              titulo="Veículo vendido"
              valor={formatarPreco(n.valor_cents, n.moeda || "BRL")}
            />
            <LaudoDeVistoria n={n} declaracoes={laudo} representante={representante} />
            {fecho(d.assinatura_em)}
          </>
        );
      return (
        <>
          <Veiculo
            v={n.veiculo}
            titulo={n.tipo === "venda" ? "Veículo vendido" : "Veículo comprado pela loja"}
            valor={formatarPreco(n.valor_cents, n.moeda || "BRL")}
          />
          <Text style={s.paragrafo}>
            As partes registram o estado do veículo no momento da assinatura:
          </Text>
          <Preenchidos
            linhas={[
              ["Lataria e pintura", d.estado_veiculo?.lataria],
              ["Interior", d.estado_veiculo?.interior],
              ["Pneus", d.estado_veiculo?.pneus],
              ["Itens e acessórios", d.estado_veiculo?.itens],
              ["Observações", d.estado_veiculo?.observacoes],
            ]}
          />
          {fecho(d.assinatura_em)}
        </>
      );
    case "termo_entrega": {
      const t = d.termo_entrega ?? {};
      const kmDaEntrega = usaLaudoDeVistoria(d)
        ? kmDaVistoria(d.entrega_km ?? undefined, d.vistoria?.km, n.veiculo.km)
        : (d.entrega_km ?? n.veiculo.km);
      const r = t.retirada_por;
      const terceiro = [r?.nome, r?.cpf, r?.cnh].some((x) => x?.trim());
      const quem = (p?: { nome?: string; cpf?: string }) =>
        p?.nome?.trim() ? `${p.nome.trim()}${p.cpf?.trim() ? `, CPF ${p.cpf.trim()}` : ""}` : null;
      return (
        <>
          <Text style={s.paragrafo}>
            Veículo: {veiculo}. Estado descrito no {anexoDoEstado}.
          </Text>
          <Text style={s.subtitulo}>1. Da entrega</Text>
          <Preenchidos
            linhas={[
              ["Data e hora", `${data(d.entrega_em)}, às ${txt(d.entrega_hora)}`],
              ["Local", t.local?.trim() || localDaLoja],
              ["Quilometragem na entrega", kmDaEntrega == null ? null : `${km(kmDaEntrega)} km`],
              ["Chaves entregues", d.entrega_chaves == null ? null : String(d.entrega_chaves)],
              ["Nível de combustível", t.combustivel ? rotuloDe(COMBUSTIVEIS, t.combustivel) : null],
              ["Entregue por (VENDEDORA)", quem(t.funcionario) ?? representante],
              ...(terceiro
                ? ([
                    ["Retirado por terceiro autorizado pelo COMPRADOR", quem(r)],
                    ["CNH do terceiro", r?.cnh],
                  ] as [string, string | null | undefined][])
                : []),
            ]}
          />
          <View wrap={false}>
            <Tabela colunas={["Item", "Entregue", "Observação"]} larguras={["42%", "14%", "44%"]}>
              {ITENS_DA_ENTREGA.map(([k, rotulo]) => {
                const item = t.itens?.[k];
                return (
                  <Linha
                    key={k}
                    larguras={["42%", "14%", "44%"]}
                    valores={[rotulo, simNao(item?.entregue), item?.obs?.trim() || "—"]}
                  />
                );
              })}
            </Tabela>
          </View>
          <Preenchidos
            linhas={[
              ["Fotos da entrega", t.fotos == null ? null : String(t.fotos)],
              ["Avarias ou observações no ato da entrega", t.avarias?.trim() || null],
            ]}
          />
          {termo?.length ? (
            <>
              <Text style={s.subtitulo}>2. Das declarações</Text>
              {termo.map((it, i) => (
                <Item key={i} numero={`2.${i + 1}`} item={it} />
              ))}
            </>
          ) : null}
          {fecho(d.entrega_em)}
        </>
      );
    }
    case "termo_recebimento":
      return (
        <>
          <Text style={s.paragrafo}>
            A VENDEDORA declara ter recebido, em {data(d.recebimento_troca_em)}, às{" "}
            {txt(d.recebimento_troca_hora)}, o VEÍCULO EM PAGAMENTO{" "}
            {n.troca ? tituloDoVeiculoDaNegociacao(n.troca) : vazio}, com quilometragem de{" "}
            {km(d.recebimento_troca_km ?? n.troca?.km)} km, as chaves (
            {txt(d.recebimento_troca_chaves)} unidades) e os documentos listados neste contrato.
          </Text>
          {fecho(d.recebimento_troca_em)}
        </>
      );
    case "indicacao_condutor":
      return (
        <>
          <Text style={s.paragrafo}>
            Para os fins do art. 257, § 7º, do Código de Trânsito Brasileiro e da Resolução CONTRAN
            nº 918/2022, fica indicado como condutor do veículo {veiculo}, a partir da entrega e até
            a transferência:
          </Text>
          {/* Na venda, o condutor é o comprador; na compra, a loja indica à mão. */}
          <Preenchidos
            linhas={[
              ["Nome", condutor?.nome],
              ["CPF", condutor ? formatarDocumento(condutor.documento) : null],
              ["CNH nº", condutor?.cnh],
            ]}
          />
          <Lacunas
            campos={[
              "Categoria / validade da CNH",
              "Auto de infração",
              "Data, hora e local da infração",
            ]}
          />
          {fecho(d.entrega_em)}
        </>
      );
    case "documentos_troca":
      return (
        <>
          <Text style={s.paragrafo}>
            Documentos entregues com o VEÍCULO EM PAGAMENTO{" "}
            {n.troca ? tituloDoVeiculoDaNegociacao(n.troca) : vazio}:
          </Text>
          {[
            "CRLV-e",
            "ATPV-e emitida em favor da VENDEDORA",
            "Documento de identificação do proprietário",
            "Comprovante de quitação ou saldo do gravame",
            "Manual e chave reserva",
          ].map((x) => (
            <Text key={x} style={s.lacunas}>
              ( ) {x}
            </Text>
          ))}
          {fecho(d.recebimento_troca_em)}
        </>
      );
    case "termo_garantia": {
      const gc = d.garantia_contratual;
      const contato = [formatarTelefone(e.telefone), e.email].filter(Boolean).join(" / ");
      const itens = [
        `Cobertura: ${txt(gc?.componentes)}, do veículo ${veiculo}.`,
        "Exclusões: desgaste natural, mau uso, acidente, intervenção de terceiros não autorizados pela VENDEDORA e falta das revisões previstas.",
        `Prazo: ${txt(gc?.prazo)}, de ${data(d.entrega_em)} a ${fimDaGarantia(d.entrega_em, gc?.prazo)}.`,
        `Como acionar: pelo contato ${txt(contato)}, apresentando este contrato, documento de identificação e os comprovantes de revisão.`,
        `Local do atendimento: ${localDaLoja}, ou oficina indicada por escrito pela VENDEDORA.`,
        "Obrigações do COMPRADOR: fazer as revisões no prazo ou na quilometragem indicados pelo fabricante e comunicar o defeito assim que o perceber.",
        "Esta garantia contratual complementa a garantia legal (art. 50 do Código de Defesa do Consumidor); o prazo legal corre depois do término deste prazo.",
      ];
      return (
        <>
          {itens.map((t, i) => (
            <Item key={i} numero={`${i + 1}.`} item={t} />
          ))}
          {fecho(d.entrega_em)}
        </>
      );
    }
  }
}

const ONDE: Record<string, string> = {
  empresa: "Empresa",
  cliente: "Cliente",
  veiculo: "Veículo vendido",
  troca: "VEÍCULO EM PAGAMENTO",
  pagamentos: "Pagamentos",
  contrato: "Dados do contrato",
};

/** Só na minuta: o que falta para a versão de assinatura. Não integra o contrato. */
function PendenciasDaMinuta({ decisao }: { decisao: DecisaoDoContrato }) {
  const anexos = decisao.manifesto.itens.filter((i) =>
    decisao.anexos_pendentes.includes(i.documento),
  );
  return (
    <View style={s.pendencias}>
      <Clausula>Pendências desta minuta (não integram o contrato)</Clausula>
      {decisao.motivos.map((m, i) => (
        <Text key={`m${i}`} style={s.pendencia}>
          • {m}
        </Text>
      ))}
      {[...decisao.bloqueios, ...decisao.avisos].map((p, i) => (
        <Text key={`p${i}`} style={s.pendencia}>
          • {ONDE[p.onde]}: {p.mensagem}
          {p.gravidade === "aviso" ? " (aviso)" : ""}
        </Text>
      ))}
      {anexos.length ? (
        <>
          <Text style={s.subtitulo}>Documentos da pasta ainda sem emissão pelo sistema</Text>
          {anexos.map((a) => (
            <Text key={a.documento} style={s.pendencia}>
              • {TITULO_DO_DOCUMENTO[a.documento]}: {a.motivo}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

// Três colunas a 12pt: menos colunas e mais quebra de linha, nunca letra menor.
const COLUNAS_DEBITOS = ["Veículo / descrição", "Situação / observação", "Valor"];
const LARGURAS_DEBITOS = ["46%", "32%", "22%"];
const COLUNAS_PAGAMENTO = ["Forma / situação", "Detalhes", "Valor"];
const LARGURAS_PAGAMENTO = ["28%", "50%", "22%"];

/**
 * Modelo recebido da loja; dados variáveis e texto contratual saem somente da
 * fotografia. Blocos e versão (minuta ou assinatura) vêm do retrato da operação.
 */
export function ContratoModelo({ n, decisao }: { n: Negociacao; decisao?: DecisaoDoContrato }) {
  const dec = decisao ?? decidirVersaoDoContrato(n);
  const { blocos, comprador } = dec.retrato;
  const minuta = dec.versao === "minuta";
  const d = n.contrato!;
  const e = d.empresa!;
  const c = n.cliente;
  const preco = (v: number) => formatarPreco(v, n.moeda || "BRL");
  const extenso = (v: number) =>
    (n.moeda || "BRL") === "BRL" ? `${preco(v)} (${reaisPorExtenso(v)})` : preco(v);
  const resumo = resumoDaNegociacao(n);
  const loja = `${txt(e.razao_social)}${e.nome_fantasia && e.nome_fantasia !== e.razao_social ? ` (${e.nome_fantasia})` : ""}, com sede em ${endereco(e)}, CNPJ ${txt(formatarDocumento(e.cnpj))}, telefone ${txt(formatarTelefone(e.telefone))}, e-mail ${txt(e.email)}`;
  const contato = `telefone ${txt(formatarTelefone(c.telefone))}, e-mail ${txt(c.email)}`;
  const cliente =
    comprador === "pessoa_juridica"
      ? `${txt(c.nome)}, com sede em ${endereco(c)}, CNPJ ${txt(formatarDocumento(c.documento))}, ${contato}`
      : `${txt(c.nome)}, nacionalidade ${txt(c.nacionalidade)}, nascimento ${data(c.nascimento)}, estado civil ${txt(c.estado_civil)}, profissão ${txt(c.profissao)}, residente em ${endereco(c)}, ${comprador === "pessoa_fisica" ? "CPF" : "CPF/CNPJ"} ${txt(formatarDocumento(c.documento))}, RG ${txt(c.rg)} ${txt(c.rg_orgao_expedidor)}/${txt(c.rg_uf)}, ${contato}`;
  const venda = n.tipo === "venda";
  const fixas = clausulasFixas(n, blocos);
  // A compra pela loja não tem cláusula de entrega no modelo: as datas ganham
  // uma cláusula própria antes das disposições gerais.
  const secoes: SecaoDoContrato[] = venda
    ? fixas.secoes
    : [{ titulo: "Da entrega e recebimento", itens: [] }, ...fixas.secoes];
  const indiceDaEntrega = secoes.findIndex((x) => x.titulo.startsWith("Da entrega"));
  const representante = assinanteDaLoja(n);
  const testemunhas = [0, 1].map((i) => d.testemunhas?.[i]);
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
  // Papel definido uma vez na qualificação e repetido igual nas assinaturas.
  const partes: Parte[] = [
    {
      papel: venda ? "VENDEDORA" : "VENDEDOR(A)",
      nome: venda ? txt(e.razao_social) : txt(c.nome),
      loja: venda,
    },
    {
      papel: venda ? "COMPRADOR" : "COMPRADORA",
      nome: venda ? txt(c.nome) : txt(e.razao_social),
      loja: !venda,
    },
  ];
  return (
    <Document title={`Contrato de Compra e Venda ${n.numero}`}>
      <Page size="A4" style={s.pagina}>
        <Rodape numero={n.numero} />
        <View style={s.corpo}>
          <View style={s.cabecalho}>
            <Text style={s.titulo}>CONTRATO DE COMPRA E VENDA</Text>
            <Text style={s.codigo}>
              Código: {n.numero}
              {minuta ? " · MINUTA" : ""}
            </Text>
          </View>
          {minuta ? (
            <Text style={s.minuta}>Minuta para conferência. Não é a versão para assinatura.</Text>
          ) : null}
          <Text style={s.paragrafo}>
            De um lado, {venda ? loja : cliente}, doravante {venda ? "denominada" : "denominado(a)"}{" "}
            <Text style={s.negrito}>{partes[0]!.papel}</Text>.
          </Text>
          <Text style={s.paragrafo}>
            De outro lado, {venda ? cliente : loja}, doravante{" "}
            {venda ? "denominado(a)" : "denominada"}{" "}
            <Text style={s.negrito}>{partes[1]!.papel}</Text>.
          </Text>
          <Text style={s.paragrafo}>
            As partes acima identificadas ajustam a compra e venda descrita nas condições abaixo.
          </Text>

          <Clausula>Cláusula 1ª: Do(s) veículo(s)</Clausula>
          <Veiculo
            v={n.veiculo}
            titulo={venda ? "Veículo vendido" : "Veículo comprado pela loja"}
            valor={extenso(resumo.total_cents)}
          />
          {n.troca ? (
            <Veiculo
              v={n.troca}
              titulo="VEÍCULO EM PAGAMENTO"
              valor={extenso(n.troca.valor_cents)}
            />
          ) : null}
          {n.troca && blocos.quitacao_da_troca ? (
            <Text style={s.paragrafo}>
              Quitação da troca: {preco(n.troca.quitacao_cents)} · Valor líquido da troca:{" "}
              {preco(resumo.troca_liquida_cents)}
            </Text>
          ) : null}
          <View wrap={false}>
            <Text style={s.subtitulo}>Situação de regularização do(s) veículo(s)</Text>
            <Tabela colunas={COLUNAS_DEBITOS} larguras={LARGURAS_DEBITOS}>
              {debitos.flatMap(({ v, nome }, j) =>
                v.regularizacao?.length
                  ? v.regularizacao.map((r, i) => (
                      <Linha
                        key={`${j}-${i}`}
                        larguras={LARGURAS_DEBITOS}
                        valores={[
                          `${nome}: ${r.descricao}`,
                          [
                            {
                              cliente: "Cliente paga",
                              loja: "Loja paga",
                              quitado: "Quitado / sem débito",
                              a_definir: "A definir",
                            }[r.responsavel],
                            r.observacao?.trim() || null,
                          ]
                            .filter(Boolean)
                            .join("; "),
                          preco(r.valor_cents),
                        ]}
                      />
                    ))
                  : [
                      <Linha
                        key={`${j}-vazio`}
                        larguras={["100%"]}
                        valores={[`${nome}: situação de débitos não informada`]}
                      />,
                    ],
              )}
            </Tabela>
          </View>

          <Clausula>Cláusula 2ª: Do pagamento</Clausula>
          <Text style={s.paragrafo}>
            {blocos.desconto
              ? `Valor negociado: ${preco(n.valor_cents)} · Desconto: ${preco(n.desconto_cents)} · `
              : ""}
            <Text style={s.negrito}>Total: {extenso(resumo.total_cents)}</Text>
          </Text>
          <Tabela colunas={COLUNAS_PAGAMENTO} larguras={LARGURAS_PAGAMENTO}>
            {blocos.troca ? (
              <Linha
                larguras={["78%", "22%"]}
                valores={[
                  "VEÍCULO EM PAGAMENTO (valor líquido)",
                  preco(resumo.troca_liquida_cents),
                ]}
              />
            ) : null}
            {n.pagamentos.map((p, i) => (
              <Linha
                key={i}
                larguras={LARGURAS_PAGAMENTO}
                valores={[
                  `${ROTULO_DA_FORMA[p.forma]} — ${txt(p.situacao || (FORMAS_A_VISTA.has(p.forma) ? "À vista" : null))}`,
                  [
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
                    .join("; "),
                  preco(p.valor_cents),
                ]}
              />
            ))}
            <Total
              rotulo="Valor total"
              valor={extenso(resumo.pagamentos_cents + resumo.troca_liquida_cents)}
            />
          </Tabela>
          {fixas.pagamento.map((v, i) => (
            <Item key={i} numero={`2.${i + 1}.`} item={v} />
          ))}

          {secoes.map((secao, i) => (
            <React.Fragment key={secao.titulo}>
              <Clausula>
                Cláusula {i + 3}ª: {secao.titulo}
              </Clausula>
              {i === indiceDaEntrega ? (
                <>
                  <Text style={s.paragrafo}>
                    {tituloDoVeiculoDaNegociacao(n.veiculo)} — Data prevista de{" "}
                    {venda ? "entrega" : "recebimento"}: {data(d.entrega_em)}
                    {d.entrega_hora ? `, às ${d.entrega_hora}` : ""}
                  </Text>
                  {blocos.troca && n.troca ? (
                    <Text style={s.paragrafo}>
                      {tituloDoVeiculoDaNegociacao(n.troca)} — Data prevista de recebimento do
                      VEÍCULO EM PAGAMENTO: {data(d.recebimento_troca_em)}
                      {d.recebimento_troca_hora ? `, às ${d.recebimento_troca_hora}` : ""}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {secao.itens.map((v, k) => (
                <Item key={k} numero={`${i + 3}.${k + 1}.`} item={v} />
              ))}
            </React.Fragment>
          ))}
          {d.clausula_especial?.trim() ? (
            <>
              <Clausula>Cláusula Especial</Clausula>
              {d.clausula_especial_limitativa ? (
                <View style={s.limitativa} wrap={false}>
                  <Text style={[s.paragrafo, s.negrito, { marginBottom: 0 }]}>
                    {txt(d.clausula_especial)}
                  </Text>
                </View>
              ) : (
                <Text style={s.paragrafo}>{txt(d.clausula_especial)}</Text>
              )}
            </>
          ) : null}
          {n.observacoes ? (
            <>
              <Clausula>Observações da negociação</Clausula>
              <Text style={s.paragrafo}>{n.observacoes}</Text>
            </>
          ) : null}

          {/* Fecho, data e assinaturas juntos: assinatura nunca fica sozinha numa página. */}
          <View wrap={false} style={{ marginTop: 10 }}>
            <Text style={s.paragrafo}>
              E, por estarem de comum acordo, assinam o presente instrumento em 2 (duas) vias de
              igual teor.
            </Text>
            <Text style={s.local}>
              {txt(d.local)}, {instante}
            </Text>
            <Assinaturas partes={partes} representante={representante} />
            <View style={s.assinaturas}>
              {testemunhas.map((t, i) => (
                <View key={i} style={s.assinatura}>
                  <Text style={s.negrito}>Testemunha {i + 1}</Text>
                  <Text>Nome: {txt(t?.nome)}</Text>
                  <Text>CPF: {t?.cpf ? formatarDocumento(t.cpf) : txt(null)}</Text>
                </View>
              ))}
            </View>
          </View>
          {minuta ? <PendenciasDaMinuta decisao={dec} /> : null}
        </View>
      </Page>
      {fixas.anexos.map((a) => (
        <Page key={a.chave} size="A4" style={s.pagina}>
          <Rodape numero={n.numero} />
          <View style={s.corpo}>
            <View style={s.cabecalho}>
              <Text style={s.titulo}>{a.numero.toUpperCase()}</Text>
              <Text style={[s.titulo, { fontSize: 13, marginTop: 4 }]}>{a.nome.toUpperCase()}</Text>
              <Text style={s.codigo}>Contrato de Compra e Venda nº {n.numero}</Text>
            </View>
            <ConteudoDoAnexo
              anexo={a}
              n={n}
              partes={partes}
              representante={representante}
              localDaLoja={endereco(e)}
              laudo={fixas.laudo}
              termo={fixas.termo}
              anexoDoEstado={
                fixas.anexos.find((x) => x.chave === "estado_veiculo")?.numero ??
                "anexo do estado do veículo"
              }
            />
          </View>
        </Page>
      ))}
    </Document>
  );
}
