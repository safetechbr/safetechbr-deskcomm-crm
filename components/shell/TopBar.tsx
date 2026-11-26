"use client";
import { AlertsBell } from "./AlertsBell";
import { AvisoDePropostaEmDestaque } from "./AvisoDePropostaEmDestaque";
import { MobileSidebar } from "./MobileSidebar";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";

export function TopBar({ oculta = false }: { oculta?: boolean }) {
  // Ocultar o cabeçalho mantém o atalho da busca e os avisos em portal.
  return (
    <header className="app-topbar sticky top-[var(--faixas-de-cima,0px)] z-20 flex h-16 items-center justify-between gap-2 bg-background/80 px-3 backdrop-blur-md backdrop-saturate-150 md:gap-4 md:px-6" hidden={oculta}>
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
        <TenantSwitcher />
      </div>
      <div className="flex min-w-0 flex-1 justify-center md:max-w-lg">
        <SearchTrigger />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <AlertsBell />
        <AvisoDePropostaEmDestaque />
        <UserMenu />
      </div>
    </header>
  );
}
