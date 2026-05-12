// api/sync-tickets.js
// Vercel Cron Job — roda todo dia às 06h (vercel.json: "0 6 * * *")
// Busca tickets de qualidade do Intercom e salva no Supabase

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_SERVICE   = process.env.SUPABASE_SERVICE_KEY;
const INTERCOM_TOKEN     = process.env.INTERCOM_TOKEN;
const INTERCOM_INBOX_ID  = process.env.INTERCOM_INBOX_ID; // ID da inbox de qualidade

// Horas úteis: seg–sex 08h–18h (fuso BRT = UTC-3)
function calcSlaUteis(abertura, fechamento) {
  const start = new Date(abertura);
  const end   = new Date(fechamento);
  let horas = 0;
  let cur = new Date(start);
  while (cur < end) {
    const diaSemana = cur.getUTCDay(); // 0=dom,6=sab
    const hora = cur.getUTCHours() - 3; // BRT
    if (diaSemana >= 1 && diaSemana <= 5 && hora >= 8 && hora < 18) {
      horas += 1/60;
    }
    cur = new Date(cur.getTime() + 60 * 1000);
  }
  return Math.round(horas * 10) / 10;
}

function classificar(titulo, resumo) {
  const texto = (titulo + ' ' + resumo).toLowerCase();
  if (texto.includes('fato novo') || texto.includes('nova informação') ||
      texto.includes('novo documento') || texto.includes('novo material') ||
      texto.includes('novas documentaç') || texto.includes('boletim') ||
      texto.includes('reanálise') && texto.includes('nova')) {
    return 'Fato Novo';
  }
  if (texto.includes('ajuste') || texto.includes('adendo') || texto.includes('complemento') ||
      texto.includes('correção') || texto.includes('reescrita') || texto.includes('atualizado') ||
      texto.includes('incluir') || texto.includes('erro')) {
    return 'Erro com Ajuste';
  }
  return 'Dificuldade do Analista';
}

function mesLabel(dateStr) {
  const d = new Date(dateStr);
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${meses[d.getMonth()]}/${d.getFullYear()}`;
}

async function fetchIntercomConversations(token, inboxId, cursor = null) {
  const params = new URLSearchParams({
    inbox_id: inboxId,
    per_page: 150,
    ...(cursor ? { starting_after: cursor } : {})
  });
  const res = await fetch(`https://api.intercom.io/conversations?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Intercom-Version': '2.11'
    }
  });
  if (!res.ok) throw new Error(`Intercom API ${res.status}: ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  // Só executa via cron ou GET com ?force=1
  const isCron  = req.headers['x-vercel-cron'] === '1';
  const isForce = req.query.force === '1';
  if (!isCron && !isForce) {
    return res.status(403).json({ error: 'Acesso negado. Use ?force=1 ou via cron.' });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  const tickets = [];
  let cursor = null;

  try {
    // Página 1
    do {
      const data = await fetchIntercomConversations(INTERCOM_TOKEN, INTERCOM_INBOX_ID, cursor);
      for (const conv of data.conversations || []) {
        const abertura       = conv.created_at * 1000;
        const ultimoRetorno  = (conv.updated_at || conv.created_at) * 1000;
        const slaCorridas    = Math.round((ultimoRetorno - abertura) / 36000) / 100;
        const slaUteis       = calcSlaUteis(abertura, ultimoRetorno);
        const titulo         = conv.source?.subject || '';
        const resumo         = conv.source?.body?.replace(/<[^>]+>/g, '').slice(0, 400) || '';
        const status         = conv.state === 'open' ? 'Aberto' : 'Fechado';
        const empresa        = conv.contacts?.contacts?.[0]?.name || 'Desconhecido';
        const mes            = mesLabel(new Date(abertura));
        const classificacao  = classificar(titulo, resumo);

        tickets.push({
          id: parseInt(conv.id),
          empresa,
          mes_fechamento: mes,
          classificacao,
          titulo,
          resumo,
          abertura: new Date(abertura).toISOString(),
          ultimo_retorno: new Date(ultimoRetorno).toISOString(),
          sla_horas_corridas: slaCorridas,
          sla_horas_uteis: slaUteis,
          status,
          link: `https://app.intercom.com/a/inbox/conversation/${conv.id}`
        });
      }
      cursor = data.pages?.next?.starting_after || null;
    } while (cursor);

    // Upsert em lotes de 50
    const BATCH = 50;
    for (let i = 0; i < tickets.length; i += BATCH) {
      const { error } = await sb.from('tickets').upsert(tickets.slice(i, i + BATCH), { onConflict: 'id' });
      if (error) throw error;
    }

    return res.status(200).json({ ok: true, synced: tickets.length, ts: new Date().toISOString() });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
