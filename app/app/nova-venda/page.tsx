import { redirect } from "next/navigation";

/**
 * Porta "Nova venda" do grupo Ações rápidas. É o mesmo PDV do grupo Vendas, só
 * que com nome de ação; a tela cheia mora em `/pdv` e esta rota leva para lá.
 */
export default function NovaVendaPorta() {
  redirect("/pdv");
}
