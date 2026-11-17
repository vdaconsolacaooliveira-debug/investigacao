-- =====================================================================
--  SISTEMA DE RELATÓRIOS SST — DB Agronegócios
--  NIAT (FOR 005-001) e 5 Porquês (FOR 005-002)
--
--  Como usar: Supabase → SQL Editor → New query → colar tudo → Run.
--  Pode rodar de novo sem problema (o script é idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. USUÁRIOS (perfil ligado ao login do Supabase)
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  email       text not null default '',
  papel       text not null default 'padrao'   check (papel in ('admin','padrao')),
  situacao    text not null default 'pendente' check (situacao in ('pendente','ativo','bloqueado')),
  criado_em   timestamptz not null default now(),
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users(id)
);

-- Funções de apoio ficam num schema privado (fora da API pública).
-- security definer evita recursão nas regras de acesso.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;
create or replace function privado.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis
                 where id = auth.uid() and papel = 'admin' and situacao = 'ativo');
$$;

create or replace function privado.eh_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis
                 where id = auth.uid() and situacao = 'ativo');
$$;

-- Cria o perfil automaticamente no autocadastro.
-- O PRIMEIRO usuário do sistema vira Administrador já ativo.
-- Os demais entram como Padrão / pendente, aguardando aprovação.
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  primeiro boolean;
begin
  perform pg_advisory_xact_lock(4242);
  select not exists (select 1 from public.perfis) into primeiro;
  insert into public.perfis (id, nome, email, papel, situacao, aprovado_em)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', ''),
    coalesce(new.email, ''),
    case when primeiro then 'admin' else 'padrao' end,
    case when primeiro then 'ativo' else 'pendente' end,
    case when primeiro then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.novo_usuario();

-- Impede que o próprio usuário mude o papel ou a situação dele
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not privado.eh_admin() then
    if new.papel is distinct from old.papel
       or new.situacao is distinct from old.situacao
       or new.email is distinct from old.email then
      raise exception 'Somente o Administrador pode alterar papel ou situação.';
    end if;
  else
    -- Admin não pode se rebaixar nem se bloquear (evita ficar sem administrador)
    if old.id = auth.uid() and (new.papel <> 'admin' or new.situacao <> 'ativo') then
      raise exception 'Você não pode remover o seu próprio acesso de Administrador.';
    end if;
    if new.situacao = 'ativo' and old.situacao <> 'ativo' then
      new.aprovado_em := now();
      new.aprovado_por := auth.uid();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists proteger_perfil on public.perfis;
create trigger proteger_perfil
  before update on public.perfis
  for each row execute function public.proteger_perfil();

alter table public.perfis enable row level security;

drop policy if exists perfis_ver on public.perfis;
create policy perfis_ver on public.perfis for select
  using (id = auth.uid() or privado.eh_admin());

drop policy if exists perfis_editar on public.perfis;
create policy perfis_editar on public.perfis for update
  using (id = auth.uid() or privado.eh_admin())
  with check (id = auth.uid() or privado.eh_admin());

-- ---------------------------------------------------------------------
-- 2. UNIDADES (a sigla entra na numeração do relatório)
-- ---------------------------------------------------------------------
create table if not exists public.unidades (
  sigla    text primary key,
  nome     text not null unique,
  complexo text not null default '',
  ordem    int  not null default 0,
  ativa    boolean not null default true
);

insert into public.unidades (sigla, nome, complexo, ordem) values
  ('ESC', 'Escritório Central',          'Administrativo', 1),
  ('LOG', 'Estacionamento/Logística',    'Administrativo', 2),
  ('FBR', 'Faz. Bom Retiro',             'Chuá',           3),
  ('FCH', 'Faz. Chuá',                   'Chuá',           4),
  ('FSF', 'Faz. Saco São Francisco',     'São Romão',      5),
  ('FST', 'Faz. Saco Tapera',            'São Romão',      6),
  ('FSJ', 'Faz. São João',               'São João',       7),
  ('GBR', 'Granja Bom Retiro',           'Chuá',           8),
  ('GSF', 'Granja Saco São Francisco',   'São Romão',      9),
  ('GSJ', 'Granja São João',             'São João',      10),
  ('GCH', 'Granjas Chuá',                'Chuá',          11)
on conflict (sigla) do nothing;

alter table public.unidades enable row level security;
drop policy if exists unidades_ver on public.unidades;
create policy unidades_ver on public.unidades for select using (auth.uid() is not null);
drop policy if exists unidades_admin on public.unidades;
create policy unidades_admin on public.unidades for all
  using (privado.eh_admin()) with check (privado.eh_admin());

-- ---------------------------------------------------------------------
-- 3. RELATÓRIOS
-- ---------------------------------------------------------------------
create table if not exists public.contadores (
  tipo    text not null,
  unidade text not null,
  ano     int  not null,
  ultimo  int  not null default 0,
  primary key (tipo, unidade, ano)
);
alter table public.contadores enable row level security;  -- sem políticas: só o sistema mexe

create table if not exists public.relatorios (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('niat','5pq')),
  numero          text unique,
  sequencia       int,
  ano             int,
  unidade         text not null references public.unidades(sigla),
  niat_id         uuid references public.relatorios(id) on delete set null,
  classificacao   text check (classificacao in ('grave','leve','incidente')),
  data_ocorrencia date,
  envolvido       text not null default '',
  resumo          text not null default '',
  situacao        text not null default 'rascunho' check (situacao in ('rascunho','concluido')),
  dados           jsonb not null default '{}'::jsonb,
  criado_por      uuid not null default auth.uid() references auth.users(id),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references auth.users(id),
  atualizado_em   timestamptz not null default now()
);

create index if not exists relatorios_criado_por on public.relatorios (criado_por);
create index if not exists relatorios_lista on public.relatorios (atualizado_em desc);
create index if not exists relatorios_niat on public.relatorios (niat_id);

-- Numeração automática: NIAT-FSF-001/2026 e 5PQ-FSF-001/2026
-- (contagem própria por tipo + unidade + ano). O número não muda depois de criado.
create or replace function public.numerar_relatorio()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  seq int;
  base_ano int;
begin
  base_ano := extract(year from coalesce(new.data_ocorrencia, current_date))::int;
  insert into public.contadores as c (tipo, unidade, ano, ultimo)
  values (new.tipo, new.unidade, base_ano, 1)
  on conflict (tipo, unidade, ano) do update set ultimo = c.ultimo + 1
  returning ultimo into seq;

  new.ano       := base_ano;
  new.sequencia := seq;
  new.numero    := case new.tipo when 'niat' then 'NIAT' else '5PQ' end
                   || '-' || new.unidade || '-' || lpad(seq::text, 3, '0') || '/' || base_ano;
  new.criado_por := coalesce(auth.uid(), new.criado_por);
  new.criado_em  := now();
  new.atualizado_por := new.criado_por;
  new.atualizado_em  := now();
  return new;
end $$;

drop trigger if exists numerar_relatorio on public.relatorios;
create trigger numerar_relatorio
  before insert on public.relatorios
  for each row execute function public.numerar_relatorio();

-- Na edição: número, tipo, autor e data de criação ficam travados
create or replace function public.travar_relatorio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id         := old.id;
  new.tipo       := old.tipo;
  new.numero     := old.numero;
  new.sequencia  := old.sequencia;
  new.ano        := old.ano;
  new.unidade    := old.unidade;
  new.criado_por := old.criado_por;
  new.criado_em  := old.criado_em;
  new.atualizado_por := auth.uid();
  new.atualizado_em  := now();
  return new;
end $$;

drop trigger if exists travar_relatorio on public.relatorios;
create trigger travar_relatorio
  before update on public.relatorios
  for each row execute function public.travar_relatorio();

alter table public.relatorios enable row level security;

-- Padrão: vê e edita só os próprios. Administrador: vê e edita todos.
drop policy if exists rel_ver on public.relatorios;
create policy rel_ver on public.relatorios for select
  using (privado.eh_ativo() and (criado_por = auth.uid() or privado.eh_admin()));

drop policy if exists rel_criar on public.relatorios;
create policy rel_criar on public.relatorios for insert
  with check (privado.eh_ativo() and criado_por = auth.uid());

drop policy if exists rel_editar on public.relatorios;
create policy rel_editar on public.relatorios for update
  using (privado.eh_ativo() and (criado_por = auth.uid() or privado.eh_admin()))
  with check (privado.eh_ativo() and (criado_por = auth.uid() or privado.eh_admin()));

drop policy if exists rel_excluir on public.relatorios;
create policy rel_excluir on public.relatorios for delete
  using (privado.eh_admin());

-- Lista com nome do autor (respeita as mesmas regras de acesso)
create or replace view public.lista_relatorios
with (security_invoker = true) as
select r.id, r.tipo, r.numero, r.sequencia, r.ano, r.unidade,
       u.nome as unidade_nome, r.classificacao, r.data_ocorrencia,
       r.envolvido, r.resumo, r.situacao, r.niat_id, n.numero as niat_numero,
       r.criado_por, p.nome as autor, r.criado_em, r.atualizado_em
from public.relatorios r
join public.unidades u on u.sigla = r.unidade
left join public.relatorios n on n.id = r.niat_id
left join public.perfis p on p.id = r.criado_por;

grant select on public.lista_relatorios to authenticated;

-- ---------------------------------------------------------------------
-- 4. FOTOS (Supabase Storage, pasta = id do relatório)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

create or replace function privado.pode_mexer_relatorio(pasta text)
returns boolean language sql stable security definer set search_path = public as $$
  select privado.eh_ativo() and exists (
    select 1 from public.relatorios r
    where r.id::text = pasta
      and (r.criado_por = auth.uid() or privado.eh_admin())
  );
$$;

drop policy if exists fotos_ver on storage.objects;
create policy fotos_ver on storage.objects for select
  using (bucket_id = 'fotos' and privado.pode_mexer_relatorio((storage.foldername(name))[1]));

drop policy if exists fotos_enviar on storage.objects;
create policy fotos_enviar on storage.objects for insert
  with check (bucket_id = 'fotos' and privado.pode_mexer_relatorio((storage.foldername(name))[1]));

drop policy if exists fotos_apagar on storage.objects;
create policy fotos_apagar on storage.objects for delete
  using (bucket_id = 'fotos' and privado.pode_mexer_relatorio((storage.foldername(name))[1]));

-- Permissões das funções
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to authenticated;
revoke execute on function public.novo_usuario() from public, anon, authenticated;
revoke execute on function public.numerar_relatorio() from public, anon, authenticated;
revoke execute on function public.travar_relatorio() from public, anon, authenticated;
revoke execute on function public.proteger_perfil() from public, anon, authenticated;
revoke all on public.contadores from anon, authenticated;
revoke all on public.lista_relatorios from anon;

-- ---------------------------------------------------------------------
-- 5. VÍNCULO PAI (NIAT) → FILHO (5 PORQUÊS)
--    Uma NIAT pode gerar no máximo um 5 Porquês. O filho herda a unidade
--    da NIAT e, depois de ligado, o vínculo não muda mais.
-- ---------------------------------------------------------------------
create unique index if not exists relatorios_um_5pq_por_niat
  on public.relatorios (niat_id) where tipo = '5pq' and niat_id is not null;

create or replace function privado.validar_pai(pai uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  un text;
begin
  select r.unidade into un from public.relatorios r
   where r.id = pai and r.tipo = 'niat'
     and (r.criado_por = auth.uid() or privado.eh_admin());
  if un is null then
    raise exception 'NIAT de origem não encontrada ou sem permissão.';
  end if;
  return un;
end $$;
revoke execute on function privado.validar_pai(uuid) from public, anon;
grant execute on function privado.validar_pai(uuid) to authenticated;

create or replace function public.numerar_relatorio()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  seq int;
  base_ano int;
begin
  if new.tipo = 'niat' then
    new.niat_id := null;
  elsif new.niat_id is not null then
    new.unidade := privado.validar_pai(new.niat_id);
  end if;
  base_ano := extract(year from coalesce(new.data_ocorrencia, current_date))::int;
  insert into public.contadores as c (tipo, unidade, ano, ultimo)
  values (new.tipo, new.unidade, base_ano, 1)
  on conflict (tipo, unidade, ano) do update set ultimo = c.ultimo + 1
  returning ultimo into seq;
  new.ano       := base_ano;
  new.sequencia := seq;
  new.numero    := case new.tipo when 'niat' then 'NIAT' else '5PQ' end
                   || '-' || new.unidade || '-' || lpad(seq::text, 3, '0') || '/' || base_ano;
  new.criado_por := coalesce(auth.uid(), new.criado_por);
  new.criado_em  := now();
  new.atualizado_por := new.criado_por;
  new.atualizado_em  := now();
  return new;
end $$;

create or replace function public.travar_relatorio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id         := old.id;
  new.tipo       := old.tipo;
  new.numero     := old.numero;
  new.sequencia  := old.sequencia;
  new.ano        := old.ano;
  new.unidade    := old.unidade;
  new.criado_por := old.criado_por;
  new.criado_em  := old.criado_em;
  if old.tipo = 'niat' then
    new.niat_id := null;
  elsif old.niat_id is not null then
    new.niat_id := old.niat_id;
  elsif new.niat_id is not null then
    if privado.validar_pai(new.niat_id) <> old.unidade then
      raise exception 'A NIAT escolhida é de outra unidade.';
    end if;
  end if;
  new.atualizado_por := auth.uid();
  new.atualizado_em  := now();
  return new;
end $$;
revoke execute on function public.numerar_relatorio() from public, anon, authenticated;
revoke execute on function public.travar_relatorio() from public, anon, authenticated;

-- Fim do script
