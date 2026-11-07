import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { requireAuth } from "@/lib/auth/server";

/**
 * PDV em TELA CHEIA: sem sidebar, sem top bar do app. Só a sessão e o idioma;
 * a tela monta o próprio cabeçalho (com o "Voltar" para o app).
 */
export default async function PdvLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return (
    <IdiomaProvider locale={user.idioma}>
      <div className="h-dvh w-full overflow-hidden bg-background text-foreground">{children}</div>
    </IdiomaProvider>
  );
}
