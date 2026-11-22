---
impacto: capacidade_nova
secao: adicionado
titulo: Preenchimento do veículo pela placa no PDV e no estoque
---

Ao digitar uma placa válida (formato antigo ou Mercosul) na ficha de veículo da compra ou da troca no PDV, ou no cadastro de veículo do estoque, o sistema consulta a API Placas e preenche marca, modelo, anos e cor, sem sobrescrever o que já foi digitado. A consulta exige a variável `APIPLACAS_TOKEN`; sem ela, o PDV avisa que a consulta não está configurada e o cadastro segue manual. Repetir a mesma placa em 24 horas usa o cache e não gera nova consulta paga.
