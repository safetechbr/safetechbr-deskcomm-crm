/** A mesma âncora no atalho e no editor: cada funil abre suas próprias colunas. */
export const ancoraDasEtapas = (pipelineId: string) => `etapas-${pipelineId}`;

export function configuracaoDasColunas(pipelineId: string): string {
  return `/app/settings/tenant/pipelines#${encodeURIComponent(ancoraDasEtapas(pipelineId))}`;
}
