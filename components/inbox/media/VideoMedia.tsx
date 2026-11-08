"use client";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { MediaUnavailable } from "./MediaUnavailable";
import { mediaSrc } from "./media-utils";
import { proporcaoDaMidia } from "./proporcao-da-midia";

/**
 * Vídeo inline com controles nativos (padrão WhatsApp Web).
 *
 * `src` é a fonte alternativa para mídia de NOTA interna (#1863, F3), que a
 * rota da nota serve; sem ele, o caminho de mensagem de sempre.
 */
export function VideoMedia({ messageId, src }: { messageId: string; src?: string }) {
  const fonte = src ?? mediaSrc(messageId);
  return <VideoProporcional key={fonte} src={fonte} />;
}

function VideoProporcional({ src }: { src: string }) {
  const [dimensoes, setDimensoes] = useState(() => proporcaoDaMidia(0, 0));
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div
      data-testid="video-proporcional"
      style={dimensoes}
      className="relative max-w-full overflow-hidden rounded-lg bg-black/5"
    >
      {failed ? (
        <MediaUnavailable kind="Vídeo" className="h-full w-full" />
      ) : (
        <>
          {!ready && <Skeleton className="absolute inset-0 h-full w-full" />}
          <video
            src={src}
            controls
            preload="metadata"
            playsInline
            onLoadedMetadata={(event) => {
              setDimensoes(
                proporcaoDaMidia(event.currentTarget.videoWidth, event.currentTarget.videoHeight),
              );
              setReady(true);
            }}
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </>
      )}
    </div>
  );
}
