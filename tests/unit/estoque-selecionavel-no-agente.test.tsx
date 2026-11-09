import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolPicker } from "@/app/app/ai/agents/[id]/_components/ToolPicker";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";

vi.mock("@/lib/api/client", () => ({ apiClient: { get: async () => ({ data: {
  tools: TOOL_CATALOG.filter(t=>["crm_consultar_estoque", "crm_search_products"].includes(t.name)).map(t=>({
    id:t.name, category:t.category, rotulo:t.rotulo, explicacao:t.explicacao, o_que_toca:t.oQueToca,
    risco:t.risco, pacotes:t.pacotes, requires_role:"agent", requires_scope:"mcp:read",
    description:t.explicacao, marcavel:true, motivo_nao_marcavel:null,
  })), desligadas_pela_organizacao:[],
} }) } }));

describe("estoque na criação e edição do agente", () => {
  it.each([{ inicial: [] as string[] }, { inicial: ["crm_search_products"] }])("permite marcar a consulta sem perder capacidades anteriores: $inicial", async ({ inicial }) => {
    let selecionadas = inicial;
    function Formulario() {
      const [value, setValue] = useState(inicial);
      return <ToolPicker value={value} onChange={next=>{selecionadas=next;setValue(next);}} />;
    }
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
    render(<IdiomaProvider locale="pt-BR"><QueryClientProvider client={client}><Formulario /></QueryClientProvider></IdiomaProvider>);
    fireEvent.click(await screen.findByTestId("toggle-avancado"));
    const checkbox = screen.getAllByRole("checkbox", {name:"Consultar estoque e preços"})[0]!;
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(selecionadas).toContain("crm_consultar_estoque");
    for(const id of inicial) expect(selecionadas).toContain(id);
  });
});
