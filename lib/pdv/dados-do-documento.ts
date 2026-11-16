import { documentoValido, formatarDocumento, type ClienteDaNegociacao } from "./regras";

export type DadosLidosDoDocumento = Partial<
  Pick<
    ClienteDaNegociacao,
    | "nome"
    | "documento"
    | "rg"
    | "cnh"
    | "nascimento"
    | "endereco"
    | "numero"
    | "complemento"
    | "bairro"
    | "cep"
    | "cidade"
    | "uf"
  >
>;
export interface LeituraDoDocumento {
  dados: DadosLidosDoDocumento;
  avisos: string[];
}
const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
const rotulo =
  /^(?:[\d. -]+)?(?:NOME|FILIACAO|DATA\b|DOC\b|NASCIMENTO|IDENTIDADE|CPF|REGISTRO|VALIDADE|EMISSAO|ASSINATURA|NATURALIDADE|NACIONALIDADE|CATEGORIA|OBSERVAC)\b/;
const datas = (s: string) =>
  [...s.matchAll(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{4})\b/g)]
    .map((m) => {
      const iso = `${m[3]}-${m[2]}-${m[1]}`;
      const d = new Date(`${iso}T12:00:00Z`);
      return Number(m[3]) >= 1900 &&
        Number.isFinite(d.getTime()) &&
        d.toISOString().slice(0, 10) === iso &&
        iso <= new Date().toISOString().slice(0, 10)
        ? iso
        : null;
    })
    .filter((s): s is string => Boolean(s));

/** Leitura conservadora por rótulos. Não confunde filiação, validade ou emissão com o titular. */
export function interpretarDocumento(texto: string): LeituraDoDocumento {
  const linhas = texto
    .slice(0, 50000)
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/€/g, "E")
        .replace(/^[|\[\]\s]+|[|\[\]\s]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const dados: DadosLidosDoDocumento = {};
  const avisos: string[] = [];
  const cpfs = new Set<string>();
  const nascimentos = new Set<string>();
  const nomes = new Map<string, string>();
  const rgs = new Map<string, string>();
  const cnhs = new Set<string>();
  for (const m of texto.matchAll(/\b\d{3}\.\d{3}\.\d{3}\s*-\s*\d{2}\b/g)) {
    const v = m[0].replace(/\D/g, "");
    if (documentoValido(v)) cpfs.add(v);
  }
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!;
    const k = chave(linha);
    if (/\bCPF\b|C\.P\.F\./.test(k)) {
      for (let j = i; j < Math.min(i + 3, linhas.length); j++) {
        if (j > i && /REGISTRO|VALIDADE/.test(chave(linhas[j]!))) break;
        for (const m of linhas[j]!.matchAll(
          /\b\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*-?\s*\d{2}\b/g,
        )) {
          const cpf = m[0].replace(/\D/g, "");
          if (documentoValido(cpf)) cpfs.add(cpf);
        }
      }
    }
    if (/^[\d\W_Ee]{0,20}NOME\b/u.test(k) && !/NOME (?:DA|DO|DE) (?:MAE|PAI)|FILIACAO/.test(k)) {
      let semRotulo = linha.replace(
        /^[\d\W_Ee]{0,20}nome(?:\s+e\s+sobrenome|\s+completo)?\s*[:\-]?\s*/iu,
        "",
      );
      // CNH recente também imprime o rótulo em inglês/espanhol.
      if (/^\s*\//.test(semRotulo) || /HABILITA[CÇ][AÃ]O/i.test(semRotulo)) semRotulo = "";
      const candidatos = [semRotulo, ...linhas.slice(i + 1, i + 3)];
      for (const candidato of candidatos) {
        // A caixa do campo pode vir como "[ NOME | 15/02/2019 |" ou "[ NOME [ 15/02/2019":
        // corta no próximo delimitador para a data vizinha não invalidar o nome.
        const nome = candidato
          .replace(/^[\s|\[\]]+/, "")
          .split(/[|\[\]]/)[0]!
          .trim();
        if (!nome) continue;
        if (/^(?:NAME|NOMBRE)\b/.test(chave(nome))) continue;
        if (rotulo.test(chave(nome)) || /\d|\//.test(nome)) break;
        if (/^[\p{L}][\p{L} '\-]{2,199}$/u.test(nome) && nome.split(" ").length >= 2) {
          nomes.set(chave(nome), nome);
          break;
        }
      }
    }
    if (/\b(?:DATA[^\d]*NASCIMENTO|DATE OF BIRTH)\b|^[\d\W_]{0,8}NASCIMENTO\b/u.test(k)) {
      const perto = linhas.slice(i, i + 3);
      for (let j = 0; j < perto.length; j++) {
        if (j > 0 && /VALIDADE|EMISSAO|FILIACAO/.test(chave(perto[j]!))) break;
        const ds = datas(perto[j]!);
        if (ds.length) {
          ds.forEach((v) => nascimentos.add(v));
          break;
        }
      }
    }
    if (/IDENTIDADE|REGISTRO GERAL|\bRG\b/.test(k) && !/CPF|FILIACAO/.test(k)) {
      const perto = [
        linha.replace(/^.*?(?:IDENTIDADE|REGISTRO GERAL|\bRG\b)\s*[:\-/]?/i, ""),
        linhas[i + 1] ?? "",
      ];
      for (const valor of perto) {
        const m = valor.match(/\b\d[\d.\-]{3,16}[\dXx]\b/);
        if (m && m[0].replace(/\D/g, "").length >= 5) {
          const rg = m[0].toUpperCase();
          rgs.set(rg.replace(/[^\dX]/g, ""), rg);
          break;
        }
      }
    }
    if ((/REGISTRO/.test(k) && !/GERAL/.test(k)) || /^CNH\s*[:\-]/.test(k)) {
      const perto = [linha, linhas[i + 1] ?? ""];
      for (const valor of perto) {
        const m = valor.match(/\b\d{11}\b/);
        if (m) {
          cnhs.add(m[0]);
          break;
        }
      }
    }
  }
  if (cpfs.size === 1) dados.documento = formatarDocumento([...cpfs][0]);
  else if (cpfs.size > 1)
    return {
      dados: {},
      avisos: [
        "Há mais de um CPF no arquivo. Envie somente o documento do cliente ou preencha manualmente.",
      ],
    };
  if (nomes.size === 1) dados.nome = [...nomes.values()][0];
  else if (nomes.size > 1)
    avisos.push("Não foi possível identificar um único nome do titular. Confira o documento.");
  if (nascimentos.size === 1) dados.nascimento = [...nascimentos][0];
  else if (nascimentos.size > 1)
    avisos.push("Foram encontradas datas de nascimento diferentes. Confira o documento.");
  if (rgs.size === 1) dados.rg = [...rgs.values()][0];
  else if (rgs.size > 1) avisos.push("Há números de RG diferentes. Confira e informe manualmente.");
  if (cnhs.size === 1) dados.cnh = [...cnhs][0];
  else if (cnhs.size > 1)
    avisos.push("Há números de CNH diferentes. Confira e informe manualmente.");
  if (dados.rg?.replace(/\D/g, "") === dados.documento?.replace(/\D/g, "")) delete dados.rg;
  return { dados, avisos };
}

/** Campos já digitados prevalecem, inclusive quando o OCR termina depois da digitação. */
export function preencherComDocumento(
  c: ClienteDaNegociacao,
  dados: DadosLidosDoDocumento,
): ClienteDaNegociacao {
  const proximo = { ...c };
  for (const campo of Object.keys(dados) as (keyof DadosLidosDoDocumento)[]) {
    if (!proximo[campo]?.trim() && dados[campo]) proximo[campo] = dados[campo]!;
  }
  return proximo;
}

/** Endereço do destinatário, por rótulos ou linha postal. Não usa o nome da concessionária. */
export function interpretarComprovante(texto: string): LeituraDoDocumento {
  const original = texto.slice(0, 50000).normalize("NFC");
  // Em declarações, o endereço do emissor no cabeçalho não é o do declarante.
  const declaracoes = [
    ...original.matchAll(
      /\b(?:(?:meu|nosso)\s+endere[cç]o\s+(?:(?:atual\s+)?(?:é|e|fica))\s*(?:(?:na|no|em|à)\s+)?|resido\s+(?:na|no|em|à)\s+|residente(?:\s+e\s+domiciliad[oa])?\s+(?:na|no|em|à)\s+)/giu,
    ),
  ];
  if (declaracoes.length > 1)
    return { dados: {}, avisos: ["Há mais de um endereço declarado. Confira o documento."] };
  const marcador = declaracoes[0];
  const base = marcador
    ? original
        .slice(marcador.index! + marcador[0].length)
        .split(/\n\s*(?:ASSINATURA|VISTO DO|LOCAL E DATA)\b/i)[0]!
        .replace(/\s+/g, " ")
        .trim()
    : original;
  const linhas = base
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const dados: DadosLidosDoDocumento = {};
  const ceps = [
    ...new Set(
      [...base.matchAll(/\b\d{2}\.?\d{3}[- ]?\d{3}\b/g)].map((m) => m[0].replace(/\D/g, "")),
    ),
  ];
  if (ceps.length === 1) dados.cep = ceps[0]!.replace(/(\d{5})(\d{3})/, "$1-$2");
  const pegar = (r: RegExp) => {
    const l = linhas.find((l) => r.test(l));
    return l?.replace(r, "").trim().slice(0, 100);
  };
  dados.bairro = pegar(/^BAIRRO\s*:\s*/i);
  dados.complemento = pegar(/^COMPLEMENTO\s*:\s*/i);
  const ruas = linhas.filter((l) =>
    /^(?:(?:ENDERE[CÇ]O|LOGRADOURO)\s*:\s*)?(?:RUA(?:\s*\/\s*AVENIDA)?|R\.|AVENIDA|AV\.|TRAVESSA|ESTRADA|RODOVIA|ALAMEDA|PRA[CÇ]A)\s/i.test(
      l,
    ),
  );
  if (ruas.length === 1) {
    const rua = ruas[0]!
      .replace(/^(ENDERE[CÇ]O|LOGRADOURO)\s*:\s*/i, "")
      .replace(/^RUA\s*\/\s*AVENIDA\s+/i, "");
    const m = rua.match(/^(.+?)(?:,\s*|\s+(?:N[º°.]?\s*)?)(\d+[A-Z]?|S\/N)(?:\s*[-,]\s*(.*))?$/i);
    if (m) {
      dados.endereco = m[1]?.trim();
      dados.numero = m[2];
      if (m[3] && !dados.complemento) {
        const complemento = m[3]
          .split(/\b(?:CEP|BAIRRO|(?:NA\s+)?CIDADE|MUNIC[IÍ]PIO)\b/i)[0]!
          .replace(/[,\s]+$/g, "");
        if (complemento) dados.complemento = complemento;
      }
    } else dados.endereco = rua.slice(0, 200);
  }
  const bairroInline = base.match(
    /\bbairro\s*[:\-]?\s+(.+?)(?=\s+(?:na\s+)?(?:cidade|munic[ií]pio)\b|,\s*(?:CEP|UF)\b|$)/iu,
  );
  if (bairroInline)
    dados.bairro = bairroInline[1]!
      .trim()
      .replace(/[,;.]$/u, "")
      .slice(0, 100);
  const cidadeInline = base.match(
    /\b(?:cidade|munic[ií]pio)\s+de\s+([\p{L}][\p{L} .'-]+?)\s*[-/]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/iu,
  );
  if (cidadeInline) {
    dados.cidade = cidadeInline[1]!.trim();
    dados.uf = cidadeInline[2]!.toUpperCase();
  }
  const cidades = linhas
    .map((l) =>
      l.match(
        /^(?:CIDADE\s*:\s*)?([\p{L}][\p{L} .'-]+)\s*[-/]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?:\s+CEP.*)?$/u,
      ),
    )
    .filter((m) => m !== null);
  if (cidades.length === 1) {
    dados.cidade = cidades[0]![1]?.trim();
    dados.uf = cidades[0]![2];
  }
  const cidade = pegar(/^CIDADE\s*:\s*/i);
  if (cidade && !dados.cidade) dados.cidade = cidade;
  const uf = pegar(/^UF\s*:\s*/i);
  if (uf && /^[A-Z]{2}$/.test(uf)) dados.uf = uf;
  for (const k of Object.keys(dados) as (keyof DadosLidosDoDocumento)[])
    if (!dados[k]) delete dados[k];
  return {
    dados: ceps.length > 1 || ruas.length > 1 ? {} : dados,
    avisos:
      ceps.length > 1 || ruas.length > 1
        ? ["Há mais de um endereço no arquivo. Confira os dados."]
        : [],
  };
}

/** Nome com palavra curta fora das partículas comuns: típico de letras perdidas pelo OCR ("EI EL"). */
export function nomeSuspeito(nome?: string): boolean {
  if (!nome) return false;
  return nome
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((p) => p.length <= 2 && !["DE", "DA", "DO", "DI", "DU", "E"].includes(p));
}

/** Zona mecânica da CNH-e: só utiliza nome quando registro e nascimento coincidem. */
export function nomeDaZonaMecanica(
  texto: string,
  dados: DadosLidosDoDocumento,
): string | undefined {
  if (!dados.cnh || !dados.nascimento) return;
  const linhas = chave(texto)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s/g, "").replace(/^[|\[\]]+|[|\[\]]+$/g, ""))
    .filter(Boolean);
  // Não inventa números: compara os dígitos legíveis com campos já lidos na frente.
  // Letras confundidas pelo OCR nos trechos numéricos só deixam posições incertas.
  const corresponde = (lido: string, esperado: string, divergencias = 0) =>
    lido.length === esperado.length &&
    [...lido].every((c) => /[0-9OQDILZSGBRT]/.test(c)) &&
    [...lido].filter((c, i) => /\d/.test(c) && c !== esperado[i]).length <= divergencias &&
    [...lido].filter((c) => /\d/.test(c)).length >= Math.max(3, esperado.length - 3);
  const nomes = new Set<string>();
  for (let i = 0; i < linhas.length - 2; i++) {
    const registro = linhas[i]!.match(/^[I1]<BRA([A-Z0-9]{9})[<A-Z0-9]+$/);
    if (!registro) continue;
    const nascimento = dados.nascimento.slice(2).replace(/-/g, "");
    if (
      !corresponde(linhas[i + 1]!.slice(0, 6), nascimento) ||
      !/^[A-Z0-9]{7}[MF<]/.test(linhas[i + 1]!)
    )
      continue;
    const linha = linhas[i + 2]!;
    if (!/^[A-Z]+(?:<{1,2}[A-Z]+)+<*$/.test(linha)) continue;
    const nome = linha.split("<").filter(Boolean).join(" ");
    const registroConfere = corresponde(registro[1]!, dados.cnh.slice(0, 9));
    // Se houve um dígito divergente no código, exige também confirmação pelo nome
    // lido na frente: mesmos termos, permitindo só uma letra omitida pelo OCR.
    const frente = chave(dados.nome ?? "")
        .split(" ")
        .filter(Boolean),
      mecanico = nome.split(" ");
    let omitidas = 0;
    const nomeConfere =
      frente.length >= 3 &&
      frente.length === mecanico.length &&
      frente.every((palavra, j) => {
        const completa = mecanico[j]!;
        if (palavra === completa) return true;
        if (completa.length !== palavra.length + 1) return false;
        const bate = [...completa].some(
          (_, k) => completa.slice(0, k) + completa.slice(k + 1) === palavra,
        );
        if (bate) omitidas++;
        return bate;
      }) &&
      omitidas <= 1;
    if (!registroConfere && !(nomeConfere && corresponde(registro[1]!, dados.cnh.slice(0, 9), 1)))
      continue;
    if (nome.length <= 200) nomes.add(nome);
  }
  return nomes.size === 1 ? [...nomes][0] : undefined;
}
