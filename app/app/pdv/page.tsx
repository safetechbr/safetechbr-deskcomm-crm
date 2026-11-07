import { redirect } from "next/navigation";

/**
 * A porta do PDV na navegação. O PDV em si é tela cheia, dedicada, FORA do
 * shell do app (sem menu lateral) e mora em `/pdv` — o menu abre esta rota
 * numa aba nova e ela leva para lá.
 */
export default function PdvPorta() {
  redirect("/pdv");
}
