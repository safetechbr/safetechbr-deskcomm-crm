import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HandlerCtx } from "@/lib/api/handlers/types";
const m=vi.hoisted(()=>({atualizar:vi.fn()}));
vi.mock("@/lib/contacts/cadastro-manual",()=>({atualizarCadastroManual:m.atualizar}));
import { createContactHandler, patchContactHandler } from "@/app/api/v1/contacts/_handler";
const ctx={organization_id:"11111111-1111-4111-8111-111111111111",actor:{type:"user",id:"22222222-2222-4222-8222-222222222222"},requestId:"req"} as HandlerCtx;
const input={name:"Cliente completo",source:"manual",reuse_existing_phone:true,phone_number:"+5511999998888"};
beforeEach(()=>vi.clearAllMocks());
describe("POST manual usa a atualização canônica",()=>{
 it("contato existente retorna updated e não tenta inserir, criar conversa ou emitir criação",async()=>{
  const contact={id:"original",name:input.name,source:"whatsapp"};m.atualizar.mockResolvedValueOnce(contact);
  const from=vi.fn(),rpc=vi.fn();const db={from,rpc};
  expect(await createContactHandler(db as never,ctx,input)).toEqual({contact,action:"updated"});
  expect(m.atualizar).toHaveBeenCalledWith(db,ctx,input,patchContactHandler);
  expect(from).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 });
 it("se outra requisição criar o mesmo telefone entre busca e insert, recupera o contato",async()=>{
  const contact={id:"concorrente",name:input.name};m.atualizar.mockResolvedValueOnce(null).mockResolvedValueOnce(contact);
  const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),single:vi.fn(async()=>({data:null,error:{code:"23505"}}))};
  const db={from:vi.fn(()=>q),rpc:vi.fn()};
  expect(await createContactHandler(db as never,ctx,input)).toEqual({contact,action:"updated"});
  expect(m.atualizar).toHaveBeenCalledTimes(2);expect(db.rpc).not.toHaveBeenCalled();
 });
});
