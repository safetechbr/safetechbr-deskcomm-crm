"use client";

import { acharCampo, destacarCampo } from "@/components/pdv/destacar-campo";
import * as React from "react";
import { CartaoDocumentoCliente } from "@/components/pdv/cartao-documento-cliente";
import { AnexarDocumentoCliente } from "@/components/pdv/anexar-documento-cliente";
import { preencherComDocumento } from "@/lib/pdv/dados-do-documento";
import {
  DocumentosDoCliente,
  salvarArquivoDoCliente,
  type DocumentoSalvo,
} from "@/components/pdv/documentos-do-cliente";
import { CampoNacionalidade } from "@/components/pdv/campo-nacionalidade";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  corpoDoContato,
  validarCadastroDeCliente,
  clienteDoContato,
  type ContatoDoCadastro,
} from "@/lib/pdv/cadastro-cliente";
import { mesclarCadastroDoCliente } from "@/lib/contacts/dados-cadastrais-do-cliente";
import { formatarDocumento, type ClienteDaNegociacao } from "@/lib/pdv/regras";
import type { FaltaParaConcluir } from "@/lib/pdv/retrato-da-operacao";

const CAMPO =
  "mt-1 h-10 w-full rounded-full border border-border/80 bg-surface px-3.5 text-sm shadow-xs transition-colors focus-visible:border-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/20 disabled:opacity-70";

const VAZIO: ClienteDaNegociacao = { nome: "" };

const ESTADOS_CIVIS = [
  "solteiro(a)",
  "casado(a)",
  "divorciado(a)",
  "separado(a)",
  "viúvo(a)",
  "união estável",
] as const;

function Rotulo({ texto, obrigatorio }: { texto: string; obrigatorio?: boolean }) {
  return (
    <span className="text-muted-foreground">
      {texto}
      {obrigatorio ? <span aria-hidden> *</span> : null}
    </span>
  );
}

interface Props {
  open: boolean;
  inicial?: ClienteDaNegociacao;
  contactId?: string | null;
  onOpenChange: (aberto: boolean) => void;
  /** Elemento que abriu o modal ("+"): recebe o foco de volta ao fechar. */
  retornoDoFoco: React.RefObject<HTMLElement | null>;
  /** Chamado após o contato ser criado. Quem chama seleciona o cliente na venda. */
  onSalvo: (cliente: ClienteDaNegociacao, contactId: string) => void;
  /** O que falta para concluir a venda se o cliente fosse este: a lateral acompanha a digitação. */
  pendencias?: (cliente: ClienteDaNegociacao) => readonly FaltaParaConcluir[];
  /** Campo do cliente a destacar ao abrir (ex.: "numero"), vindo da lista da venda. */
  campoInicial?: string;
  /** Pendência de outro setor: quem chama fecha o modal e leva ao campo na venda. */
  onIrParaFora?: (falta: FaltaParaConcluir) => void;
}

const ORDEM: FaltaParaConcluir["setor"][] = [
  "Veículo",
  "Troca",
  "Pagamento",
  "Loja",
  "Entrega e transferência",
  "Contrato",
];

const CAMPOS_DE_ENDERECO = new Set([
  "cep",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
]);

function PendenciasDaVenda({
  faltando,
  onIrPara,
  onIrParaFora,
}: {
  faltando: readonly FaltaParaConcluir[];
  onIrPara: (campo?: string) => void;
  onIrParaFora?: (falta: FaltaParaConcluir) => void;
}) {
  const t = useT();
  const doCliente = faltando.filter((f) => f.setor === "Comprador");
  const outros = faltando.filter((f) => f.setor !== "Comprador");
  const setores = ORDEM.filter((setor) => outros.some((f) => f.setor === setor));
  return (
    <aside
      className="space-y-3 rounded-xl border border-warning-fg/30 bg-warning-bg/40 p-3 text-xs lg:sticky lg:top-0 lg:self-start"
      aria-label={t("O que falta para concluir")}
      data-testid="pdv-cadastro-pendencias"
    >
      <p className="font-semibold text-warning-fg">
        {t("O que falta para concluir")} ({faltando.length})
      </p>
      {faltando.length === 0 ? (
        <p className="text-muted-foreground">{t("Nada pendente para concluir a venda.")}</p>
      ) : null}
      {doCliente.length > 0 ? (
        <div>
          <p className="font-medium text-foreground">{t("Comprador")}</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {doCliente.map((f) => (
              <li key={f.mensagem}>
                <button
                  type="button"
                  className="inline text-left underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => onIrPara(f.campo)}
                >
                  {t(f.mensagem)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {setores.map((setor) => (
        <div key={setor}>
          <p className="font-medium text-foreground">{t(setor)}</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {outros
              .filter((f) => f.setor === setor)
              .map((f) => (
                <li key={f.mensagem}>
                  {onIrParaFora ? (
                    <button
                      type="button"
                      className="inline text-left underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() => onIrParaFora(f)}
                    >
                      {t(f.mensagem)}
                    </button>
                  ) : (
                    t(f.mensagem)
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function Formulario({
  onOpenChange,
  onSalvo,
  onSalvando,
  inicial,
  contactId,
  pendencias,
  campoInicial,
  onIrParaFora,
}: Pick<
  Props,
  | "onOpenChange"
  | "onSalvo"
  | "inicial"
  | "contactId"
  | "pendencias"
  | "campoInicial"
  | "onIrParaFora"
> & {
  onSalvando: (v: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [c, setC] = React.useState<ClienteDaNegociacao>(() => ({ ...VAZIO, ...inicial }));
  const [aba, setAba] = React.useState("pessoais");
  const [tentou, setTentou] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [lendoDocumento, setLendoDocumento] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const emVoo = React.useRef(false);
  const [contatoGravado, setContatoGravado] = React.useState(contactId);
  const [arquivos, setArquivos] = React.useState<
    { file: File; kind: "identidade" | "residencia" }[]
  >([]);
  const [documentos, setDocumentos] = React.useState<DocumentoSalvo[]>([]);

  const set = (campo: keyof ClienteDaNegociacao, valor: string) =>
    setC((x) => ({ ...x, [campo]: valor }));
  const erros = validarCadastroDeCliente(c);
  // O contrato qualifica pessoa física com nacionalidade, estado civil, profissão e RG;
  // pessoa jurídica é qualificada pelo CNPJ. O asterisco marca o que o contrato exige,
  // sem impedir salvar o cadastro incompleto.
  const pf = (c.documento ?? "").replace(/\D/g, "").length !== 14;
  const comRg = Boolean(c.rg?.trim());

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (emVoo.current || lendoDocumento) return;
    setTentou(true);
    setErro(null);
    if (erros.nome || erros.documento) {
      setAba("pessoais");
      return;
    }
    emVoo.current = true;
    setSalvando(true);
    onSalvando(true);
    try {
      let contato: ContatoDoCadastro;
      const corpo = corpoDoContato(c, Boolean(contatoGravado));
      const idExistente = contatoGravado;
      if (idExistente) {
        // Preserva os demais campos personalizados e complementos salvos por outras telas.
        const atual = await apiClient.get<{ data: ContatoDoCadastro }>(
          `/api/v1/contacts/${idExistente}`,
        );
        const res = await apiClient.patch<{ data: ContatoDoCadastro }>(
          `/api/v1/contacts/${idExistente}`,
          {
            ...corpo,
            ...(corpo.custom_fields
              ? {
                  custom_fields: mesclarCadastroDoCliente(
                    atual.data.custom_fields ?? {},
                    corpo.custom_fields,
                  ),
                }
              : {}),
          },
        );
        contato = res.data;
      } else {
        const res = await apiClient.post<{ data: { contact: ContatoDoCadastro } }>(
          "/api/v1/contacts",
          corpo,
        );
        contato = res.data.contact;
      }
      const id = contato?.id;
      if (!id) throw new Error(t("Não foi possível cadastrar o cliente."));
      setContatoGravado(id);
      const anexos = [...documentos];
      for (const arquivo of arquivos) {
        const doc = await salvarArquivoDoCliente(id, arquivo.file, arquivo.kind);
        anexos.push(doc);
        setDocumentos([...anexos]);
        setArquivos((atual) => atual.filter((a) => a !== arquivo));
      }
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation"] });
      qc.invalidateQueries({ queryKey: ["contact", id] });
      toast.success(t("Cadastro do cliente salvo."));
      if ((c.documento ?? "").replace(/\D/g, "").length === 11 && contato.cpf_available === false) {
        // O contato é gravado sem CPF quando a cifra do banco está indisponível:
        // o CPF segue na negociação, mas não no cadastro. Avisa em vez de calar.
        toast.error(
          t("O CPF não foi gravado no cadastro do cliente (cifra do banco indisponível)."),
        );
      }
      onSalvo(
        {
          ...clienteDoContato(contato, c.documento),
          ...(anexos.length ? { documentos: anexos.map((d) => d.id) } : {}),
        },
        id,
      );
      // O wrapper guarda o "salvando" que bloqueia o fechar: sem soltar aqui, a
      // próxima abertura nasceria presa (Escape e clique fora ignorados).
      onSalvando(false);
      onOpenChange(false);
    } catch (err) {
      setErro(
        err instanceof Error && err.message
          ? t(err.message)
          : t("Não foi possível cadastrar o cliente."),
      );
      showApiError(err);
      emVoo.current = false;
      setSalvando(false);
      onSalvando(false);
    }
  }

  const faltando = pendencias?.(c);

  const formulario = React.useRef<HTMLFormElement>(null);
  /** Abre a aba do campo e o deixa vermelho até ser editado. */
  const irAoCampo = React.useCallback((campo?: string) => {
    setAba(campo && CAMPOS_DE_ENDERECO.has(campo) ? "endereco" : "pessoais");
    // Depois de a aba trocar: o campo da aba inativa está oculto.
    window.setTimeout(() => {
      const raiz = formulario.current;
      const alvo = raiz ? acharCampo(raiz, campo ? `cliente.${campo}` : undefined) : null;
      if (alvo) destacarCampo(alvo);
    }, 50);
  }, []);
  // Aberto a partir de uma pendência: depois do foco automático do modal, vai ao campo.
  React.useEffect(() => {
    if (!campoInicial) return;
    const h = window.setTimeout(() => irAoCampo(campoInicial), 120);
    return () => window.clearTimeout(h);
  }, [campoInicial, irAoCampo]);

  return (
    <form
      ref={formulario}
      onSubmit={salvar}
      noValidate
      className={faltando ? "grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]" : undefined}
    >
      {faltando ? (
        <PendenciasDaVenda faltando={faltando} onIrPara={irAoCampo} onIrParaFora={onIrParaFora} />
      ) : null}
      <div className="grid min-w-0 gap-4">
        <DialogHeader>
          <DialogTitle>
            {contactId || inicial ? t("Editar cadastro do cliente") : t("Cadastrar cliente")}
          </DialogTitle>
          <DialogDescription>
            {t("O cliente é vinculado à venda atual assim que for salvo.")}
          </DialogDescription>
        </DialogHeader>

        <AnexarDocumentoCliente
          disabled={salvando || lendoDocumento}
          onArquivo={(file) => setArquivos((a) => [...a, { file, kind: "identidade" }])}
          onLido={(dados) => {
            setC((atual) => preencherComDocumento(atual, dados));
            setAba("pessoais");
          }}
          onOcupado={setLendoDocumento}
        />
        <AnexarDocumentoCliente
          tipo="residencia"
          disabled={salvando || lendoDocumento}
          onArquivo={(file) => setArquivos((a) => [...a, { file, kind: "residencia" }])}
          onLido={(dados) => {
            setC((atual) => preencherComDocumento(atual, dados));
            setAba("endereco");
          }}
          onOcupado={setLendoDocumento}
        />
        <DocumentosDoCliente
          contactId={contatoGravado}
          arquivos={documentos}
          onCarregados={setDocumentos}
        />
        {arquivos.length > 0 && (
          <ul className="grid min-w-0 gap-2" aria-label="Arquivos para salvar com o cliente">
            {arquivos.map((arquivo, i) => (
              <CartaoDocumentoCliente
                key={i}
                nome={arquivo.file.name}
                tipo={arquivo.kind}
                tamanho={arquivo.file.size}
                disabled={salvando || lendoDocumento}
                onRemover={() => setArquivos((a) => a.filter((v) => v !== arquivo))}
              />
            ))}
          </ul>
        )}
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="w-full">
            <TabsTrigger value="pessoais" className="flex-1">
              {t("Dados pessoais")}
            </TabsTrigger>
            <TabsTrigger value="endereco" className="flex-1">
              {t("Endereço")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pessoais" forceMount className="data-[state=inactive]:hidden">
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <label className="col-span-2 block">
                <Rotulo texto={t("Nome completo / razão social")} obrigatorio />
                <input
                  autoFocus
                  value={c.nome}
                  data-campo="cliente.nome"
                  onChange={(e) => set("nome", e.target.value)}
                  aria-invalid={tentou && erros.nome ? true : undefined}
                  className={`${CAMPO} ${tentou && erros.nome ? "border-error" : ""}`}
                  data-testid="pdv-novo-cliente-nome"
                />
                {tentou && erros.nome ? (
                  <span className="mt-1 block text-xs text-error-fg">
                    {t("Informe o nome do cliente.")}
                  </span>
                ) : null}
              </label>
              <label className="col-span-2 block sm:col-span-1">
                <Rotulo texto={t("CPF ou CNPJ")} obrigatorio />
                <input
                  value={c.documento ?? ""}
                  data-campo="cliente.documento"
                  onChange={(e) => set("documento", e.target.value)}
                  onBlur={(e) => set("documento", formatarDocumento(e.target.value))}
                  aria-invalid={erros.documento ? true : undefined}
                  className={`${CAMPO} ${erros.documento ? "border-error" : ""}`}
                  data-testid="pdv-novo-cliente-documento"
                />
                {erros.documento ? (
                  <span className="mt-1 block text-xs text-error-fg">
                    {t("Documento inválido.")}
                  </span>
                ) : null}
              </label>
              <label className="col-span-2 block sm:col-span-1">
                <Rotulo texto={t("Telefone")} />
                <input
                  type="tel"
                  value={c.telefone ?? ""}
                  data-campo="cliente.telefone"
                  onChange={(e) => set("telefone", e.target.value)}
                  className={CAMPO}
                  data-testid="pdv-novo-cliente-telefone"
                />
              </label>
              <label className="col-span-2 block sm:col-span-1">
                <Rotulo texto={t("Nascimento")} />
                <input
                  type="date"
                  value={c.nascimento ?? ""}
                  data-campo="cliente.nascimento"
                  onChange={(e) => set("nascimento", e.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="col-span-2 block sm:col-span-1">
                <Rotulo texto={t("E-mail")} />
                <input
                  type="email"
                  value={c.email ?? ""}
                  data-campo="cliente.email"
                  onChange={(e) => set("email", e.target.value)}
                  className={CAMPO}
                />
              </label>
              <CampoNacionalidade
                campo="cliente.nacionalidade"
                valor={c.nacionalidade ?? ""}
                onChange={(v) => set("nacionalidade", v)}
                className={CAMPO}
                obrigatorio={pf}
              />
              <label className="col-span-2 block sm:col-span-1">
                <Rotulo texto={t("Estado civil")} obrigatorio={pf} />
                <select
                  value={c.estado_civil ?? ""}
                  data-campo="cliente.estado_civil"
                  onChange={(e) => set("estado_civil", e.target.value)}
                  className={CAMPO}
                  data-testid="pdv-novo-cliente-estado-civil"
                >
                  <option value="">—</option>
                  {c.estado_civil &&
                  !(ESTADOS_CIVIS as readonly string[]).includes(c.estado_civil) ? (
                    <option value={c.estado_civil}>{c.estado_civil}</option>
                  ) : null}
                  {ESTADOS_CIVIS.map((e) => (
                    <option key={e} value={e}>
                      {t(e)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block sm:col-span-1">
                <Rotulo texto={t("Profissão")} obrigatorio={pf} />
                <input
                  value={c.profissao ?? ""}
                  data-campo="cliente.profissao"
                  onChange={(e) => set("profissao", e.target.value)}
                  maxLength={80}
                  className={CAMPO}
                  data-testid="pdv-novo-cliente-profissao"
                />
              </label>
              <label className="block">
                <Rotulo texto={t("RG")} obrigatorio={pf} />
                <input
                  value={c.rg ?? ""}
                  data-campo="cliente.rg"
                  onChange={(e) => set("rg", e.target.value)}
                  className={CAMPO}
                  data-testid="pdv-novo-cliente-rg"
                />
              </label>
              <div className="grid grid-cols-[1fr_4.5rem] gap-2">
                <label className="block">
                  <Rotulo texto={t("Órgão expedidor")} obrigatorio={pf && comRg} />
                  <input
                    value={c.rg_orgao_expedidor ?? ""}
                    data-campo="cliente.rg_orgao_expedidor"
                    onChange={(e) => set("rg_orgao_expedidor", e.target.value.toUpperCase())}
                    maxLength={20}
                    className={CAMPO}
                    data-testid="pdv-novo-cliente-rg-orgao"
                  />
                </label>
                <label className="block">
                  <Rotulo texto={t("UF")} obrigatorio={pf && comRg} />
                  <input
                    value={c.rg_uf ?? ""}
                    data-campo="cliente.rg_uf"
                    onChange={(e) => set("rg_uf", e.target.value.toUpperCase().slice(0, 2))}
                    className={CAMPO}
                    data-testid="pdv-novo-cliente-rg-uf"
                  />
                </label>
              </div>
              <label className="block">
                <Rotulo texto={t("CNH")} />
                <input
                  value={c.cnh ?? ""}
                  data-campo="cliente.cnh"
                  onChange={(e) => set("cnh", e.target.value)}
                  className={CAMPO}
                />
              </label>
            </div>
          </TabsContent>

          <TabsContent value="endereco" forceMount className="data-[state=inactive]:hidden">
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <label className="block">
                <Rotulo texto={t("CEP")} obrigatorio />
                <input
                  value={c.cep ?? ""}
                  data-campo="cliente.cep"
                  onChange={(e) => set("cep", e.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="col-span-2 block">
                <Rotulo texto={t("Rua")} obrigatorio />
                <input
                  value={c.endereco ?? ""}
                  data-campo="cliente.endereco"
                  onChange={(e) => set("endereco", e.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <Rotulo texto={t("Número")} obrigatorio />
                <input
                  value={c.numero ?? ""}
                  data-campo="cliente.numero"
                  onChange={(e) => set("numero", e.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="col-span-2 block">
                <Rotulo texto={t("Complemento")} />
                <input
                  value={c.complemento ?? ""}
                  data-campo="cliente.complemento"
                  onChange={(e) => set("complemento", e.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <Rotulo texto={t("Bairro")} obrigatorio />
                <input
                  value={c.bairro ?? ""}
                  data-campo="cliente.bairro"
                  onChange={(e) => set("bairro", e.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <Rotulo texto={t("Cidade")} obrigatorio />
                <input
                  value={c.cidade ?? ""}
                  data-campo="cliente.cidade"
                  onChange={(e) => set("cidade", e.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <Rotulo texto={t("UF")} obrigatorio />
                <input
                  value={c.uf ?? ""}
                  data-campo="cliente.uf"
                  onChange={(e) => set("uf", e.target.value.toUpperCase().slice(0, 2))}
                  className={CAMPO}
                />
              </label>
            </div>
          </TabsContent>
        </Tabs>

        {erro ? (
          <p
            role="alert"
            className="rounded-xl bg-error/10 px-3 py-2 text-sm text-error-fg"
            data-testid="pdv-novo-cliente-erro"
          >
            {erro}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            {t("Cancelar")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={salvando || lendoDocumento}
            data-testid="pdv-novo-cliente-salvar"
          >
            {salvando ? t("Salvando…") : t("Salvar cliente")}
          </Button>
        </DialogFooter>
      </div>
    </form>
  );
}

export function CadastroClienteModal({
  open,
  onOpenChange,
  retornoDoFoco,
  onSalvo,
  inicial,
  contactId,
  pendencias,
  campoInicial,
  onIrParaFora,
}: Props) {
  const [salvando, setSalvando] = React.useState(false);
  // O conteúdo só existe com o modal aberto: cada abertura começa com o formulário limpo.
  return (
    <Dialog open={open} onOpenChange={(v) => (salvando ? undefined : onOpenChange(v))}>
      <DialogContent
        className={`max-h-[90dvh] overflow-y-auto backdrop-blur-sm ${pendencias ? "max-w-xl lg:max-w-4xl" : "max-w-xl"}`}
        data-testid="pdv-cadastro-cliente"
        onCloseAutoFocus={(e) => {
          if (retornoDoFoco.current) {
            e.preventDefault();
            retornoDoFoco.current.focus();
          }
        }}
      >
        <Formulario
          inicial={inicial}
          contactId={contactId}
          onOpenChange={onOpenChange}
          onSalvo={onSalvo}
          onSalvando={setSalvando}
          pendencias={pendencias}
          campoInicial={campoInicial}
          onIrParaFora={onIrParaFora}
        />
      </DialogContent>
    </Dialog>
  );
}
