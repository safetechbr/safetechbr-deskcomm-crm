"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { centavosParaMascara, formatCents, mascararMoeda, parseReaisToCents } from "@/lib/money";
import {
  custoTotalDoVeiculo,
  totalDosReparos,
  type ItemDaOs,
  type VeiculoNaOficina,
} from "@/lib/oficina/regras";
import { tituloDoVeiculo } from "@/lib/veiculos/regras";

interface Linha {
  chave: number;
  descricao: string;
  valor: string;
}

export function OficinaClient({
  inicial,
  titulo,
  subtitulo,
}: {
  inicial: VeiculoNaOficina[];
  titulo: string;
  subtitulo: string;
}) {
  const t = useT();
  const router = useRouter();
  const [veiculos, setVeiculos] = React.useState(inicial);

  const [osDe, setOsDe] = React.useState<VeiculoNaOficina | null>(null);
  const [linhas, setLinhas] = React.useState<Linha[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const proximaChave = React.useRef(0);

  const [liberando, setLiberando] = React.useState<VeiculoNaOficina | null>(null);
  const [precoTexto, setPrecoTexto] = React.useState("");

  const [custoEditando, setCustoEditando] = React.useState<string | null>(null);
  const [custoTexto, setCustoTexto] = React.useState("");

  function abrirOs(v: VeiculoNaOficina) {
    setOsDe(v);
    const ls = v.reparos.map((r) => ({
      chave: proximaChave.current++,
      descricao: r.descricao,
      valor: centavosParaMascara(r.valor_cents, v.moeda),
    }));
    setLinhas(ls.length > 0 ? ls : [{ chave: proximaChave.current++, descricao: "", valor: "" }]);
  }

  async function salvarOs() {
    if (!osDe) return;
    const itens: ItemDaOs[] = [];
    for (const l of linhas) {
      if (l.descricao.trim() === "" && l.valor === "") continue;
      const cents = l.valor === "" ? 0 : parseReaisToCents(l.valor, osDe.moeda);
      if (cents === null || l.descricao.trim() === "") {
        toast.error(t("Preencha a descrição e o valor de cada item."));
        return;
      }
      itens.push({ descricao: l.descricao.trim(), valor_cents: cents });
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/oficina/${osDe.id}/os`, { itens });
      setVeiculos((vs) => vs.map((v) => (v.id === osDe.id ? { ...v, reparos: itens } : v)));
      toast.success(t("Ordem de serviço salva."));
      setOsDe(null);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarCusto(v: VeiculoNaOficina) {
    const cents = custoTexto === "" ? 0 : parseReaisToCents(custoTexto, v.moeda);
    if (cents === null) {
      toast.error(t("Valor inválido."));
      return;
    }
    try {
      await apiClient.patch(`/api/v1/oficina/${v.id}`, { custo_cents: cents });
      setVeiculos((vs) => vs.map((x) => (x.id === v.id ? { ...x, custo_cents: cents } : x)));
      setCustoEditando(null);
      toast.success(t("Custo de compra salvo."));
    } catch (e) {
      showApiError(e);
    }
  }

  async function liberar() {
    if (!liberando) return;
    const preco =
      precoTexto === "" ? undefined : (parseReaisToCents(precoTexto, liberando.moeda) ?? undefined);
    if (!preco && !(liberando.preco_cents > 0)) {
      toast.error(t("Defina o preço de venda para liberar o veículo."));
      return;
    }
    try {
      await apiClient.post(
        `/api/v1/oficina/${liberando.id}/liberar`,
        preco ? { preco_cents: preco } : {},
      );
      setVeiculos((vs) => vs.filter((v) => v.id !== liberando.id));
      toast.success(t("Veículo liberado: já está no Estoque."));
      setLiberando(null);
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  const totalDaOs = osDe
    ? linhas.reduce(
        (s, l) => s + (l.valor === "" ? 0 : (parseReaisToCents(l.valor, osDe.moeda) ?? 0)),
        0,
      )
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </header>

      {veiculos.length === 0 ? (
        <p
          className="rounded-lg border p-6 text-center text-sm text-muted-foreground"
          data-testid="oficina-vazia"
        >
          {t("Nenhum veículo na oficina.")}
        </p>
      ) : (
        <ul className="space-y-3" data-testid="oficina-lista">
          {veiculos.map((v) => {
            const reparos = totalDosReparos(v.reparos);
            return (
              <li
                key={v.id}
                className="space-y-3 rounded-lg border p-4"
                data-testid="oficina-veiculo"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{tituloDoVeiculo(v as never)}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.codigo}
                      {v.placa ? ` · ${v.placa}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => abrirOs(v)}>
                      {t("Abrir ordem de serviço")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setLiberando(v);
                        setPrecoTexto(centavosParaMascara(v.preco_cents, v.moeda));
                      }}
                    >
                      {t("Liberar")}
                    </Button>
                  </div>
                </div>

                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("Custo de compra")}</dt>
                    <dd>
                      {custoEditando === v.id ? (
                        <span className="flex items-center gap-1">
                          <input
                            aria-label={t("Custo de compra")}
                            className="h-8 w-32 rounded-md border px-2"
                            inputMode="numeric"
                            value={custoTexto}
                            onChange={(e) => setCustoTexto(mascararMoeda(e.target.value, v.moeda))}
                          />
                          <Button size="sm" onClick={() => salvarCusto(v)}>
                            {t("Salvar")}
                          </Button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() => {
                            setCustoEditando(v.id);
                            setCustoTexto(centavosParaMascara(v.custo_cents, v.moeda));
                          }}
                        >
                          {formatCents(v.custo_cents ?? 0, v.moeda)}
                        </button>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("Reparos")}</dt>
                    <dd>{formatCents(reparos, v.moeda)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("Custo total")}</dt>
                    <dd className="font-semibold" data-testid="custo-total">
                      {formatCents(custoTotalDoVeiculo(v.custo_cents, v.reparos), v.moeda)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={osDe !== null} onOpenChange={(o) => !o && setOsDe(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Ordem de serviço")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={l.chave} className="flex gap-2">
                <input
                  aria-label={t("Descrição")}
                  placeholder={t("Descrição")}
                  className="h-9 flex-1 rounded-md border px-2 text-sm"
                  value={l.descricao}
                  maxLength={200}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)),
                    )
                  }
                />
                <input
                  aria-label={t("Valor")}
                  placeholder="0,00"
                  inputMode="numeric"
                  className="h-9 w-28 rounded-md border px-2 text-sm"
                  value={l.valor}
                  onChange={(e) =>
                    setLinhas((ls) =>
                      ls.map((x, j) =>
                        j === i ? { ...x, valor: mascararMoeda(e.target.value, osDe?.moeda) } : x,
                      ),
                    )
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("Remover item")}
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setLinhas((ls) => [
                  ...ls,
                  { chave: proximaChave.current++, descricao: "", valor: "" },
                ])
              }
            >
              {t("Adicionar item")}
            </Button>
          </div>
          <p className="text-sm">
            {t("Total dos reparos")}:{" "}
            <strong>{formatCents(totalDaOs, osDe?.moeda ?? "BRL")}</strong>
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOsDe(null)}>
              {t("Cancelar")}
            </Button>
            <Button disabled={salvando} onClick={salvarOs}>
              {t("Salvar")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={liberando !== null} onOpenChange={(o) => !o && setLiberando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Liberar veículo")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("O veículo ficará disponível e aparecerá no Estoque.")}
          </p>
          <label className="block text-sm">
            {t("Preço de venda")}
            <input
              className="mt-1 h-9 w-full rounded-md border px-2"
              inputMode="numeric"
              value={precoTexto}
              onChange={(e) => setPrecoTexto(mascararMoeda(e.target.value, liberando?.moeda))}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLiberando(null)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={liberar}>{t("Liberar")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
