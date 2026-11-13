"use client";
import { CartaoDocumentoCliente } from "./cartao-documento-cliente";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { orgDaAba } from "@/lib/auth/org-da-aba";
import { HEADER_ORG_DA_ABA } from "@/lib/auth/org-da-aba";
export type DocumentoSalvo = { id: string; kind: string; file_name: string };
export async function salvarArquivoDoCliente(
  id: string,
  file: File,
  kind: string,
): Promise<DocumentoSalvo> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  const org = orgDaAba();
  const response = await fetch(`/api/v1/contacts/${id}/documents`, {
    method: "POST",
    body,
    headers: org?.orgId ? { [HEADER_ORG_DA_ABA]: org.orgId } : {},
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? "Falha ao salvar documento. Tente novamente.");
  return result.data.file;
}
export function DocumentosDoCliente({
  contactId,
  arquivos,
  onCarregados,
}: {
  contactId?: string | null;
  arquivos: DocumentoSalvo[];
  onCarregados: (v: DocumentoSalvo[]) => void;
}) {
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (!contactId) return;
    let ativo = true;
    apiClient
      .get<{ data: { files: DocumentoSalvo[] } }>(`/api/v1/contacts/${contactId}/documents`)
      .then((r) => {
        if (ativo) onCarregados(r.data.files);
      })
      .catch(() => {
        if (ativo) setErro("Não foi possível carregar os documentos.");
      });
    return () => {
      ativo = false;
    };
  }, [contactId, onCarregados]);
  return (
    <>
      {erro && <p role="alert">{erro}</p>}
      {arquivos.length > 0 && (
        <ul className="grid min-w-0 gap-2" aria-label="Documentos salvos do cliente">
          {arquivos.map((d) => (
            <CartaoDocumentoCliente
              key={d.id}
              nome={d.file_name}
              tipo={d.kind}
              href={`/api/v1/contacts/${contactId}/documents/${d.id}`}
            />
          ))}
        </ul>
      )}
    </>
  );
}
