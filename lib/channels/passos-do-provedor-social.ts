// Mora na fronteira de canais: os links e o nome do provedor social são
// dele, e só `lib/channels/` pode nomeá-lo (doutrina restricao-de-canal).
/**
 * Passo a passo para quem ainda não tem a chave. A ORDEM importa: a chave só
 * serve depois de a conta existir e de as redes estarem sincronizadas nela.
 * Só `signup` e `dashboard/api-keys` foram confirmados na documentação do
 * Zernio; o passo 2 abre o painel porque o caminho exato da tela de contas
 * exige login e não pôde ser verificado.
 */
export const PASSOS_DO_PROVEDOR = [
  {
    titulo: "Crie sua conta no Zernio.",
    texto: "É onde suas redes sociais ficam ligadas.",
    link: "Criar conta",
    href: "https://zernio.com/signup",
  },
  {
    titulo: "Sincronize suas redes sociais.",
    texto: "No painel, conecte Instagram, Facebook, LinkedIn e as demais contas.",
    link: "Abrir o painel",
    href: "https://zernio.com/dashboard",
  },
  {
    titulo: "Gere a chave de API.",
    texto: "Clique em Create API key e copie na hora: ela não é mostrada de novo.",
    link: "Ir para as chaves de API",
    href: "https://zernio.com/dashboard/api-keys",
  },
] as const;
