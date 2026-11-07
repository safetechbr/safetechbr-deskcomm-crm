"use client";

import * as React from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  documentoValido,
  FORMAS_COM_BANCO,
  FORMAS_PARCELADAS,
  FORMAS_POR_TIPO,
  formatarDocumento,
  type ClienteDaNegociacao,
  type FormaDePagamento,
  type Negociacao,
  type NegociacaoInput,
  type PagamentoDaNegociacao,
  pendenciasParaConcluir,
  resumoDaNegociacao,
  ROTULO_DA_FORMA,
  ROTULO_DO_STATUS_DA_NEGOCIACAO,
  type TipoDeNegociacao,
  tituloDoVeiculoDaNegociacao,
  type TrocaDaNegociacao,
  type VeiculoDaNegociacao,
} from "@/lib/pdv/regras";
import { precoParaCentavos } from "@/lib/schemas/produtos";
import { formatarKm, formatarPreco, tituloDoVeiculo, type Veiculo } from "@/lib/veiculos/regras";

export interface VeiculoDoPdv extends Veiculo {
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
}

type Aba = "venda" | "compra" | "historico";

interface Rascunho extends Omit<NegociacaoInput, "pagamentos" | "troca"> {
  pagamentos: PagamentoDaNegociacao[];
  troca: TrocaDaNegociacao | null;
}

interface ContatoEncontrado {
  id: string;
  name: string | null;
  display_name: string | null;
  email: string | null;
  phone_number: string | null;
}

const CLIENTE_VAZIO: ClienteDaNegociacao = { nome: "" };
const VEICULO_VAZIO: VeiculoDaNegociacao = { modelo: "" };
const TROCA_VAZIA: TrocaDaNegociacao = { modelo: "", valor_cents: 0, quitacao_cents: 0, entra_no_estoque: true };

function rascunhoNovo(tipo: TipoDeNegociacao): Rascunho {
  return {
    tipo,
    contact_id: null,
    cliente: { ...CLIENTE_VAZIO },
    veiculo_id: null,
    veiculo: { ...VEICULO_VAZIO },
    valor_cents: 0,
    desconto_cents: 0,
    troca: null,
    pagamentos: [],
    comissao_cents: null,
    observacoes: null,
  };
}

function rascunhoDe(n: Negociacao): Rascunho {
  return {
    tipo: n.tipo,
    contact_id: n.contact_id,
    cliente: { ...CLIENTE_VAZIO, ...n.cliente },
    veiculo_id: n.veiculo_id,
    veiculo: { ...VEICULO_VAZIO, ...n.veiculo },
    valor_cents: n.valor_cents,
    desconto_cents: n.desconto_cents,
    troca: n.troca ? { ...TROCA_VAZIA, ...n.troca } : null,
    pagamentos: n.pagamentos ?? [],
    comissao_cents: n.comissao_cents,
    observacoes: n.observacoes,
  };
}

/** Vazio vira null — o schema aceita null e o contrato mostra a linha em branco. */
function limpo<T extends Record<string, unknown>>(o: T): T {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) saida[k] = typeof v === "string" && v.trim() === "" ? null : v;
  return saida as T;
}

function corpoDoRascunho(r: Rascunho) {
  return {
    ...r,
    cliente: { ...limpo(r.cliente), nome: r.cliente.nome.trim() },
    veiculo: { ...limpo(r.veiculo), modelo: r.veiculo.modelo.trim() },
    troca: r.troca ? { ...limpo(r.troca), modelo: r.troca.modelo.trim() } : null,
    pagamentos: r.pagamentos.map((p) => limpo(p)),
    observacoes: r.observacoes?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Campos

function Campo({
  rotulo,
  valor,
  onChange,
  tipo = "text",
  extra,
  placeholder,
  testid,
}: {
  rotulo: string;
  valor: string | number | null | undefined;
  onChange: (v: string) => void;
  tipo?: string;
  extra?: string;
  placeholder?: string;
  testid?: string;
}) {
  return (
    <label className={`block text-xs ${extra ?? ""}`}>
      <span className="text-muted-foreground">{rotulo}</span>
      <input
        type={tipo}
        value={valor ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
        data-testid={testid}
      />
    </label>
  );
}

/** Campo de dinheiro: guarda o texto enquanto digita e devolve centavos. */
function CampoDinheiro({
  rotulo,
  cents,
  onChange,
  extra,
  testid,
}: {
  rotulo: string;
  cents: number | null | undefined;
  onChange: (cents: number) => void;
  extra?: string;
  testid?: string;
}) {
  const formatar = (c: number | null | undefined) =>
    c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  const [texto, setTexto] = React.useState(formatar(cents));
  const ultimo = React.useRef(cents);
  React.useEffect(() => {
    if (cents !== ultimo.current) {
      ultimo.current = cents;
      setTexto(formatar(cents));
    }
  }, [cents]);
  return (
    <label className={`block text-xs ${extra ?? ""}`}>
      <span className="text-muted-foreground">{rotulo}</span>
      <div className="mt-1 flex h-9 items-center rounded-md border bg-background px-2 text-sm">
        <span className="mr-1 text-muted-foreground">R$</span>
        <input
          inputMode="decimal"
          value={texto}
          placeholder="0,00"
          onChange={(e) => {
            setTexto(e.target.value);
            const c = e.target.value.trim() === "" ? 0 : precoParaCentavos(e.target.value);
            if (c !== null) {
              ultimo.current = c;
              onChange(c);
            }
          }}
          onBlur={() => setTexto(formatar(ultimo.current))}
          className="h-full w-full bg-transparent outline-hidden"
          data-testid={testid}
        />
      </div>
    </label>
  );
}

function numeroOuNull(v: string): number | null {
  const d = v.replace(/\D/g, "");
  return d ? Number(d) : null;
}

function Coluna({
  titulo,
  atalho,
  rodape,
  children,
}: {
  titulo: string;
  atalho?: string;
  rodape?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-wider uppercase">{titulo}</h2>
        {atalho ? <kbd className="rounded-sm border px-1.5 text-[10px] text-muted-foreground">{atalho}</kbd> : null}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
      {rodape}
    </section>
  );
}

/** Ficha de veículo (marca, modelo, ano, placa, chassi…), usada na compra e na troca. */
function FichaDoVeiculo<V extends VeiculoDaNegociacao | TrocaDaNegociacao>({
  v,
  onChange,
  prefixo,
}: {
  v: V;
  onChange: (v: V) => void;
  prefixo: string;
}) {
  const t = useT();
  const set = (campo: keyof VeiculoDaNegociacao, valor: unknown) => onChange({ ...v, [campo]: valor });
  return (
    <div className="grid grid-cols-2 gap-2">
      <Campo rotulo={t("Marca")} valor={v.marca} onChange={(x) => set("marca", x)} />
      <Campo rotulo={t("Modelo")} valor={v.modelo} onChange={(x) => set("modelo", x)} testid={`${prefixo}-modelo`} />
      <Campo rotulo={t("Versão")} valor={v.versao} onChange={(x) => set("versao", x)} extra="col-span-2" />
      <Campo rotulo={t("Ano fab.")} valor={v.ano_fabricacao} onChange={(x) => set("ano_fabricacao", numeroOuNull(x))} />
      <Campo rotulo={t("Ano modelo")} valor={v.ano_modelo} onChange={(x) => set("ano_modelo", numeroOuNull(x))} />
      <Campo rotulo={t("Km")} valor={v.km} onChange={(x) => set("km", numeroOuNull(x))} />
      <Campo rotulo={t("Cor")} valor={v.cor} onChange={(x) => set("cor", x)} />
      <Campo rotulo={t("Combustível")} valor={v.combustivel} onChange={(x) => set("combustivel", x)} />
      <Campo rotulo={t("Câmbio")} valor={v.cambio} onChange={(x) => set("cambio", x)} />
      <Campo rotulo={t("Placa")} valor={v.placa} onChange={(x) => set("placa", x.toUpperCase())} />
      <Campo rotulo={t("Renavam")} valor={v.renavam} onChange={(x) => set("renavam", x)} />
      <Campo rotulo={t("Chassi")} valor={v.chassi} onChange={(x) => set("chassi", x.toUpperCase())} extra="col-span-2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coluna 1 — cliente

function ColunaCliente({
  r,
  setR,
  travado,
}: {
  r: Rascunho;
  setR: (f: (r: Rascunho) => Rascunho) => void;
  travado: boolean;
}) {
  const t = useT();
  const [busca, setBusca] = React.useState("");
  const [achados, setAchados] = React.useState<ContatoEncontrado[]>([]);
  const c = r.cliente;
  const set = (campo: keyof ClienteDaNegociacao, valor: string) =>
    setR((x) => ({ ...x, cliente: { ...x.cliente, [campo]: valor } }));

  React.useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) return;
    const h = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ data: ContatoEncontrado[] }>(
          `/api/v1/contacts?search=${encodeURIComponent(termo)}&limit=8`,
        );
        setAchados(res.data ?? []);
      } catch {
        setAchados([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [busca]);


  const docPreenchido = (c.documento ?? "").replace(/\D/g, "").length > 0;
  return (
    <Coluna atalho="F2" titulo={r.tipo === "venda" ? t("Cliente (comprador)") : t("Cliente (vendedor)")}>
      <fieldset disabled={travado} className="space-y-3">
        <div className="relative">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("Buscar contato por nome ou telefone…")}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            data-testid="pdv-busca-contato"
          />
          {busca.trim().length >= 2 && achados.length > 0 ? (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-sm">
              {achados.map((ct) => (
                <li key={ct.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setR((x) => ({
                        ...x,
                        contact_id: ct.id,
                        cliente: {
                          ...x.cliente,
                          nome: ct.name || ct.display_name || x.cliente.nome,
                          telefone: ct.phone_number || x.cliente.telefone,
                          email: ct.email || x.cliente.email,
                        },
                      }));
                      setBusca("");
                      setAchados([]);
                    }}
                  >
                    <div className="font-medium">{ct.name || ct.display_name || t("Sem nome")}</div>
                    <div className="text-xs text-muted-foreground">{ct.phone_number ?? ct.email ?? ""}</div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {r.contact_id ? (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs">
            <span>{t("Vinculado a um contato do CRM.")}</span>
            <button type="button" className="underline" onClick={() => setR((x) => ({ ...x, contact_id: null }))}>
              {t("Desvincular")}
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo={t("Nome completo / razão social")} valor={c.nome} onChange={(x) => set("nome", x)} extra="col-span-2" testid="pdv-cliente-nome" />
          <label className="col-span-2 block text-xs">
            <span className="text-muted-foreground">{t("CPF ou CNPJ")}</span>
            <input
              value={c.documento ?? ""}
              onChange={(e) => set("documento", e.target.value)}
              onBlur={(e) => set("documento", formatarDocumento(e.target.value))}
              className={`mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm ${
                docPreenchido && !documentoValido(c.documento) ? "border-destructive" : ""
              }`}
              data-testid="pdv-cliente-documento"
            />
            {docPreenchido && !documentoValido(c.documento) ? (
              <span className="text-destructive">{t("Documento inválido.")}</span>
            ) : null}
          </label>
          <Campo rotulo={t("RG")} valor={c.rg} onChange={(x) => set("rg", x)} />
          <Campo rotulo={t("CNH")} valor={c.cnh} onChange={(x) => set("cnh", x)} />
          <Campo rotulo={t("Nascimento")} tipo="date" valor={c.nascimento} onChange={(x) => set("nascimento", x)} />
          <Campo rotulo={t("Telefone")} valor={c.telefone} onChange={(x) => set("telefone", x)} />
          <Campo rotulo={t("E-mail")} tipo="email" valor={c.email} onChange={(x) => set("email", x)} extra="col-span-2" />
        </div>

        <div className="border-t pt-3">
          <div className="mb-2 text-xs font-medium">{t("Endereço")}</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs">
              <span className="text-muted-foreground">{t("CEP")}</span>
              <input
                value={c.cep ?? ""}
                onChange={(e) => set("cep", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>
            <Campo rotulo={t("Rua")} valor={c.endereco} onChange={(x) => set("endereco", x)} extra="col-span-2" />
            <Campo rotulo={t("Número")} valor={c.numero} onChange={(x) => set("numero", x)} />
            <Campo rotulo={t("Complemento")} valor={c.complemento} onChange={(x) => set("complemento", x)} extra="col-span-2" />
            <Campo rotulo={t("Bairro")} valor={c.bairro} onChange={(x) => set("bairro", x)} />
            <Campo rotulo={t("Cidade")} valor={c.cidade} onChange={(x) => set("cidade", x)} />
            <Campo rotulo={t("UF")} valor={c.uf} onChange={(x) => set("uf", x.toUpperCase().slice(0, 2))} />
          </div>
        </div>
      </fieldset>
    </Coluna>
  );
}

// ---------------------------------------------------------------------------
// Coluna 2 — veículo

function ColunaVeiculo({
  r,
  setR,
  estoque,
  urlsDasCapas,
  travado,
}: {
  r: Rascunho;
  setR: (f: (r: Rascunho) => Rascunho) => void;
  estoque: VeiculoDoPdv[];
  urlsDasCapas: Record<string, string>;
  travado: boolean;
}) {
  const t = useT();
  const [busca, setBusca] = React.useState("");
  const escolhido = estoque.find((v) => v.id === r.veiculo_id) ?? null;

  function escolher(v: VeiculoDoPdv) {
    setR((x) => ({
      ...x,
      veiculo_id: v.id,
      veiculo: {
        codigo: v.codigo,
        marca: v.marca,
        modelo: v.modelo,
        versao: v.versao,
        ano_fabricacao: v.ano_fabricacao,
        ano_modelo: v.ano_modelo,
        km: v.km,
        cor: v.cor,
        combustivel: v.combustivel,
        cambio: v.cambio,
        motor: v.motor,
        placa: v.placa,
        chassi: v.chassi,
        renavam: v.renavam,
      },
      valor_cents: v.preco_cents,
    }));
    setBusca("");
  }

  if (r.tipo === "compra") {
    return (
      <Coluna titulo={t("Veículo comprado")}>
        <fieldset disabled={travado} className="space-y-3">
          <FichaDoVeiculo v={r.veiculo} onChange={(v) => setR((x) => ({ ...x, veiculo: v }))} prefixo="pdv-compra" />
          <div className="grid grid-cols-2 gap-2 border-t pt-3">
            <CampoDinheiro
              rotulo={t("Valor pago ao cliente")}
              cents={r.valor_cents}
              onChange={(c) => setR((x) => ({ ...x, valor_cents: c }))}
              testid="pdv-valor"
            />
            <CampoDinheiro
              rotulo={t("Preço de anúncio (opcional)")}
              cents={r.veiculo.preco_venda_cents}
              onChange={(c) => setR((x) => ({ ...x, veiculo: { ...x.veiculo, preco_venda_cents: c || null } }))}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Ao concluir, o veículo entra no estoque. Sem preço de anúncio ele fica como reservado.")}
          </p>
        </fieldset>
      </Coluna>
    );
  }

  const termo = busca.trim().toLowerCase();
  const lista = estoque
    .filter((v) => v.status === "disponivel" || v.id === r.veiculo_id)
    .filter((v) =>
      !termo
        ? true
        : [tituloDoVeiculo(v), v.codigo, v.placa ?? "", v.placa_final ?? "", v.cor ?? ""].join(" ").toLowerCase().includes(termo),
    );
  const capa = (v: VeiculoDoPdv) => {
    const c = (v.fotos ?? []).find((f) => urlsDasCapas[f]);
    return c ? urlsDasCapas[c] : null;
  };

  return (
    <Coluna atalho="F3" titulo={t("Veículos")}>
      <fieldset disabled={travado} className="space-y-3">
        {escolhido ? (
          <div className="overflow-hidden rounded-md border" data-testid="pdv-veiculo-escolhido">
            <div className="aspect-[16/9] bg-muted">
              {capa(escolhido) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={capa(escolhido)!} alt={tituloDoVeiculo(escolhido)} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="space-y-1 p-3 text-sm">
              <div className="font-medium">{tituloDoVeiculo(escolhido)}</div>
              <div className="text-xs text-muted-foreground">
                {[escolhido.codigo, escolhido.km != null ? formatarKm(escolhido.km) : null, escolhido.cor, escolhido.placa]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("Preço de tabela")}: {formatarPreco(escolhido.preco_cents, escolhido.moeda)}
              </div>
              {!travado ? (
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setR((x) => ({ ...x, veiculo_id: null, veiculo: { ...VEICULO_VAZIO } }))}
                >
                  {t("Trocar de veículo")}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("Buscar no estoque por modelo, código ou placa…")}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              data-testid="pdv-busca-veiculo"
            />
            {lista.length === 0 ? (
              <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                {t("Nenhum veículo disponível no estoque.")}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {lista.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => escolher(v)}
                      className="flex h-full w-full flex-col overflow-hidden rounded-md border text-left hover:border-orange-500"
                      data-testid={`pdv-estoque-${v.codigo}`}
                    >
                      <div className="aspect-[16/9] w-full bg-muted">
                        {capa(v) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={capa(v)!} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5 p-2 text-sm">
                        <div className="truncate font-medium">{tituloDoVeiculo(v)}</div>
                        <div className="text-xs text-muted-foreground">
                          {[v.codigo, v.km != null ? formatarKm(v.km) : null].filter(Boolean).join(" · ")}
                        </div>
                        <div className="font-semibold text-orange-500">{formatarPreco(v.preco_cents, v.moeda)}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          <CampoDinheiro
            rotulo={t("Preço de venda")}
            cents={r.valor_cents}
            onChange={(c) => setR((x) => ({ ...x, valor_cents: c }))}
            testid="pdv-valor"
          />
          <CampoDinheiro
            rotulo={t("Desconto")}
            cents={r.desconto_cents}
            onChange={(c) => setR((x) => ({ ...x, desconto_cents: c }))}
          />
        </div>

        <div className="border-t pt-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={Boolean(r.troca)}
              onChange={(e) => setR((x) => ({ ...x, troca: e.target.checked ? { ...TROCA_VAZIA } : null }))}
              data-testid="pdv-tem-troca"
            />
            {t("Cliente dá um veículo na troca")}
          </label>
          {r.troca ? (
            <div className="mt-3 space-y-2 rounded-md bg-muted/50 p-3">
              <FichaDoVeiculo
                v={r.troca}
                onChange={(v) => setR((x) => ({ ...x, troca: v }))}
                prefixo="pdv-troca"
              />
              <div className="grid grid-cols-2 gap-2">
                <CampoDinheiro
                  rotulo={t("Valor avaliado")}
                  cents={r.troca.valor_cents}
                  onChange={(c) => setR((x) => ({ ...x, troca: x.troca ? { ...x.troca, valor_cents: c } : null }))}
                  testid="pdv-troca-valor"
                />
                <CampoDinheiro
                  rotulo={t("Saldo a quitar (financiamento)")}
                  cents={r.troca.quitacao_cents}
                  onChange={(c) => setR((x) => ({ ...x, troca: x.troca ? { ...x.troca, quitacao_cents: c } : null }))}
                />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={r.troca.entra_no_estoque}
                  onChange={(e) =>
                    setR((x) => ({ ...x, troca: x.troca ? { ...x.troca, entra_no_estoque: e.target.checked } : null }))
                  }
                />
                {t("Colocar a troca no estoque ao concluir (como reservado)")}
              </label>
            </div>
          ) : null}
        </div>
      </fieldset>
    </Coluna>
  );
}

// ---------------------------------------------------------------------------
// Coluna 3 — pagamento

/** Os blocos do painel, como no balcão: PIX, cartões, dinheiro e o resto. */
const GRUPOS_DE_PAGAMENTO: { id: string; rotulo: string; formas: readonly FormaDePagamento[] }[] = [
  { id: "pix", rotulo: "PIX", formas: ["pix", "transferencia"] },
  { id: "cartoes", rotulo: "Cartões", formas: ["cartao_debito", "cartao_credito"] },
  { id: "dinheiro", rotulo: "Dinheiro", formas: ["dinheiro"] },
  {
    id: "outras",
    rotulo: "Outras formas",
    formas: ["financiamento", "consorcio", "boleto", "cheque", "promissoria", "quitacao"],
  },
];

function ColunaPagamento({
  r,
  setR,
  travado,
  faltas,
  rodape,
}: {
  r: Rascunho;
  setR: (f: (r: Rascunho) => Rascunho) => void;
  travado: boolean;
  faltas: string[];
  rodape: React.ReactNode;
}) {
  const t = useT();
  const resumo = resumoDaNegociacao(r);
  const formas = FORMAS_POR_TIPO[r.tipo];
  const venda = r.tipo === "venda";

  function adicionar(forma: FormaDePagamento) {
    const valor = Math.max(0, resumo.saldo_cents);
    setR((x) => ({ ...x, pagamentos: [...x.pagamentos, { forma, valor_cents: valor, parcelas: 1 }] }));
  }
  function mudar(i: number, p: Partial<PagamentoDaNegociacao>) {
    setR((x) => ({
      ...x,
      pagamentos: x.pagamentos.map((atual, j) => {
        if (j !== i) return atual;
        const novo = { ...atual, ...p };
        // Valor da parcela acompanha valor/parcelas, até o vendedor digitar outro (juros).
        if (("valor_cents" in p || "parcelas" in p) && FORMAS_PARCELADAS.includes(novo.forma) && novo.parcelas > 1) {
          novo.valor_parcela_cents = Math.round(novo.valor_cents / novo.parcelas);
        }
        return novo;
      }),
    }));
  }

  function cartaoDoPagamento(p: PagamentoDaNegociacao, i: number) {
    const parcelada = FORMAS_PARCELADAS.includes(p.forma);
    const comBanco = FORMAS_COM_BANCO.includes(p.forma);
    return (
      <li key={i} className="space-y-2 rounded-md border bg-background/50 p-3" data-testid={`pdv-pagamento-${i}`}>
        <div className="flex items-center justify-between gap-2">
          <select
            value={p.forma}
            onChange={(e) => mudar(i, { forma: e.target.value as FormaDePagamento })}
            className="h-8 flex-1 rounded-md border bg-background px-2 text-sm font-medium"
          >
            {formas.map((f) => (
              <option key={f} value={f}>
                {t(ROTULO_DA_FORMA[f])}
              </option>
            ))}
          </select>
          {!travado ? (
            <button
              type="button"
              className="text-xs text-destructive"
              onClick={() => setR((x) => ({ ...x, pagamentos: x.pagamentos.filter((_, j) => j !== i) }))}
            >
              {t("Remover")}
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CampoDinheiro
            rotulo={p.forma === "financiamento" ? t("Valor financiado") : t("Valor")}
            cents={p.valor_cents}
            onChange={(c) => mudar(i, { valor_cents: c })}
            extra={parcelada ? "" : "col-span-2"}
            testid={`pdv-pagamento-${i}-valor`}
          />
          {parcelada ? (
            <Campo
              rotulo={t("Parcelas")}
              tipo="number"
              valor={p.parcelas}
              onChange={(x) => mudar(i, { parcelas: Math.min(120, Math.max(1, Number(x) || 1)) })}
            />
          ) : null}
          {parcelada && p.parcelas > 1 ? (
            <CampoDinheiro
              rotulo={t("Valor da parcela")}
              cents={p.valor_parcela_cents}
              onChange={(c) => mudar(i, { valor_parcela_cents: c })}
            />
          ) : null}
          {parcelada ? (
            <Campo
              rotulo={t("1º vencimento")}
              tipo="date"
              valor={p.primeiro_vencimento}
              onChange={(x) => mudar(i, { primeiro_vencimento: x || null })}
            />
          ) : null}
          {comBanco ? (
            <Campo
              rotulo={p.forma === "consorcio" ? t("Administradora") : t("Banco / financeira")}
              valor={p.banco}
              onChange={(x) => mudar(i, { banco: x })}
              extra="col-span-2"
            />
          ) : null}
          <Campo rotulo={t("Observação")} valor={p.observacao} onChange={(x) => mudar(i, { observacao: x })} extra="col-span-2" />
        </div>
      </li>
    );
  }

  const grupos = GRUPOS_DE_PAGAMENTO.map((g) => ({ ...g, disponiveis: g.formas.filter((f) => formas.includes(f)) })).filter(
    (g) => g.disponiveis.length > 0,
  );
  const troco = Math.max(0, -resumo.saldo_cents);
  const situacao =
    faltas.length > 0
      ? { texto: t("Aguardando itens"), cor: "bg-muted text-muted-foreground" }
      : resumo.saldo_cents > 0
        ? { texto: `${t("Falta")} ${formatarPreco(resumo.saldo_cents)}`, cor: "bg-amber-500/20 text-amber-600" }
        : { texto: t("Pronto para finalizar"), cor: "bg-emerald-500/20 text-emerald-600" };

  return (
    <Coluna titulo={venda ? t("Pagamento") : t("Como a loja paga")} rodape={rodape}>
      <fieldset disabled={travado} className="space-y-4">
        {grupos.map((g) => {
          const doGrupo = r.pagamentos.map((p, i) => ({ p, i })).filter(({ p }) => g.formas.includes(p.forma));
          return (
            <div key={g.id} className="space-y-2" data-testid={`pdv-grupo-${g.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{t(g.rotulo)}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {g.disponiveis.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => adicionar(f)}
                      className="rounded-md border border-dashed px-2.5 py-1 text-xs hover:bg-muted"
                      data-testid={`pdv-forma-${f}`}
                    >
                      + {t(ROTULO_DA_FORMA[f])}
                    </button>
                  ))}
                </div>
              </div>
              {doGrupo.length > 0 ? <ul className="space-y-2">{doGrupo.map(({ p, i }) => cartaoDoPagamento(p, i))}</ul> : null}
            </div>
          );
        })}

        {venda ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
            <span className="font-semibold">{t("Troca")}</span>
            <span className={r.troca ? "font-semibold" : "text-muted-foreground"}>
              {r.troca ? formatarPreco(resumo.troca_liquida_cents) : t("Sem troca")}
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 divide-x rounded-md border text-center">
          <div className="p-2">
            <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{t("Pago")}</div>
            <div className="text-sm font-semibold">{formatarPreco(resumo.pagamentos_cents)}</div>
          </div>
          <div className="p-2">
            <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{t("Troco")}</div>
            <div className="text-sm font-semibold">{formatarPreco(troco)}</div>
          </div>
        </div>

        <div className={`rounded-md px-3 py-2 text-center text-xs font-medium ${situacao.cor}`}>{situacao.texto}</div>

        <label className="block text-xs">
          <span className="text-muted-foreground">{venda ? t("Observações da Venda") : t("Observações da Compra")}</span>
          <textarea
            value={r.observacoes ?? ""}
            onChange={(e) => setR((x) => ({ ...x, observacoes: e.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-sm"
          />
        </label>
      </fieldset>
    </Coluna>
  );
}

// ---------------------------------------------------------------------------
// Histórico

function Historico({
  negociacoes,
  abrir,
}: {
  negociacoes: Negociacao[];
  abrir: (n: Negociacao) => void;
}) {
  const t = useT();
  const tagDeIdioma = useTagDeIdioma();
  const [filtro, setFiltro] = React.useState<"all" | TipoDeNegociacao>("all");
  const lista = negociacoes.filter((n) => filtro === "all" || n.tipo === filtro);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["all", "venda", "compra"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === f ? "bg-primary text-primary-foreground" : ""}`}
          >
            {f === "all" ? t("Todas") : f === "venda" ? t("Vendas") : t("Compras")}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">{t("Nenhuma negociação ainda.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">{t("Tipo")}</th>
                <th className="px-3 py-2">{t("Cliente")}</th>
                <th className="px-3 py-2">{t("Veículo")}</th>
                <th className="px-3 py-2 text-right">{t("Valor")}</th>
                <th className="px-3 py-2">{t("Situação")}</th>
                <th className="px-3 py-2">{t("Data")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => (
                <tr key={n.id} className="border-t" data-testid={`pdv-historico-${n.numero}`}>
                  <td className="px-3 py-2 font-mono">{String(n.numero).padStart(4, "0")}</td>
                  <td className="px-3 py-2">{n.tipo === "venda" ? t("Venda") : t("Compra")}</td>
                  <td className="px-3 py-2">{n.cliente?.nome || "—"}</td>
                  <td className="px-3 py-2">{tituloDoVeiculoDaNegociacao(n.veiculo) || "—"}</td>
                  <td className="px-3 py-2 text-right">{formatarPreco(resumoDaNegociacao(n).total_cents, n.moeda)}</td>
                  <td className="px-3 py-2">{t(ROTULO_DO_STATUS_DA_NEGOCIACAO[n.status])}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(n.concluida_em ?? n.created_at).toLocaleDateString(tagDeIdioma)}
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                    <button type="button" className="text-xs underline" onClick={() => abrir(n)}>
                      {n.status === "rascunho" ? t("Continuar") : t("Ver")}
                    </button>
                    {n.status !== "cancelada" ? (
                      <a
                        href={`/api/v1/pdv/negociacoes/${n.id}/contrato`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        {t("Contrato")}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tela

export function PdvClient({
  estoque: estoqueInicial,
  urlsDasCapas,
  negociacoesIniciais,
  podeNegociar,
  titulo,
}: {
  estoque: VeiculoDoPdv[];
  urlsDasCapas: Record<string, string>;
  negociacoesIniciais: Negociacao[];
  podeNegociar: boolean;
  titulo: string;
}) {
  const t = useT();
  const [aba, setAba] = React.useState<Aba>("venda");
  const [r, setRascunho] = React.useState<Rascunho>(() => rascunhoNovo("venda"));
  const [aberta, setAberta] = React.useState<Negociacao | null>(null);
  const [negociacoes, setNegociacoes] = React.useState(negociacoesIniciais);
  const [estoque, setEstoque] = React.useState(estoqueInicial);
  const [salvando, setSalvando] = React.useState(false);

  const travado = !podeNegociar || (aberta !== null && aberta.status !== "rascunho");
  const setR = React.useCallback((f: (r: Rascunho) => Rascunho) => setRascunho((x) => f(x)), []);
  const resumo = resumoDaNegociacao(r);
  const faltas = pendenciasParaConcluir(r);

  function nova(tipo: TipoDeNegociacao) {
    setAba(tipo);
    setAberta(null);
    setRascunho(rascunhoNovo(tipo));
  }

  function abrir(n: Negociacao) {
    setAba(n.tipo);
    setAberta(n);
    setRascunho(rascunhoDe(n));
  }

  function guardar(n: Negociacao) {
    setAberta(n);
    setNegociacoes((lista) => [n, ...lista.filter((x) => x.id !== n.id)]);
  }

  async function salvar(): Promise<Negociacao | null> {
    const corpo = corpoDoRascunho(r);
    try {
      const res = aberta
        ? await apiClient.patch<{ data: Negociacao }>(`/api/v1/pdv/negociacoes/${aberta.id}`, {
            ...corpo,
            tipo: undefined,
          })
        : await apiClient.post<{ data: Negociacao }>("/api/v1/pdv/negociacoes", corpo);
      guardar(res.data);
      return res.data;
    } catch (e) {
      showApiError(e);
      return null;
    }
  }

  async function salvarRascunho() {
    setSalvando(true);
    const n = await salvar();
    setSalvando(false);
    if (n) toast.success(t("Negociação salva."));
  }

  async function finalizar() {
    if (faltas.length > 0) {
      toast.error(t(faltas[0]!));
      return;
    }
    setSalvando(true);
    const n = await salvar();
    if (!n) {
      setSalvando(false);
      return;
    }
    try {
      const res = await apiClient.post<{ data: Negociacao }>(`/api/v1/pdv/negociacoes/${n.id}/concluir`, {});
      guardar(res.data);
      if (res.data.tipo === "venda" && res.data.veiculo_id) {
        setEstoque((lista) => lista.filter((v) => v.id !== res.data.veiculo_id));
      }
      toast.success(res.data.tipo === "venda" ? t("Venda concluída!") : t("Compra concluída! O veículo entrou no estoque."));
      window.open(`/api/v1/pdv/negociacoes/${n.id}/contrato`, "_blank", "noopener");
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar() {
    if (!aberta) return;
    if (!window.confirm(t("Cancelar esta negociação? Ela continua no histórico como cancelada."))) return;
    try {
      const res = await apiClient.patch<{ data: Negociacao }>(`/api/v1/pdv/negociacoes/${aberta.id}`, { acao: "cancelar" });
      guardar(res.data);
      toast.success(t("Negociação cancelada."));
      nova(r.tipo);
    } catch (e) {
      showApiError(e);
    }
  }

  const abas: { id: Aba; rotulo: string }[] = [
    { id: "venda", rotulo: t("Venda") },
    { id: "compra", rotulo: t("Compra") },
    { id: "historico", rotulo: t("Histórico") },
  ];

  const rodapeDoPagamento =
    aba !== "historico" ? (
      <footer className="bg-orange-500 text-white" data-testid="pdv-rodape">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div data-testid="pdv-saldo" className="min-w-0">
            <div className="text-[10px] tracking-wider uppercase opacity-90">{r.tipo === "venda" ? t("Total") : t("Valor da compra")}</div>
            <div className="text-xl leading-tight font-bold">{formatarPreco(resumo.total_cents)}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {aberta?.status === "rascunho" && podeNegociar ? (
              <Button variant="ghost" size="sm" onClick={cancelar} disabled={salvando} className="text-white hover:bg-white/15 hover:text-white">
                {t("Cancelar")}
              </Button>
            ) : null}
            {!travado ? (
              <>
                <Button variant="ghost" size="sm" onClick={salvarRascunho} disabled={salvando} className="text-white hover:bg-white/15 hover:text-white" data-testid="pdv-salvar">
                  {t("Salvar rascunho")}
                </Button>
                <Button
                  onClick={finalizar}
                  disabled={salvando}
                  title={faltas.length > 0 ? faltas.map(t).join("\n") : undefined}
                  className="rounded-full bg-white px-5 text-orange-600 hover:bg-white/90"
                  data-testid="pdv-finalizar"
                >
                  {r.tipo === "venda" ? t("Finalizar") : t("Finalizar compra")}
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {!travado && faltas.length > 0 ? (
          <div className="px-4 pb-2 text-xs opacity-90" data-testid="pdv-pendencias">
            {t("Falta")}: {faltas.map(t).join(" · ")}
          </div>
        ) : null}
      </footer>
    ) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2">
        <a href="/app" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t("Voltar")}
        </a>
        <h1 className="text-sm font-bold tracking-wider uppercase">{titulo}</h1>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-600 uppercase">
          {aberta ? t(ROTULO_DO_STATUS_DA_NEGOCIACAO[aberta.status]) : t("Aberto")}
        </span>
        {aberta ? (
          <span className="text-xs text-muted-foreground">
            {r.tipo === "venda" ? t("Venda") : t("Compra")} #{String(aberta.numero).padStart(4, "0")}
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {aberta ? (
            <>
              <a
                href={`/api/v1/pdv/negociacoes/${aberta.id}/contrato`}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
              >
                {aberta.status === "concluida" ? t("Imprimir contrato") : t("Prévia do contrato")}
              </a>
              <button type="button" className="text-xs underline" onClick={() => nova(r.tipo)}>
                {t("Nova negociação")}
              </button>
            </>
          ) : null}
          <div className="flex rounded-lg border p-0.5" role="tablist">
            {abas.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => (a.id === "historico" ? setAba("historico") : a.id !== r.tipo || aberta ? nova(a.id) : setAba(a.id))}
                className={`rounded-md px-3 py-1 text-xs font-medium ${aba === a.id ? "bg-orange-500 text-white" : "hover:bg-muted"}`}
                data-testid={`pdv-aba-${a.id}`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>
      </header>

      {aba === "historico" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Historico negociacoes={negociacoes} abrir={abrir} />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] lg:overflow-hidden">
          <ColunaCliente r={r} setR={setR} travado={travado} />
          <ColunaVeiculo r={r} setR={setR} estoque={estoque} urlsDasCapas={urlsDasCapas} travado={travado} />
          <ColunaPagamento r={r} setR={setR} travado={travado} faltas={faltas} rodape={rodapeDoPagamento} />
        </div>
      )}
    </div>
  );
}
