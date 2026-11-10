/**
 * Categorias de veículo. A tabela FIPE não traz categoria, então o sistema
 * sugere pela FAMÍLIA do modelo (primeira palavra, ou as duas primeiras em
 * "Grand Vitara", "Land Cruiser"…). Quem cadastra sempre pode trocar; quando o
 * modelo não está no dicionário, a escolha é obrigatória.
 * A lista abaixo é só o ponto de partida: cada loja acrescenta as suas
 * (tabela `veiculo_categorias`).
 */
export const CATEGORIAS_PADRAO = [
  "Hatch",
  "Sedã",
  "SUV",
  "Picape",
  "Utilitário",
  "Van",
  "Minivan",
  "Perua",
  "Esportivo",
  "Conversível",
  "Elétrico",
] as const;

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Família do modelo → categoria. Chaves sem acento, minúsculas. */
const POR_FAMILIA: Record<string, string> = {};
const registrar = (categoria: string, familias: string) => {
  for (const f of familias.split(",")) POR_FAMILIA[semAcento(f)] = categoria;
};

registrar("Hatch", "gol,uno,palio,mobi,argo,onix,celta,corsa,fox,up,polo,golf,fit,hb20,ka,fiesta,march,sandero,clio,kwid,208,206,207,c3,picanto,agile,punto,bravo,stilo,fusca,yaris,sonic,i30,twingo,swift,etios,city hatch,logan hatch");
registrar("Sedã", "virtus,voyage,versa,logan,prisma,cobalt,cruze,sentra,corolla,civic,city,accord,jetta,passat,fusion,fluence,siena,grand siena,linea,cronos,hb20s,lancer,elantra,sonata,azera,cerato,optima,a4,a6,serie 3,serie 5,classe c,classe e,megane,408,camry,altima,kadett,vectra,astra,omega,monza,chevette,escort,tempra,santana,tiida,onix plus,focus");
registrar("SUV", "creta,tracker,compass,renegade,commander,kicks,hr v,hrv,wr v,wrv,cr v,crv,t cross,nivus,taos,tiguan,touareg,q3,q5,q7,x1,x2,x3,x4,x5,x6,glc,gla,gle,ecosport,territory,bronco,edge,explorer,escape,duster,captur,kardian,arkana,koleos,tiggo,ix35,tucson,santa fe,kona,venue,sportage,sorento,seltos,stonic,niro,asx,outlander,eclipse cross,pajero,pajero sport,pajero tr4,tr4,rav4,sw4,land cruiser,c4 cactus,2008,3008,5008,xc40,xc60,xc90,range rover,evoque,velar,discovery,defender,freelander,cayenne,macan,jimny,grand vitara,vitara,s cross,sx4,x trail,murano,pathfinder,qashqai,juke,magnite,cx 3,cx 5,cx 30,cx 9,wrangler,grand cherokee,cherokee,haval h6,jolion,omoda,trailblazer,captiva,equinox,blazer,trax,rexton,korando,atto 3,song plus");
registrar("Picape", "strada,saveiro,montana,toro,oroch,s10,hilux,ranger,frontier,amarok,l200,l200 triton,triton,d20,silverado,f 250,f250,f 1000,f1000,f 100,ram,rampage,dakota,courier,pampa,hoggar,maverick,tornado,titano,colorado,c10,a10,d10,bandeirante,poer");
registrar("Utilitário", "fiorino,kangoo,partner,berlingo,doblo,combo,kombi,express,hd 80,accelo,delivery,bongo,porter,k2500,towner,topic");
registrar("Van", "sprinter,ducato,boxer,jumper,master,transit,vito,trafic,expert,scudo,hiace,h1,starex,carnival,sedona,multivan,caravelle,transporter,crafter");
registrar("Minivan", "spin,zafira,meriva,idea,livina,grand livina,grand c4 picasso,c4 picasso,picasso,scenic,grand scenic,sharan,touran,caddy,quantum,sienna,odyssey,freed,mobilio,qubo,nemo,rifter");
registrar("Perua", "palio weekend,weekend,parati,golf variant,variant,a4 avant,avant,touring,v40,v60,v70,v90,spacefox,crossfox,308 sw,407 sw,206 sw,207 sw,fielder,levorg,outback,forester");
registrar("Esportivo", "mustang,camaro,corvette,challenger,charger,gr86,brz,supra,z4,tt,r8,rs3,rs4,rs5,rs6,gtr,370z,350z,nsx,s2000,mx 5,miata,boxster,cayman,911,718,panamera,huracan,aventador,urus,gallardo,458,488,f8,812,ferrari,lamborghini,mclaren,wrx,sti,celica,rx 7,rx 8,veloster,golf gti,golf r,polo gti,fiesta st,focus st,focus rs,cooper s,abarth,puma,sp2");
registrar("Conversível", "cabriolet,eos,slk,sl 500,roadster");
registrar("Elétrico", "leaf,bolt,i3,i4,ix3,eqa,eqb,eqc,eqe,eqs,ioniq,ioniq 5,ioniq 6,model 3,model s,model x,model y,id 3,id 4,e tron,e tron gt,taycan,mach e,mustang mach e,e up,zoe,dolphin,dolphin mini,dolphin plus,seal,yuan plus,atto 3 ev,e6,mg4,zs ev,spring,polestar 2,cybertruck");

/** Texto digitado → categoria, ou null quando o dicionário não conhece. */
export function sugerirCategoria(marca: string | null | undefined, modelo: string | null | undefined): string | null {
  const palavras = semAcento(modelo ?? "").split(" ").filter(Boolean);
  if (palavras.length === 0) return null;
  // Mais específico primeiro: as 3 primeiras palavras, depois 2, depois 1, na ordem do texto.
  for (let inicio = 0; inicio < Math.min(palavras.length, 2); inicio++) {
    for (let tam = Math.min(3, palavras.length - inicio); tam >= 1; tam--) {
      const chave = palavras.slice(inicio, inicio + tam).join(" ");
      const achou = POR_FAMILIA[chave];
      if (achou) return achou;
    }
  }
  void marca;
  return null;
}

/** Une padrão + categorias da loja, sem repetir (compara sem acento/caixa). */
export function listaDeCategorias(daLoja: readonly string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const nome of [...CATEGORIAS_PADRAO, ...daLoja]) {
    const t = nome.trim();
    const chave = semAcento(t);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(t);
  }
  return saida;
}

export const mesmaCategoria = (a: string, b: string) => semAcento(a) === semAcento(b);
