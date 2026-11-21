-- manifest: PIS/COFINS passam a vir da regra fiscal (`cst_pis`/`cst_cofins`, default '07'), antes fixos em "07" no código. Aditiva e idempotente.
alter table public.regras_fiscais add column if not exists cst_pis text not null default '07';
alter table public.regras_fiscais add column if not exists cst_cofins text not null default '07';
