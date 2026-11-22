import { z } from "zod";

export const schemaEstabelecimento = z.object({
  cadastrado: z.boolean(),
  confirmado: z.boolean(),
  vinculado: z.boolean(),
});

const bool = z.boolean().default(false);
export const schemaStatus = z.object({
  chassi: z.string().default(""),
  placa: z.string().default(""),
  renavam: z.string().default(""),
  descricao: z.string().default(""),
  estoqueRenave: bool,
  situacaoEstoqueRenave: z.enum(["S", "T", "C", "X", "V", "E", "I", ""]).default(""),
  documentosDisponiveis: z
    .object({ termoEntrada: bool, atpvEntrada: bool, crlv: bool, termoSaida: bool, atpvSaida: bool })
    .default({ termoEntrada: false, atpvEntrada: false, crlv: false, termoSaida: false, atpvSaida: false }),
});

export const schemaPdf = z.object({ placa: z.string().optional(), renavam: z.string().optional(), pdfBase64: z.string().min(1) });
export const schemaCrlve = z.object({
  placa: z.string().optional(),
  renavam: z.string().optional(),
  pdfCrlveBase64: z.string().min(1),
  pdfCodigoSegurancaCrvBase64: z.string().optional(),
});

const itemCredito = z.object({
  cnpj: z.string(),
  creditosSeminovos: z.number(),
  creditosZeroKm: z.number().default(0),
  razaoSocial: z.string().optional(),
});
export const schemaCreditos = z.union([itemCredito, z.array(itemCredito)]);

export const schemaErro = z.object({ message: z.string() }).partial();
/** Respostas de escrita não precisam de corpo; qualquer JSON (ou vazio) vale. */
export const schemaLivre = z.unknown();
