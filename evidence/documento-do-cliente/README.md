# Verificação local — documentos do cliente

12/11/2026, PDV autenticado no localhost. Somente documentos fictícios; nenhuma gravação de cliente nesta rodada.

- `cnh-preenchida.png`: foto PNG leu nome, CPF, nascimento, RG e CNH.
- `rg-pdf-preenchido.png`: PDF digital leu nome, CPF, nascimento e RG.
- `pdf-escaneado.png`: PDF escaneado leu CPF, nascimento, RG e CNH; o nome previamente digitado foi mantido. O leitor tolerou espaço inserido pelo OCR na pontuação do CPF, sem alterar dígitos.
- Fontes reproduzíveis: `tests/fixtures/documentos-clientes/`.

Verificações finais: typecheck, ESLint dos arquivos alterados, formatação e build de produção concluídos com exit 0.

Os oito arquivos de teste relacionados ao cadastro, motor, distribuição, documentação e mapas passaram (391 casos). Cancelamento, timeout, falha e gravação canônica são medidos nos unitários. Remover a proteção de campos preenchidos fez a suíte falhar no caso esperado; a proteção foi restaurada e a seleção passou novamente.

Não mede todos os layouts de documentos reais ou uma instalação Docker fresca. Consultar `docs/features/documento-do-cliente-no-pdv.md` para limites e fluxo de privacidade.


## Persistência e residência — segunda etapa

- Comprovante sintético em PDF preencheu rua, número, bairro, CEP, cidade e UF no localhost.
- Identidade e comprovante foram salvos com o cliente, e reapareceram em Editar cadastro (captura `anexos-armazenados.png`).
- Originais recuperados pelo Storage conferidos byte a byte. Residência SHA256 `c989e078c3939df036300fb813846b25cadfabed2393fc7ac2436ff64d621b7a`; identidade `795f787ca24101ca9040a4e49e9f704b65e95a208105021cb219200c72ed8714`.
- A rota autenticada de abertura respondeu 302. O controle de download do navegador excedeu o tempo da ferramenta; os bytes foram conferidos pelo SDK do Storage.
- `contrato-com-endereco.pdf`: gerado pelo renderizador existente com o cadastro efetivamente salvo. Endereço e RG conferidos no texto e primeira página renderizada. A imagem do comprovante não é inserida automaticamente no contrato.
- Cliente e dois arquivos fictícios foram removidos após a validação. Nenhum dado real foi usado.
- Banco descartável: baseline install/update e quatro testes de RLS/perfis, bucket privado, vínculo cruzado e fila de expurgo passaram. Testes de aplicação incluem falha de upload com repetição sem duplicar cliente e fluxos LGPD.
