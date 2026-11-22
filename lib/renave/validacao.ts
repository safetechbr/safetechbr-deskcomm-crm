import { isValidCnpj } from "@/lib/cobranca/documento";
import { isValidCpf } from "@/lib/legal/perfil-do-pais";

import type { VeiculoRenave } from "./tipos";

export const soDigitos = (v: string | null | undefined): string => (v ?? "").replace(/\D/g, "");

export function cnpjValido(v: string): boolean {
  const d = soDigitos(v);
  return d.length === 14 && isValidCnpj(d);
}

export function cpfCnpjValido(v: string): boolean {
  const d = soDigitos(v);
  return d.length === 11 ? isValidCpf(d) : cnpjValido(d);
}

/** Máscara de exibição da chave da NF-e: grupos de 4 dígitos, até 44. */
export function mascararChaveNfe(v: string): string {
  return soDigitos(v).slice(0, 44).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Chave da NF-e: 44 dígitos e DV mod-11 (pesos 2..9 da direita para a esquerda). */
export function chaveNfeValida(v: string): boolean {
  const d = soDigitos(v);
  if (!/^\d{44}$/.test(d)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(d[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(d[43]);
}

/** `YYYY-MM-DDTHH:MM:SS` no fuso da loja, sem Z (formato exigido pela API). */
export function dataHoraLocal(d = new Date(), tz = "America/Sao_Paulo"): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export interface DadosParaEnvio {
  chassi?: string | null;
  placa?: string | null;
  renavam?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano_fabricacao?: number | null;
  ano_modelo?: number | null;
  codigo_fipe?: string | null;
}
export interface DadosPessoa {
  nome?: string | null;
  documento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
}

/** Lista o que falta, em português claro. Vazio = pode enviar. */
export function pendenciasDeEnvio(v: DadosParaEnvio, p: DadosPessoa | null, chaveNfe?: string | null): string[] {
  const f: string[] = [];
  if (!v.chassi || v.chassi.trim().length !== 17) f.push("Informe o chassi do veículo (17 caracteres).");
  if (!v.placa) f.push("Informe a placa do veículo.");
  if (!v.renavam) f.push("Informe o Renavam do veículo.");
  if (!v.ano_fabricacao || !v.ano_modelo) f.push("Informe o ano de fabricação e o ano do modelo.");
  if (!p) f.push("Falta o cadastro da outra parte (vendedor ou comprador).");
  else {
    if (!p.nome) f.push("Informe o nome da outra parte.");
    if (!cpfCnpjValido(p.documento ?? "")) f.push("CPF ou CNPJ da outra parte inválido ou ausente.");
    if (soDigitos(p.cep).length !== 8) f.push("Informe um CEP válido (8 dígitos) da outra parte.");
    if (!p.logradouro || !p.numero || !p.bairro || !p.municipio || !p.uf) f.push("Complete o endereço da outra parte (rua, número, bairro, cidade e UF).");
  }
  if (chaveNfe !== undefined && chaveNfe !== null && !chaveNfeValida(chaveNfe)) f.push("A chave da NF-e é inválida (44 dígitos com dígito verificador correto).");
  return f;
}

export function descricaoDoVeiculo(v: Pick<DadosParaEnvio, "marca" | "modelo">): string {
  return [v.marca, v.modelo].filter(Boolean).join(" ").toUpperCase();
}

export function montarVeiculo(v: DadosParaEnvio): VeiculoRenave {
  return {
    chassi: (v.chassi ?? "").trim().toUpperCase(),
    tipoVeiculo: "U",
    descricao: descricaoDoVeiculo(v),
    anoFabricacao: Number(v.ano_fabricacao),
    anoModelo: Number(v.ano_modelo),
    placa: (v.placa ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
    renavam: soDigitos(v.renavam),
    ...(v.codigo_fipe ? { codigoFipe: v.codigo_fipe } : {}),
  };
}
