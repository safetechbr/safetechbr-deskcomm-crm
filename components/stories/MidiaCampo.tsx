"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { UploadSimple } from "@/lib/ui/icons";
import { toast } from "sonner";
import { enviarMidiaDeStory } from "./upload";
import type { Midia } from "./tipos";

export function MidiaCampo({ midia, onChange, multiplo, onVarias }: {
  midia: Midia | null;
  onChange?: (m: Midia) => void;
  multiplo?: boolean;
  onVarias?: (m: Midia[]) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  async function escolher(files: FileList | null) {
    if (!files?.length) return;
    setEnviando(true);
    try {
      const subidas: Midia[] = [];
      for (const f of Array.from(files)) subidas.push(await enviarMidiaDeStory(f));
      if (multiplo) onVarias?.(subidas);
      else onChange?.(subidas[0]!);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Falha ao enviar o arquivo."));
    } finally {
      setEnviando(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div className="flex items-center gap-3">
      {midia &&
        (midia.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={midia.url} alt="" className="h-20 w-12 rounded object-cover" />
        ) : (
          <video src={midia.url} className="h-20 w-12 rounded object-cover" muted />
        ))}
      <input ref={ref} type="file" hidden multiple={multiplo} accept="image/jpeg,image/png,video/mp4,video/quicktime" onChange={(e) => escolher(e.target.files)} />
      <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => ref.current?.click()}>
        <UploadSimple /> {enviando ? t("Enviando…") : multiplo ? t("Escolher arquivos") : midia ? t("Trocar arquivo") : t("Escolher arquivo")}
      </Button>
    </div>
  );
}
