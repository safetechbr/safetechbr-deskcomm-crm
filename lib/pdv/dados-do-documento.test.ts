import { describe, it, expect } from "vitest";
import {
  nomeDaZonaMecanica,
  interpretarComprovante,
  interpretarDocumento,
  preencherComDocumento,
} from "./dados-do-documento";
import { tipoDoDocumento, validarArquivoDocumento } from "./ler-documento-cliente";
const cnh = `CARTEIRA NACIONAL DE HABILITACAO
NOME
MARIA EXEMPLO DA SILVA
DOC. IDENTIDADE / ORG. EMISSOR / UF
12.345.678-9 SSP PI
CPF DATA NASCIMENTO
529.982.247-25 01/05/1990
N REGISTRO
12345678901
VALIDADE
01/05/2030
FILIACAO
NOME DA MAE EXEMPLO`;
describe("leitura de CNH e identidade", () => {
  it("extrai os dados do titular sem usar validade ou filiação", () => {
    expect(interpretarDocumento(cnh).dados).toEqual({
      nome: "MARIA EXEMPLO DA SILVA",
      documento: "529.982.247-25",
      rg: "12.345.678-9",
      cnh: "12345678901",
      nascimento: "1990-05-01",
    });
  });
  it("RG no verso e nome em linha com rótulo", () => {
    expect(
      interpretarDocumento(
        `NOME: JOAO EXEMPLO\nREGISTRO GERAL: 12345678-X\nDATA DE NASCIMENTO: 29/02/2000\nCPF: 52998224725\nDATA DE EMISSAO: 01/01/2020`,
      ).dados,
    ).toMatchObject({
      nome: "JOAO EXEMPLO",
      rg: "12345678-X",
      nascimento: "2000-02-29",
      documento: "529.982.247-25",
    });
  });
  it("aceita sobrenome Nascimento e rótulo bilíngue, sem completar dígitos ausentes", () => {
    expect(
      interpretarDocumento(
        "2 E 1 NOME E SOBRENOME / NAME AND SURNAME\nMARIA DO NASCIMENTO\nCPF\n529.982 .247-25",
      ).dados,
    ).toEqual({ nome: "MARIA DO NASCIMENTO", documento: "529.982.247-25" });
    expect(interpretarDocumento("CPF\nS29.982.247-25").dados.documento).toBeUndefined();
  });
  it("não adivinha CPF inválido, nascimento por outra data ou dados ausentes", () => {
    expect(
      interpretarDocumento("CPF: 11111111111\nDATA EMISSAO: 01/01/2020\nNASCIMENTO: 31/02/2001")
        .dados,
    ).toEqual({});
    expect(interpretarDocumento("texto ilegível").dados).toEqual({});
  });
  it("não escolhe pessoa quando há mais de um CPF", () => {
    const r = interpretarDocumento(cnh + "\nCPF: 111.444.777-35");
    expect(r.dados.documento).toBeUndefined();
    expect(r.avisos.length).toBeGreaterThan(0);
  });
  it("complementa cadastro já digitado sem sobrescrever nem alterar a entrada", () => {
    const original = { nome: "Nome informado", rg: "RG informado" };
    expect(
      preencherComDocumento(original, {
        nome: "OUTRO NOME",
        rg: "OUTRO RG",
        documento: "529.982.247-25",
        nascimento: "1990-05-01",
      }),
    ).toEqual({ ...original, documento: "529.982.247-25", nascimento: "1990-05-01" });
    expect(original).toEqual({ nome: "Nome informado", rg: "RG informado" });
  });
  it("valida tamanho e assinatura dos arquivos, não somente a extensão", () => {
    expect(() => validarArquivoDocumento({ size: 0 })).toThrow();
    expect(() => validarArquivoDocumento({ size: 11 * 1024 * 1024 })).toThrow();
    expect(tipoDoDocumento(new TextEncoder().encode("%PDF-1.7"))).toBe("pdf");
    expect(tipoDoDocumento(new Uint8Array([255, 216, 255]))).toBe("imagem");
    expect(() => tipoDoDocumento(new TextEncoder().encode("<svg onload=...>"))).toThrow();
  });
});

describe("comprovante de residência", () => {
  it("extrai endereço sem mudar identificação e preserva dados manuais", () => {
    const r = interpretarComprovante(
      "NOME: OUTRA PESSOA\nRUA DAS FLORES, 123\nBAIRRO: CENTRO\nCEP 64000-123\nTERESINA - PI",
    );
    expect(r.dados).toEqual({
      endereco: "RUA DAS FLORES",
      numero: "123",
      bairro: "CENTRO",
      cep: "64000-123",
      cidade: "TERESINA",
      uf: "PI",
    });
    expect(preencherComDocumento({ nome: "Cliente", numero: "45" }, r.dados)).toMatchObject({
      nome: "Cliente",
      numero: "45",
      endereco: "RUA DAS FLORES",
    });
  });
  it("não escolhe rua ou CEP quando há endereço do emissor e destinatário", () => {
    const r = interpretarComprovante(
      "RUA DO EMISSOR, 1\nCEP 64000-111\nRUA DO CLIENTE, 2\nCEP 64000-222",
    );
    expect(r.dados.endereco).toBeUndefined();
    expect(r.dados.cep).toBeUndefined();
    expect(r.avisos.length).toBeGreaterThan(0);
  });
});

it("lê nome de CNH-e ao lado da primeira habilitação, com bordas e ruído no rótulo", () => {
  const r = interpretarDocumento(
    "2 2 1 NOME E SOBRENOME 1º HABILITAÇÃO\n[MARIA EXEMPLO DO NASCIMENTO | 15/02/2019 |\n3 DATA, LOCAL E UF DE NASCIMENTO\n[25/04/2000, TERESINA, PI |\n4c DOC IDENTIDADE / ORG EMISSOR / UF\n[1234567 SSP PI |\n4d CPF 5 Nº REGISTRO\n529.982.247-25 | 12345678901",
  );
  expect(r.dados).toEqual({
    nome: "MARIA EXEMPLO DO NASCIMENTO",
    nascimento: "2000-04-25",
    rg: "1234567",
    documento: "529.982.247-25",
    cnh: "12345678901",
  });
});

describe("nome da zona mecânica da CNH", () => {
  const base = { cnh: "12345678901", nascimento: "1990-05-01" };
  const mrz =
    "I<BRA123456789<123<<<<<<<<<<\n\n9005011F3001012BRA<<<<<<<<<<<\nMARIA<<EXEMPLO<DA<SILVA<<<<";
  it("confere registro e nascimento e retorna o nome completo, ignorando linhas vazias", () => {
    expect(nomeDaZonaMecanica(mrz, base)).toBe("MARIA EXEMPLO DA SILVA");
    expect(nomeDaZonaMecanica(mrz, { ...base, cnh: "22345678901" })).toBeUndefined();
    expect(nomeDaZonaMecanica(mrz, { ...base, nascimento: "1991-05-01" })).toBeUndefined();
  });
  it("só aceita um dígito divergente com confirmação independente do nome da frente", () => {
    const leitura = mrz.replace("123456789<", "123456780<");
    expect(nomeDaZonaMecanica(leitura, base)).toBeUndefined();
    expect(nomeDaZonaMecanica(leitura, { ...base, nome: "MARA EXEMPLO DA SILVA" })).toBe(
      "MARIA EXEMPLO DA SILVA",
    );
    expect(
      nomeDaZonaMecanica(leitura, { ...base, nome: "OUTRA PESSOA DOS SANTOS" }),
    ).toBeUndefined();
    expect(
      nomeDaZonaMecanica(leitura.replace("123456780<", "123456700<"), {
        ...base,
        nome: "MARA EXEMPLO DA SILVA",
      }),
    ).toBeUndefined();
  });
});

describe("declaração de residência em texto corrido", () => {
  const cabecalho =
    "DECLARAÇÃO DE RESIDÊNCIA\nEMPRESA EXEMPLO\nRUA DA EMPRESA, 10, OUTRA CIDADE-SP, CEP 01.111-222\n";
  it("seleciona endereço declarado, entende CEP com ponto e campos na mesma frase", () => {
    const r = interpretarComprovante(
      cabecalho +
        "Eu CLIENTE EXEMPLO declaro sob as penas da lei que meu endereço é na\nRua/Avenida Nome Fictício Exemplo, 1234, CEP 64.000-123, bairro Bairro Exemplo na cidade de Cidade Modelo-PI.",
    );
    expect(r).toEqual({
      dados: {
        endereco: "Nome Fictício Exemplo",
        numero: "1234",
        cep: "64000-123",
        bairro: "Bairro Exemplo",
        cidade: "Cidade Modelo",
        uf: "PI",
      },
      avisos: [],
    });
    expect(r.dados.complemento).toBeUndefined();
  });
  it("une quebras de linha e aceita resido e UF em minúsculas", () => {
    expect(
      interpretarComprovante(
        cabecalho +
          "Declaro que resido na Rua Exemplo\nAzul,\n42, apto 2, CEP 64.000-123, bairro Centro na cidade de Cidade Modelo-pi.",
      ).dados,
    ).toEqual({
      endereco: "Rua Exemplo Azul",
      numero: "42",
      complemento: "apto 2",
      cep: "64000-123",
      bairro: "Centro",
      cidade: "Cidade Modelo",
      uf: "PI",
    });
  });
  it("não escolhe entre duas declarações nem dois endereços sem destinatário identificado", () => {
    expect(
      interpretarComprovante(
        "Meu endereço é na Rua Exemplo, 1, CEP 64.000-123. Meu endereço é na Rua Modelo, 2, CEP 64.000-456.",
      ).dados,
    ).toEqual({});
    expect(
      interpretarComprovante("Rua Exemplo, 1, CEP 64.000-123\nRua Modelo, 2, CEP 64.000-456").dados,
    ).toEqual({});
  });
});
