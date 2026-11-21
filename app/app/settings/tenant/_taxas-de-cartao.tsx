"use client";

import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { taxasDeCartaoSchema, type TaxasDeCartao } from "@/lib/pdv/taxas-de-cartao";
import { randomId } from "@/lib/random-id";

type Perfil = TaxasDeCartao["perfis"][number];

export function TaxasDeCartaoForm({ initial }: { initial: TaxasDeCartao }) {
  const [config, setConfig] = useState(initial);
  const [estado, setEstado] = useState("");
  const [salvando, setSalvando] = useState(false);

  function editar(indice: number, campos: Partial<Perfil>) {
    setConfig((atual) => ({
      ...atual,
      perfis: atual.perfis.map((perfil, i) => i === indice ? { ...perfil, ...campos } : perfil),
    }));
    setEstado("");
  }

  async function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validado = taxasDeCartaoSchema.safeParse(config);
    if (!validado.success) {
      setEstado("Confira os nomes e as taxas dos perfis.");
      return;
    }
    setSalvando(true);
    setEstado("");
    try {
      await apiClient.patch("/api/v1/settings/taxas-de-cartao", validado.data);
      setConfig(validado.data);
      setEstado("Taxas salvas.");
    } catch (erro) {
      setEstado(erro instanceof Error ? erro.message : "Falha ao salvar as taxas.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="rounded-xl border bg-surface p-5">
      <fieldset disabled={salvando} className="space-y-4">
        <legend className="text-lg font-semibold">Taxas de cartão do PDV</legend>
        {config.perfis.length > 0 ? (
          <label className="block text-sm">
            Perfil padrão
            <select className="ml-2 rounded-md border bg-surface p-2" value={config.padrao ?? ""}
              onChange={(e) => {
                setConfig({ ...config, padrao: e.target.value === "" ? null : Number(e.target.value) });
                setEstado("");
              }}>
              <option value="">Primeiro perfil cadastrado</option>
              {config.perfis.map((perfil, i) => (
                <option key={perfil.id} value={i}>{perfil.nome || `Perfil ${i + 1}`}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum perfil cadastrado.</p>
        )}
        {config.perfis.map((perfil, i) => (
          <details key={perfil.id} className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">{perfil.nome || "Novo perfil"}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Nome
                <Input value={perfil.nome} maxLength={80}
                  onChange={(e) => editar(i, { nome: e.target.value })} />
              </label>
              <label className="text-sm">Bandeira
                <Input value={perfil.bandeira} maxLength={40}
                  onChange={(e) => editar(i, { bandeira: e.target.value })} />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {[perfil.debito, ...perfil.credito].map((taxa, parcela) => (
                <label key={parcela} className="text-sm">{parcela === 0 ? "Débito (%)" : `Crédito ${parcela}x (%)`}
                  <Input type="number" min="0" max="99.99" step="0.01" value={taxa / 100}
                    onChange={(e) => {
                      const bps = Math.round(Number(e.target.value) * 100);
                      editar(i, parcela === 0 ? { debito: bps } : {
                        credito: perfil.credito.map((v, j) => j === parcela - 1 ? bps : v),
                      });
                    }} />
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={perfil.credito.length >= 120}
                onClick={() => editar(i, { credito: [...perfil.credito, 0] })}>Adicionar parcela</Button>
              <Button type="button" variant="outline" disabled={perfil.credito.length <= 1}
                onClick={() => editar(i, { credito: perfil.credito.slice(0, -1) })}>Remover última parcela</Button>
              <Button type="button" variant="outline"
                onClick={() => {
                  const { padrao } = config;
                  setConfig({
                    padrao: padrao === null || padrao === i ? null : padrao - Number(padrao > i),
                    perfis: config.perfis.filter((_, j) => i !== j),
                  });
                  setEstado("");
                }}>Remover perfil</Button>
            </div>
          </details>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={config.perfis.length >= 30}
            onClick={() => {
              setConfig({ ...config, perfis: [...config.perfis, {
                id: randomId(), nome: "Novo perfil", bandeira: "", debito: 0, credito: [0],
              }] });
              setEstado("");
            }}>Novo perfil</Button>
          <Button type="submit">Salvar taxas</Button>
          <p role="status" className="text-sm">{estado}</p>
        </div>
      </fieldset>
    </form>
  );
}
