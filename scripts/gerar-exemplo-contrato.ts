import { writeFile } from "node:fs/promises";
import { exemploDeContrato } from "../tests/fixtures/negociacao-contrato";
import { renderContratoPdf } from "../lib/pdv/contrato";
async function main() {
  const pdf = await renderContratoPdf({
    negociacao: exemploDeContrato,
    loja: {
      razaoSocial: "IGNORAR DADO ATUAL",
      nomeFantasia: "Atual",
      cnpj: null,
      logoUrl: null,
      cidade: null,
    },
    vendedorNome: "Nome atual não deve substituir fotografia",
  });
  await writeFile("evidence/contrato-modelo/exemplo.pdf", pdf);
}
main();
