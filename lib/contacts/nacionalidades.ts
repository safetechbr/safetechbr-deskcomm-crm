/** Catálogo local de gentílicos; nenhuma nacionalidade é pré-selecionada. */
export const NACIONALIDADES =
  `Afegão|África do Sul:Sul-africano|Albanês|Alemão|Andorrano|Angolano|Antiguano|Argelino|Argentino|Armênio|Australiano|Austríaco|Azerbaijano|Bahamense|Bangladês|Barbadiano|Bareinita|Belga|Belizenho|Beninense|Bielorrusso|Birmanês|Boliviano|Bósnio|Botsuanês|Brasileiro|Britânico|Bruneano|Búlgaro|Burquinense|Burundês|Butanês|Cabo-verdiano|Camaronês|Cambojano|Canadense|Catariano|Cazaque|Centro-africano|Chadiano|Chileno|Chinês|Cingapuriano|Cipriota|Colombiano|Comorense|Congolês|Costa-riquenho|Croata|Cubano|Dinamarquês|Djibutiano|Dominiquense|Dominicano|Egípcio|Emiradense|Equatoriano|Eritreu|Eslovaco|Esloveno|Espanhol|Estadunidense|Estoniano|Esuatiniano|Etíope|Fijiano|Filipino|Finlandês|Francês|Gabonês|Gambiano|Ganês|Georgiano|Granadino|Grego|Guatemalteco|Guianense|Guineense|Guiné-Bissau:Guineense-bissauense|Guiné Equatorial:Equato-guineense|Haitiano|Holandês|Neerlandês|Inglês|Escocês|Galês|Norte-irlandês|Hondurenho|Húngaro|Iemenita|Indiano|Indonésio|Iraniano|Iraquiano|Irlandês|Islandês|Israelense|Italiano|Ivoiriense|Jamaicano|Japonês|Jordaniano|Kiribatiano|Kuwaitiano|Laosiano|Lesotiano|Letão|Libanês|Liberiano|Líbio|Liechtensteinense|Lituano|Luxemburguês|Macedônio|Madagascar:Malgaxe|Malaio|Malauiano|Maldivo|Maliano|Maltês|Marfinense|Marroquino|Marshallino|Mauriciano|Mauritano|Mexicano|Micronésio|Moçambicano|Moldávio|Monegasco|Mongol|Montenegrino|Namibiano|Nauruano|Nepalês|Nicaraguense|Nigeriano|Nigerino|Norueguês|Neozelandês|Omanense|Palauano|Palestino|Panamenho|Papuásio|Paquistanês|Paraguaio|Peruano|Polonês|Português|Queniano|Quirguiz|República Democrática do Congo:Congolês (República Democrática do Congo)|Romeno|Ruandês|Russo|Salomonense|Salvadorenho|Samoano|São-cristovense|São-marinense|São-tomense|São-vicentino|Santa-lucense|Saudita|Seichelense|Senegalês|Sérvio|Serra-leonês|Sírio|Somali|Sri-lankês|Sudanês|Sul-sudanês|Sueco|Suíço|Surinamês|Tailandês|Taiwanês|Tajique|Tanzaniano|Timorense|Togolês|Tonganês|Trinitário|Tunisiano|Turcomeno|Turco|Tuvaluano|Ucraniano|Ugandense|Uruguaio|Uzbeque|Vanuatuense|Vaticano|Venezuelano|Vietnamita|Zambiano|Zimbabuano|Norte-coreano|Sul-coreano|Kosovar|Apátrida`
    .split("|")
    .map((v) => {
      const [pais, nome] = v.split(":");
      return { nome: nome ?? pais!, busca: v };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
export function normalizarNacionalidade(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
export function sugerirNacionalidades(busca: string) {
  const termo = normalizarNacionalidade(busca);
  return NACIONALIDADES.filter((n) =>
    normalizarNacionalidade(n.busca).includes(
      termo.length > 4 && termo.endsWith("a") ? termo.slice(0, -1) : termo,
    ),
  );
}
