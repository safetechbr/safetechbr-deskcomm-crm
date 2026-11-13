"use client";

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

const CAMPO =
  "mt-1 h-10 w-full rounded-full border border-border/80 bg-surface px-3.5 text-sm shadow-xs transition-colors focus-visible:border-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/20 disabled:opacity-70";

const VAZIO: ClienteDaNegociacao = { nome: "" };

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
}

function Formulario({
  onOpenChange,
  onSalvo,
  onSalvando,
  inicial,
  contactId,
}: Pick<Props, "onOpenChange" | "onSalvo" | "inicial" | "contactId"> & {
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
        const { reuse_existing_phone: _reutilizar, ...patch } = corpo;
        const res = await apiClient.patch<{ data: ContatoDoCadastro }>(
          `/api/v1/contacts/${idExistente}`,
          {
            ...patch,
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

  return (
    <form onSubmit={salvar} noValidate className="grid gap-4">
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
              <Rotulo texto={t("CPF ou CNPJ")} />
              <input
                value={c.documento ?? ""}
                onChange={(e) => set("documento", e.target.value)}
                onBlur={(e) => set("documento", formatarDocumento(e.target.value))}
                aria-invalid={erros.documento ? true : undefined}
                className={`${CAMPO} ${erros.documento ? "border-error" : ""}`}
                data-testid="pdv-novo-cliente-documento"
              />
              {erros.documento ? (
                <span className="mt-1 block text-xs text-error-fg">{t("Documento inválido.")}</span>
              ) : null}
            </label>
            <label className="col-span-2 block sm:col-span-1">
              <Rotulo texto={t("Telefone")} />
              <input
                type="tel"
                value={c.telefone ?? ""}
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
                onChange={(e) => set("nascimento", e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="col-span-2 block sm:col-span-1">
              <Rotulo texto={t("E-mail")} />
              <input
                type="email"
                value={c.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                className={CAMPO}
              />
            </label>
            <CampoNacionalidade
              valor={c.nacionalidade ?? ""}
              onChange={(v) => set("nacionalidade", v)}
              className={CAMPO}
            />
            <label className="block">
              <Rotulo texto={t("RG")} />
              <input
                value={c.rg ?? ""}
                onChange={(e) => set("rg", e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="block">
              <Rotulo texto={t("CNH")} />
              <input
                value={c.cnh ?? ""}
                onChange={(e) => set("cnh", e.target.value)}
                className={CAMPO}
              />
            </label>
          </div>
        </TabsContent>

        <TabsContent value="endereco" forceMount className="data-[state=inactive]:hidden">
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <label className="block">
              <Rotulo texto={t("CEP")} />
              <input
                value={c.cep ?? ""}
                onChange={(e) => set("cep", e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="col-span-2 block">
              <Rotulo texto={t("Rua")} />
              <input
                value={c.endereco ?? ""}
                onChange={(e) => set("endereco", e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="block">
              <Rotulo texto={t("Número")} />
              <input
                value={c.numero ?? ""}
                onChange={(e) => set("numero", e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="col-span-2 block">
              <Rotulo texto={t("Complemento")} />
              <input
                value={c.complemento ?? ""}
                onChange={(e) => set("complemento", e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="block">
              <Rotulo texto={t("Bairro")} />
              <input
                value={c.bairro ?? ""}
                onChange={(e) => set("bairro", e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="block">
              <Rotulo texto={t("Cidade")} />
              <input
                value={c.cidade ?? ""}
                onChange={(e) => set("cidade", e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="block">
              <Rotulo texto={t("UF")} />
              <input
                value={c.uf ?? ""}
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
}: Props) {
  const [salvando, setSalvando] = React.useState(false);
  // O conteúdo só existe com o modal aberto: cada abertura começa com o formulário limpo.
  return (
    <Dialog open={open} onOpenChange={(v) => (salvando ? undefined : onOpenChange(v))}>
      <DialogContent
        className="max-h-[90dvh] max-w-xl overflow-y-auto backdrop-blur-sm"
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
        />
      </DialogContent>
    </Dialog>
  );
}
