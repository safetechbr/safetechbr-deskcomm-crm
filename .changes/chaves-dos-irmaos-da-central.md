---
impacto: nada_mudou
secao: corrigido
titulo: Chaves distintas para a navegação e o funil da central
---

A navegação e o quadro embutido usavam o mesmo ID da organização como chave entre componentes irmãos. Alternar as visões podia repetir a navegação e emitir o erro de chave duplicada. As chaves agora incluem a identidade de cada componente e continuam estáveis dentro da organização.
