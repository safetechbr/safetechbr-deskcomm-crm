"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";

type Tipo = "feed" | "carrossel" | "reel";
type Conta = { id: string; platform: string; name: string };
type Item = {
  id: string;
  tipo: Tipo;
  legenda: string;
  contas: { id: string; platform: string }[];
  agendada_para: string | null;
  status: "agendada" | "publicando" | "publicada" | "falhou" | "cancelada";
  erro: string | null;
  aguardando_motivo: string | null;
};
type Seguranca = {
  limite_diario: number;
  intervalo_min_s: number;
  intervalo_max_s: number;
  lote: number;
  pausa_lote_s: number;
};
type State = { configured: boolean; accounts: Conta[]; items: Item[]; seguranca: Seguranca };

const PRESETS: Record<string, { label: string; valores: Seguranca }> = {
  conservador: {
    label: "Conservador",
    valores: {
      limite_diario: 10,
      intervalo_min_s: 60,
      intervalo_max_s: 180,
      lote: 3,
      pausa_lote_s: 600,
    },
  },
  padrao: {
    label: "Padrão",
    valores: {
      limite_diario: 20,
      intervalo_min_s: 30,
      intervalo_max_s: 120,
      lote: 5,
      pausa_lote_s: 300,
    },
  },
  agressivo: {
    label: "Agressivo",
    valores: {
      limite_diario: 50,
      intervalo_min_s: 15,
      intervalo_max_s: 60,
      lote: 10,
      pausa_lote_s: 120,
    },
  },
};
const CAMPOS: { id: keyof Seguranca; label: string }[] = [
  { id: "limite_diario", label: "Postagens por dia (por conta)" },
  { id: "intervalo_min_s", label: "Intervalo mínimo (segundos)" },
  { id: "intervalo_max_s", label: "Intervalo máximo (segundos)" },
  { id: "lote", label: "Postagens por lote" },
  { id: "pausa_lote_s", label: "Pausa entre lotes (segundos)" },
];
const STATUS: Record<Item["status"], string> = {
  agendada: "Agendada",
  publicando: "Publicando",
  publicada: "Publicada",
  falhou: "Falhou",
  cancelada: "Cancelada",
};
type Midia = { type: "image" | "video"; url: string };

const TIPOS: { id: Tipo; label: string; dica: string }[] = [
  { id: "feed", label: "Feed", dica: "Uma imagem ou um vídeo." },
  { id: "carrossel", label: "Carrossel", dica: "De 2 a 20 imagens ou vídeos (só Instagram)." },
  { id: "reel", label: "Reels", dica: "Um vídeo vertical (só Instagram)." },
];
const ACCEPT = "image/jpeg,image/png,video/mp4,video/quicktime";

export function PublicacoesClient() {
  const t = useT();
  const query = useQuery({
    queryKey: ["social-publicacoes"],
    queryFn: async () =>
      (await apiClient.get<{ data: State }>("/api/v1/channels/social/publicacoes")).data,
  });
  const state = query.data;
  const [tipo, setTipo] = useState<Tipo>("feed");
  const [legenda, setLegenda] = useState("");
  const [quando, setQuando] = useState("");
  const [contas, setContas] = useState<string[]>([]);
  const [midias, setMidias] = useState<Midia[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [seg, setSeg] = useState<Seguranca | null>(null);
  useEffect(() => {
    if (state?.seguranca) setSeg(state.seguranca);
  }, [state?.seguranca]);

  async function salvarSeguranca() {
    if (!seg) return;
    setBusy("seguranca");
    setError(null);
    try {
      await apiClient.post("/api/v1/channels/social/publicacoes", {
        action: "seguranca",
        seguranca: seg,
      });
      toast.success(t("Regras de segurança salvas."));
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Não foi possível salvar."));
    } finally {
      setBusy(null);
    }
  }

  const elegiveis = (state?.accounts ?? []).filter(
    (c) => tipo === "feed" || c.platform === "instagram",
  );

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    setError(null);
    try {
      const novas: Midia[] = [];
      for (const file of Array.from(files)) {
        const { data } = await apiClient.post<{ data: { upload_url: string; public_url: string } }>(
          "/api/v1/channels/social/publicacoes",
          { action: "presign", filename: file.name, content_type: file.type, size: file.size },
        );
        const put = await fetch(data.upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error(t("Não foi possível enviar o arquivo."));
        novas.push({
          type: file.type.startsWith("video/") ? "video" : "image",
          url: data.public_url,
        });
      }
      setMidias((atual) => [...atual, ...novas]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Não foi possível enviar o arquivo."));
    } finally {
      setBusy(null);
    }
  }

  async function agendar() {
    setBusy("create");
    setError(null);
    try {
      await apiClient.post("/api/v1/channels/social/publicacoes", {
        action: "create",
        publicacao: {
          tipo,
          legenda,
          midias,
          account_ids: contas,
          agendada_para: new Date(quando).toISOString(),
          fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
        },
      });
      toast.success(t("Publicação agendada."));
      setLegenda("");
      setMidias([]);
      setQuando("");
      setContas([]);
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Não foi possível agendar."));
    } finally {
      setBusy(null);
    }
  }

  async function cancelar(id: string) {
    setBusy(id);
    setError(null);
    try {
      await apiClient.post("/api/v1/channels/social/publicacoes", { action: "cancel", id });
      toast.success(t("Publicação cancelada."));
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Não foi possível cancelar."));
    } finally {
      setBusy(null);
    }
  }

  if (query.isLoading) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  if (state && !state.configured)
    return (
      <Card className="space-y-2 p-4 text-sm">
        <p>{t("Ative as redes sociais e conecte uma conta para publicar.")}</p>
        <Button asChild variant="outline">
          <Link href="/app/connections">{t("Ir para Conexões")}</Link>
        </Button>
      </Card>
    );

  const pronto =
    midias.length > 0 &&
    contas.length > 0 &&
    !!quando &&
    !busy &&
    new Date(quando).getTime() > Date.now();
  const porDia = new Map<string, Item[]>();
  for (const item of state?.items ?? []) {
    const dia = item.agendada_para
      ? new Date(item.agendada_para).toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
        })
      : t("Sem data");
    porDia.set(dia, [...(porDia.get(dia) ?? []), item]);
  }

  return (
    <div className="space-y-6">
      {seg && (
        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">{t("Regras de segurança")}</h2>
            <p className="text-xs text-muted-foreground">
              {t(
                "O M Auto segura cada postagem e só a envia quando estas regras permitem, para proteger a conta contra bloqueio.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([id, p]) => (
              <Button key={id} size="sm" variant="outline" onClick={() => setSeg(p.valores)}>
                {t(p.label)}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CAMPOS.map((c) => (
              <div key={c.id} className="space-y-1">
                <Label htmlFor={`seg-${c.id}`} className="text-xs">
                  {t(c.label)}
                </Label>
                <Input
                  id={`seg-${c.id}`}
                  type="number"
                  min={1}
                  value={seg[c.id]}
                  onChange={(e) => setSeg({ ...seg, [c.id]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <Button size="sm" disabled={!!busy} onClick={() => void salvarSeguranca()}>
            {t("Salvar regras")}
          </Button>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <Card className="space-y-4 p-4">
          <div role="tablist" className="flex flex-wrap gap-2">
            {TIPOS.map((x) => (
              <Button
                key={x.id}
                role="tab"
                aria-selected={tipo === x.id}
                size="sm"
                variant={tipo === x.id ? "default" : "outline"}
                onClick={() => {
                  setTipo(x.id);
                  setMidias([]);
                  setContas([]);
                }}
              >
                {t(x.label)}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(TIPOS.find((x) => x.id === tipo)!.dica)}
          </p>
          <div className="space-y-2">
            <Label htmlFor="pub-arquivos">{t("Mídia")}</Label>
            <Input
              id="pub-arquivos"
              type="file"
              accept={ACCEPT}
              multiple={tipo === "carrossel"}
              disabled={!!busy}
              onChange={(e) => {
                void enviar(e.target.files);
                e.target.value = "";
              }}
            />
            {midias.length > 0 && (
              <ul className="space-y-1 text-xs">
                {midias.map((m, i) => (
                  <li key={m.url} className="flex items-center justify-between gap-2">
                    <span>
                      {m.type === "video" ? t("Vídeo") : t("Imagem")} {i + 1}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMidias(midias.filter((x) => x.url !== m.url))}
                    >
                      {t("Remover")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pub-legenda">{t("Legenda")}</Label>
            <Textarea
              id="pub-legenda"
              value={legenda}
              maxLength={2200}
              rows={4}
              onChange={(e) => setLegenda(e.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("Contas")}</legend>
            {elegiveis.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Nenhuma conta compatível conectada.")}
              </p>
            )}
            {elegiveis.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={contas.includes(c.id)}
                  onChange={(e) =>
                    setContas(
                      e.target.checked ? [...contas, c.id] : contas.filter((x) => x !== c.id),
                    )
                  }
                />
                {c.name} <Badge variant="outline">{c.platform}</Badge>
              </label>
            ))}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="pub-quando">{t("Data e hora")}</Label>
            <Input
              id="pub-quando"
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={!pronto} onClick={() => void agendar()}>
            {t("Agendar")}
          </Button>
        </Card>
        <div className="space-y-4">
          {porDia.size === 0 && (
            <p className="text-sm text-muted-foreground">{t("Nenhuma publicação agendada.")}</p>
          )}
          {[...porDia.entries()].map(([dia, itens]) => (
            <section key={dia} className="space-y-2">
              <h3 className="text-sm font-semibold capitalize">{dia}</h3>
              {itens.map((item) => (
                <Card key={item.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{t(TIPOS.find((x) => x.id === item.tipo)?.label ?? item.tipo)}</Badge>
                      <Badge variant="outline">{t(STATUS[item.status] ?? item.status)}</Badge>
                      {item.agendada_para && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.agendada_para).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-muted-foreground">{item.legenda || "—"}</p>
                    {item.status === "agendada" && item.aguardando_motivo && (
                      <p className="text-xs text-muted-foreground">{item.aguardando_motivo}</p>
                    )}
                    {item.erro && <p className="text-xs text-destructive">{item.erro}</p>}
                  </div>
                  {item.status === "agendada" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => void cancelar(item.id)}
                    >
                      {t("Cancelar")}
                    </Button>
                  )}
                </Card>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
