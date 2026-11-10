"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { Gear, Plus, Stack } from "@/lib/ui/icons";
import { API, CHAVE, type EstadoDosStories, type StoryItem } from "./tipos";
import { KanbanSemanal } from "./KanbanSemanal";
import { CalendarioMensal } from "./CalendarioMensal";
import { JanelasView } from "./JanelasView";
import { NovoStoryDialog } from "./NovoStoryDialog";
import { LoteDialog } from "./LoteDialog";
import { JanelaDialog } from "./JanelaDialog";
import { DetalheDialog } from "./DetalheDialog";

const CHAVE_OCULTAR = "stories_hide_cancelled";

export function StoriesClient() {
  const t = useT();
  const query = useQuery({
    queryKey: CHAVE,
    queryFn: async () => (await apiClient.get<{ data: EstadoDosStories }>(API)).data,
  });
  const estado = query.data;
  const [ocultarCancelados, setOcultar] = useState(false);
  useEffect(() => setOcultar(localStorage.getItem(CHAVE_OCULTAR) === "1"), []);
  function alternarCancelados() {
    setOcultar((v) => {
      localStorage.setItem(CHAVE_OCULTAR, v ? "0" : "1");
      return !v;
    });
  }

  const [novo, setNovo] = useState<{ dia: Date; hora?: string } | null>(null);
  const [lote, setLote] = useState(false);
  const [janelasAberto, setJanelasAberto] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const itens = useMemo(
    () => (estado?.items ?? []).filter((s) => !(ocultarCancelados && s.status === "cancelada")),
    [estado?.items, ocultarCancelados],
  );
  const detalhe: StoryItem | null = estado?.items.find((s) => s.id === detalheId) ?? null;

  if (query.isLoading) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  if (query.isError || !estado)
    return <p className="text-sm text-error">{t("Não foi possível carregar os Stories.")}</p>;
  if (!estado.configured)
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        {t("Ative as redes sociais e conecte uma conta do Instagram para agendar Stories.")}
      </Card>
    );
  const semConta = estado.accounts.length === 0;
  const comum = { estado, itens, onAbrir: setDetalheId };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {semConta && (
        <Card className="p-4 text-sm text-muted-foreground">
          {t("Nenhuma conta do Instagram conectada neste perfil.")}
        </Card>
      )}
      <Tabs defaultValue="kanban" className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="kanban">{t("Kanban")}</TabsTrigger>
            <TabsTrigger value="calendario">{t("Calendário")}</TabsTrigger>
            <TabsTrigger value="janelas">{t("Janelas")}</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={alternarCancelados}>
              {ocultarCancelados ? t("Mostrar cancelados") : t("Ocultar cancelados")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setJanelasAberto(true)}>
              <Gear /> {t("Configurar janelas")}
            </Button>
            <Button variant="outline" size="sm" disabled={semConta} onClick={() => setLote(true)}>
              <Stack /> {t("Agendar em lote")}
            </Button>
            <Button size="sm" disabled={semConta} onClick={() => setNovo({ dia: new Date() })}>
              <Plus /> {t("Novo Story")}
            </Button>
          </div>
        </div>
        <TabsContent value="kanban" className="min-h-0 flex-1">
          <KanbanSemanal {...comum} onNovo={(dia) => setNovo({ dia })} podeCriar={!semConta} />
        </TabsContent>
        <TabsContent value="calendario" className="min-h-0 flex-1">
          <CalendarioMensal {...comum} onNovo={(dia) => setNovo({ dia })} podeCriar={!semConta} />
        </TabsContent>
        <TabsContent value="janelas" className="min-h-0 flex-1">
          <JanelasView {...comum} onNovo={(dia, hora) => setNovo({ dia, hora })} podeCriar={!semConta} />
        </TabsContent>
      </Tabs>

      {novo && <NovoStoryDialog estado={estado} dia={novo.dia} hora={novo.hora} onFechar={() => setNovo(null)} />}
      {lote && <LoteDialog estado={estado} onFechar={() => setLote(false)} />}
      {janelasAberto && <JanelaDialog janelas={estado.janelas} onFechar={() => setJanelasAberto(false)} />}
      {detalhe && <DetalheDialog estado={estado} story={detalhe} onFechar={() => setDetalheId(null)} />}
    </div>
  );
}
