---
impacto: capacidade_nova
secao: adicionado
titulo: PDV de veículos em tela cheia, com venda, compra, troca e contrato
---

Novo grupo Ações rápidas, no topo do menu, com o atalho Nova venda (o mesmo PDV). Novo menu Vendas, logo abaixo, com o item PDV, que abre numa aba própria em tela cheia: o vendedor escolhe ou cadastra o cliente, seleciona o veículo do estoque, lança a troca e detalha o pagamento (PIX, cartão, dinheiro, financiamento, parcelas diretas). Também registra a compra de veículo de um cliente e gera um contrato em PDF. A migration cria a tabela de negociações com isolamento por organização. Também entra o menu Vendas › Histórico de Vendas: todas as vendas e compras do PDV com totais, busca, filtros, ordenação, exportação em CSV e acesso ao contrato.

Novo grupo de menu "Contatos" com Clientes (lista dos clientes cadastrados, ficha com o histórico de compras e vendas do PDV de cada um, vazio quando não fez nada) e Adicionar Cliente (cadastro em tela cheia, gravado como contato do tipo cliente).
A lista **Clientes** mostra só contatos cadastrados manualmente (`source=manual`); contatos criados por WhatsApp/integrações não aparecem.
