import { apiClient } from "@/lib/api/client";
import { validarArquivoDeStory } from "@/lib/channels/social/stories/regras";
import { API, type Midia } from "./tipos";

/** Duração do vídeo lida no navegador (o servidor não decodifica mídia). */
function duracaoDoVideo(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : undefined);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    v.src = url;
  });
}

/** Valida e envia um arquivo ao armazenamento do provedor. Lança Error com mensagem para o usuário. */
export async function enviarMidiaDeStory(file: File): Promise<Midia> {
  const duracao = file.type.startsWith("video/") ? await duracaoDoVideo(file) : undefined;
  const erro = validarArquivoDeStory(file, duracao);
  if (erro) throw new Error(erro);
  const { data } = await apiClient.post<{ data: { upload_url: string; public_url: string } }>(API, {
    action: "presign",
    filename: file.name,
    content_type: file.type,
    size: file.size,
  });
  const put = await fetch(data.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error("Não foi possível enviar o arquivo.");
  return { type: file.type.startsWith("video/") ? "video" : "image", url: data.public_url };
}
