"use client";

import { useEffect } from "react";
import { EVENTO_FUNIS_MUDARAM } from "@/hooks/pipelines/useFunisDoMenu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface PrincipalDaCentral {
  pipeline: { id: string; name: string } | null;
  substituido: boolean;
  configurado: boolean;
}
const chave = (orgId: string | null) => ["central-funil-principal", orgId];
const rota = "/api/v1/settings/central";

export function useFunilPrincipalDaCentral(orgId: string | null) {
  const client = useQueryClient();
  useEffect(() => {
    const reler = () => {
      void client.invalidateQueries({ queryKey: chave(orgId) }, { cancelRefetch: false });
    };
    window.addEventListener(EVENTO_FUNIS_MUDARAM, reler);
    return () => window.removeEventListener(EVENTO_FUNIS_MUDARAM, reler);
  }, [client, orgId]);
  return useQuery({
    queryKey: chave(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async () => (await apiClient.get<{ data: PrincipalDaCentral }>(rota)).data,
  });
}

export function useDefinirFunilPrincipalDaCentral(orgId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (pipelineId: string) =>
      (await apiClient.patch<{ data: PrincipalDaCentral }>(rota, { pipeline_id: pipelineId })).data,
    onSuccess: (data) => client.setQueryData(chave(orgId), data),
  });
}
