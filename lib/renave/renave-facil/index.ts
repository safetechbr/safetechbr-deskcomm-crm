import type { ZodType } from "zod";

import {
  RenaveErro,
  type ChaveVeiculo, type ClienteRenave, type CreditosRenave, type DocumentoBaixado, type EstabelecimentoRenave,
  type IntegradoraRenave, type NfeRenave, type StatusRenave, type TipoDocumentoRenave, type TransferenciaRenave, type VeiculoRenave,
} from "../tipos";
import { soDigitos } from "../validacao";
import { chamar, type OpcoesHttp } from "./http";
import { schemaCreditos, schemaCrlve, schemaEstabelecimento, schemaPdf, schemaStatus } from "./schemas";

/** Única fronteira da grafia `valor`/`Valor`: se o teste real divergir, trocar só aqui. */
export const CAMPO_VALOR = "valor";

export function corpoNfe(n: NfeRenave): Record<string, unknown> {
  return {
    chassi: n.chassi, tipoVeiculo: n.tipoVeiculo, chaveNfe: soDigitos(n.chaveNfe),
    cpfCnpj: soDigitos(n.cpfCnpj), dtHrProcesso: n.dtHrProcesso,
    [CAMPO_VALOR]: Number(n.valor.toFixed(2)),
  };
}

function ler<T>(schema: ZodType<T>, json: unknown): T {
  const r = schema.safeParse(json);
  if (!r.success) throw new RenaveErro("renave_indisponivel", null, "resposta_invalida");
  return r.data;
}

const q = (chave: ChaveVeiculo) => `?placa=${encodeURIComponent(chave.placa)}&renavam=${encodeURIComponent(soDigitos(chave.renavam))}`;

const ROTA_DOC: Record<TipoDocumentoRenave, string> = {
  termo_entrada: "termo/entrada", atpve_entrada: "atpve/entrada", crlve: "crlve",
  termo_saida: "termo/saida", atpve_saida: "atpve/saida",
};

export function criarRenaveFacil(opcoes: OpcoesHttp): IntegradoraRenave {
  const dms = (cnpj: string) => `/dms/${soDigitos(cnpj)}`;

  /** POST; se já existe (409), PUT. */
  async function upsert(raiz: string, corpoPost: Record<string, unknown>, sufixoPut: string, corpoPut: Record<string, unknown>) {
    try {
      await chamar(opcoes, "POST", raiz, `POST ${raiz.replace(/\/\d{14}\//, "/:cnpj/")}`, corpoPost);
    } catch (e) {
      if (!(e instanceof RenaveErro) || e.codigo !== "renave_ja_cadastrado") throw e;
      await chamar(opcoes, "PUT", `${raiz}/${sufixoPut}`, `PUT ${raiz.replace(/\/\d{14}\//, "/:cnpj/")}/:chave`, corpoPut);
    }
  }

  /** O 404 (veículo não cadastrado) é tratado por quem tem os dados: o serviço recadastra e repete uma vez. */
  async function enviarNfe(cnpj: string, op: "purchase" | "sales", nfe: NfeRenave) {
    await chamar(opcoes, "POST", `${dms(cnpj)}/vehicle/nfe/${op}`, `POST /dms/:cnpj/vehicle/nfe/${op}`, corpoNfe(nfe));
  }

  const veiculoCorpo = (v: VeiculoRenave) => ({
    descricao: v.descricao, anoFabricacao: v.anoFabricacao, anoModelo: v.anoModelo,
    placa: v.placa, renavam: v.renavam, ...(v.codigoFipe ? { codigoFipe: v.codigoFipe } : {}),
  });

  const api: IntegradoraRenave = {
    id: "renave-facil",

    async verificarEstabelecimento(cnpj): Promise<EstabelecimentoRenave> {
      const r = await chamar(opcoes, "GET", `/company/${soDigitos(cnpj)}/check`, "GET /company/:cnpj/check");
      return ler(schemaEstabelecimento, r.json);
    },

    async enviarCliente(cnpj, c: ClienteRenave) {
      const id = soDigitos(c.id);
      const resto = {
        razaoSocial: c.razaoSocial, cep: soDigitos(c.cep), logradouro: c.logradouro, numero: c.numero,
        ...(c.complemento ? { complemento: c.complemento } : {}),
        bairro: c.bairro, cidade: c.cidade, uf: c.uf, ...(c.email ? { email: c.email } : {}),
      };
      await upsert(`${dms(cnpj)}/client`, { id, tipoPessoa: id.length === 11 ? "F" : "J", ...resto }, id, resto);
    },

    async enviarVeiculo(cnpj, v) {
      await upsert(`${dms(cnpj)}/vehicle`, { tipoVeiculo: v.tipoVeiculo, chassi: v.chassi, ...veiculoCorpo(v) }, `${v.chassi}/${v.tipoVeiculo}`, veiculoCorpo(v));
    },

    enviarNfeCompra: (cnpj, nfe) => enviarNfe(cnpj, "purchase", nfe),
    enviarNfeVenda: (cnpj, nfe) => enviarNfe(cnpj, "sales", nfe),

    async enviarNfeTransferencia(cnpj, n: TransferenciaRenave) {
      await chamar(opcoes, "POST", `${dms(cnpj)}/vehicle/nfe/transfer`, "POST /dms/:cnpj/vehicle/nfe/transfer",
        { chassi: n.chassi, tipoVeiculo: n.tipoVeiculo, chaveNfe: soDigitos(n.chaveNfe) });
    },

    async consultarStatus(cnpj, chave): Promise<StatusRenave> {
      const r = await chamar(opcoes, "GET", `/renave/${soDigitos(cnpj)}/docs/status${q(chave)}`, "GET /renave/:cnpj/docs/status");
      const s = ler(schemaStatus, r.json);
      return {
        chassi: s.chassi, placa: s.placa, renavam: s.renavam, descricao: s.descricao,
        estoqueRenave: s.estoqueRenave, situacao: s.situacaoEstoqueRenave, documentos: s.documentosDisponiveis,
      };
    },

    async baixarDocumento(cnpj, chave, tipo): Promise<DocumentoBaixado | null> {
      const rota = ROTA_DOC[tipo];
      try {
        const r = await chamar(opcoes, "GET", `/renave/${soDigitos(cnpj)}/docs/${rota}${q(chave)}`, `GET /renave/:cnpj/docs/${rota}`);
        if (tipo === "crlve") {
          const d = ler(schemaCrlve, r.json);
          return { pdfs: [
            { nome: "crlve", base64: d.pdfCrlveBase64 },
            ...(d.pdfCodigoSegurancaCrvBase64 ? [{ nome: "codigo-seguranca-crv", base64: d.pdfCodigoSegurancaCrvBase64 }] : []),
          ] };
        }
        return { pdfs: [{ nome: tipo, base64: ler(schemaPdf, r.json).pdfBase64 }] };
      } catch (e) {
        // ATPV-e de entrada não existe com CRV de papel: ausência, não erro.
        if (e instanceof RenaveErro && e.codigo === "renave_nao_cadastrado" && tipo === "atpve_entrada") return null;
        throw e;
      }
    },

    async consultarCreditos(cnpj): Promise<CreditosRenave> {
      const d = soDigitos(cnpj);
      const r = await chamar(opcoes, "GET", `/credit/balance/dealer?cnpj=${d}`, "GET /credit/balance/dealer");
      const lista = ler(schemaCreditos, r.json);
      const item = (Array.isArray(lista) ? lista : [lista]).find((x) => soDigitos(x.cnpj) === d) ?? (Array.isArray(lista) ? lista[0] : lista);
      if (!item) throw new RenaveErro("renave_nao_cadastrado", 404, "sem_dados");
      return { cnpj: d, seminovos: item.creditosSeminovos, zeroKm: item.creditosZeroKm };
    },
  };
  return api;
}
