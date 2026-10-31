-- Запустити один раз у Supabase SQL editor.
-- Якщо стара версія (без tenant_id) вже створена — спершу: drop table doc_chunks cascade;
create extension if not exists vector;

create table if not exists doc_chunks (
  id           bigserial primary key,
  tenant_id    text not null,          -- бізнес-клієнт; фільтр додає бекенд, не LLM
  source       text not null,          -- шлях дока, напр. "features.md"
  visibility   text not null default 'internal'
               check (visibility in ('public', 'internal', 'restricted')),
  heading      text,
  content      text not null,
  content_hash text not null,          -- sha256(модель + visibility + content), щоб не перераховувати незмінене
  url          text,
  tools        text[] not null default '{}',
  embedding    vector(768) not null,
  unique (tenant_id, source, content_hash)
);

create index if not exists doc_chunks_tenant_idx on doc_chunks (tenant_id, visibility);
create index if not exists doc_chunks_embedding_idx
  on doc_chunks using hnsw (embedding vector_cosine_ops);

drop function if exists match_chunks(vector, int);

-- Top-k за косинусною схожістю (<=> це косинусна відстань).
-- Лише чанки цього тенанта і лише public: клієнтський агент не може отримати internal/restricted.
create or replace function match_chunks(p_tenant_id text, query_embedding vector(768), match_count int default 3)
returns table (id bigint, source text, heading text, content text, url text, tools text[], similarity float)
language sql stable as $$
  select id, source, heading, content, url, tools,
         1 - (embedding <=> query_embedding) as similarity
  from doc_chunks
  where tenant_id = p_tenant_id and visibility = 'public'
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- RLS увімкнено без політик: доступ лише через service role на сервері
alter table doc_chunks enable row level security;
revoke execute on function match_chunks(text, vector, int) from public, anon, authenticated;

-- Щоб API одразу побачило нову таблицю й функцію
notify pgrst, 'reload schema';
