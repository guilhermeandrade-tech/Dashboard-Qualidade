-- ============================================================
-- AUTOINSP QUALIDADE — Schema Supabase
-- Projeto: suhafzyroeasngowhbzp
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- 1. TABELA: tickets (sincronizado via Intercom API / cron Vercel)
CREATE TABLE IF NOT EXISTS tickets (
  id               BIGINT PRIMARY KEY,
  empresa          TEXT NOT NULL,
  mes_fechamento   TEXT,
  classificacao    TEXT CHECK (classificacao IN ('Dificuldade do Analista','Erro com Ajuste','Fato Novo')),
  titulo           TEXT,
  resumo           TEXT,
  abertura         TIMESTAMPTZ,
  ultimo_retorno   TIMESTAMPTZ,
  sla_horas_corridas FLOAT DEFAULT 0,
  sla_horas_uteis    FLOAT DEFAULT 0,
  status           TEXT DEFAULT 'Fechado' CHECK (status IN ('Aberto','Fechado')),
  link             TEXT,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Índices úteis para os filtros do dashboard
CREATE INDEX IF NOT EXISTS idx_tickets_empresa       ON tickets (empresa);
CREATE INDEX IF NOT EXISTS idx_tickets_mes           ON tickets (mes_fechamento);
CREATE INDEX IF NOT EXISTS idx_tickets_classificacao ON tickets (classificacao);
CREATE INDEX IF NOT EXISTS idx_tickets_status        ON tickets (status);

-- 2. TABELA: quality_scores (sincronizado via Apps Script existente)
CREATE TABLE IF NOT EXISTS quality_scores (
  mes              TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('L','PL')),
  total            INT  DEFAULT 0,
  reabs            INT  DEFAULT 0,
  reabs_op         INT  DEFAULT 0,
  nota_total       FLOAT DEFAULT 0,
  conclusividade   FLOAT DEFAULT 0,
  kpi_reab         FLOAT DEFAULT 0,
  kpi_reab_op      FLOAT DEFAULT 0,
  nota_gram_pct    FLOAT DEFAULT 0,
  nota_est_pct     FLOAT DEFAULT 0,
  nota_met_pct     FLOAT DEFAULT 0,
  nota_tec_pct     FLOAT DEFAULT 0,
  exec_list        JSONB DEFAULT '[]',
  rev_list         JSONB DEFAULT '[]',
  aprov_list       JSONB DEFAULT '[]',
  exec_errs        JSONB DEFAULT '[]',
  rev_errs         JSONB DEFAULT '[]',
  aprov_errs       JSONB DEFAULT '[]',
  err_list         JSONB DEFAULT '[]',
  causa_list       JSONB DEFAULT '[]',
  cliente_list     JSONB DEFAULT '[]',
  esp_list         JSONB DEFAULT '[]',
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (mes, tipo)
);

-- 3. RLS — leitura pública (anon), escrita apenas service_role
ALTER TABLE tickets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_tickets"
  ON tickets FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_quality_scores"
  ON quality_scores FOR SELECT TO anon USING (true);

-- service_role já tem bypass de RLS por padrão (escrita via cron/Apps Script)
