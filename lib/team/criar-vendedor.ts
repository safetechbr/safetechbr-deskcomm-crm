import { z } from "zod";
import { loginVendedorSchema } from "@/lib/auth/login-vendedor";
import { interfaceSettingsSchema, interfaceTemDestino } from "@/lib/navigation/interface";
import { ROLES } from "@/lib/schemas/team";

export const criarVendedorSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  username: loginVendedorSchema,
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(128),
  role: z.enum(ROLES).default("agent"),
  interface_settings: interfaceSettingsSchema.default({ preset: "simplificada" }),
}).refine((v) => interfaceTemDestino(v.interface_settings, v.role), {
  path: ["interface_settings"], message: "Selecione ao menos uma área permitida ao papel.",
});
