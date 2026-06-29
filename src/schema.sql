-- ============================================================
--  Almoxarifado Cloud — esquema do banco (PostgreSQL)
--  Multi-hotel: cada hotel é um almoxarifado independente.
--  Desenvolvido por Rafael Almeida.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ---------- Hotéis ----------
CREATE TABLE IF NOT EXISTS hoteis (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo     TEXT,
  nome       TEXT NOT NULL,
  cidade     TEXT DEFAULT '',
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Usuários ----------
CREATE TABLE IF NOT EXISTS usuarios (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username              TEXT NOT NULL UNIQUE,
  nome                  TEXT NOT NULL,
  senha_hash            TEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'atendente'
                          CHECK (role IN ('admin','almoxarifado','atendente')),
  ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vínculo usuário <-> hotéis (N:N). Admin enxerga todos, independente do vínculo.
CREATE TABLE IF NOT EXISTS usuario_hoteis (
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  hotel_id   UUID NOT NULL REFERENCES hoteis(id)   ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, hotel_id)
);

-- ---------- Contadores de documentos por hotel ----------
CREATE TABLE IF NOT EXISTS doc_counters (
  hotel_id        UUID PRIMARY KEY REFERENCES hoteis(id) ON DELETE CASCADE,
  prox_req        INTEGER NOT NULL DEFAULT 1,
  prox_ent        INTEGER NOT NULL DEFAULT 1,
  prox_contagem   INTEGER NOT NULL DEFAULT 1
);

-- ---------- Cadastros ----------
CREATE TABLE IF NOT EXISTS categorias (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id  UUID NOT NULL REFERENCES hoteis(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id  UUID NOT NULL REFERENCES hoteis(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  cnpj      TEXT DEFAULT '',
  contato   TEXT DEFAULT '',
  telefone  TEXT DEFAULT '',
  email     TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS itens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        UUID NOT NULL REFERENCES hoteis(id) ON DELETE CASCADE,
  codigo          TEXT NOT NULL,
  descricao       TEXT NOT NULL,
  unidade         TEXT NOT NULL DEFAULT 'UN',
  categoria_id    UUID REFERENCES categorias(id) ON DELETE SET NULL,
  localizacao     TEXT DEFAULT '',
  estoque_atual   NUMERIC(14,3) NOT NULL DEFAULT 0,
  estoque_minimo  NUMERIC(14,3) NOT NULL DEFAULT 0,
  custo_medio     NUMERIC(14,4) NOT NULL DEFAULT 0,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, codigo)
);

-- ---------- Kardex (movimentações) ----------
CREATE TABLE IF NOT EXISTS movimentacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        UUID NOT NULL REFERENCES hoteis(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
  data            TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo            TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste')),
  quantidade      NUMERIC(14,3) NOT NULL,
  custo_unitario  NUMERIC(14,4) NOT NULL DEFAULT 0,
  saldo_apos      NUMERIC(14,3) NOT NULL,
  documento       TEXT DEFAULT '',
  origem          TEXT DEFAULT '',
  obs             TEXT DEFAULT '',
  usuario         TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_mov_hotel_data ON movimentacoes (hotel_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_mov_item ON movimentacoes (item_id);

-- ---------- Entradas (notas) ----------
CREATE TABLE IF NOT EXISTS entradas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id       UUID NOT NULL REFERENCES hoteis(id) ON DELETE CASCADE,
  numero         TEXT NOT NULL,
  data           TIMESTAMPTZ NOT NULL DEFAULT now(),
  fornecedor_id  UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  nota_fiscal    TEXT DEFAULT '',
  obs            TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS entrada_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_id     UUID NOT NULL REFERENCES entradas(id) ON DELETE CASCADE,
  item_id        UUID NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
  quantidade     NUMERIC(14,3) NOT NULL,
  custo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0
);

-- ---------- Requisições (saídas) com fluxo de aprovação ----------
CREATE TABLE IF NOT EXISTS requisicoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     UUID NOT NULL REFERENCES hoteis(id) ON DELETE CASCADE,
  numero       TEXT NOT NULL,
  data         TIMESTAMPTZ NOT NULL DEFAULT now(),
  requisitante TEXT DEFAULT '',
  setor        TEXT DEFAULT '',
  obs          TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente','aprovada','rejeitada')),
  criado_por   TEXT DEFAULT '',
  aprovado_por TEXT DEFAULT '',
  aprovado_em  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS requisicao_itens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id   UUID NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
  quantidade      NUMERIC(14,3) NOT NULL,
  quantidade_real NUMERIC(14,3),
  custo_unitario  NUMERIC(14,4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_req_hotel_status ON requisicoes (hotel_id, status);

-- ---------- Contagem mensal ----------
CREATE TABLE IF NOT EXISTS contagens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     UUID NOT NULL REFERENCES hoteis(id) ON DELETE CASCADE,
  numero       TEXT NOT NULL,
  data         TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsavel  TEXT DEFAULT '',
  ajustes      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contagem_itens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contagem_id   UUID NOT NULL REFERENCES contagens(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
  sistema       NUMERIC(14,3) NOT NULL,
  contado       NUMERIC(14,3) NOT NULL,
  diverg        NUMERIC(14,3) NOT NULL
);
