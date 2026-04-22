/**
 * ============================================================
 * ERP AUTOMATION SYSTEM — Backend Principal
 * ============================================================
 * Zero dependências externas — módulos nativos do Node.js
 * Persistência: JSON file (erp-data.json)
 * Módulos: http, fs, path, url
 * ============================================================
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { URL } = require('url');

const PORT     = 3000;
const DB_FILE  = path.join(__dirname, 'erp-data.json');
const FRONTEND = path.join(__dirname, '../frontend');

// ─── Banco de Dados (JSON) ────────────────────────────────────
function carregarDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { pedidos: [], workflow_logs: [], nextId: 1, nextLogId: 1 };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function salvarDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ─── Regras de Negócio ────────────────────────────────────────
function calcularPrioridade(valor) {
  if (valor > 5000) return 'Crítica';
  if (valor > 1000) return 'Alta';
  return 'Normal';
}

// ─── Motor de Workflow ────────────────────────────────────────
function registrarWorkflowLog(db, pedidoId, evento, detalhes = {}) {
  const log = {
    id: db.nextLogId++,
    pedido_id: pedidoId,
    evento,
    detalhes: JSON.stringify(detalhes),
    executado_em: new Date().toISOString(),
  };
  db.workflow_logs.push(log);
  console.log(`[WORKFLOW] [Pedido #${pedidoId}] ${evento}`, detalhes);
}

function simularWebhook(pedido, evento) {
  const payload = { evento, timestamp: new Date().toISOString(), dados: pedido, origem: 'ERP-Automation-System' };
  console.log('\n[WEBHOOK] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`[WEBHOOK] Evento: ${evento}`);
  console.log('[WEBHOOK] Payload:', JSON.stringify(payload, null, 2));
  console.log('[WEBHOOK] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function executarWorkflowCriacao(db, pedidoId, pedido) {
  console.log(`\n[WORKFLOW] ═══ Pipeline iniciado: Pedido #${pedidoId} ═══`);

  // Etapa 1: Pedido registrado
  registrarWorkflowLog(db, pedidoId, 'PEDIDO_CRIADO', { cliente: pedido.cliente, valor: pedido.valor });

  // Etapa 2: Prioridade calculada
  registrarWorkflowLog(db, pedidoId, 'PRIORIDADE_CALCULADA', {
    prioridade: pedido.prioridade,
    regra: pedido.valor > 5000 ? 'valor > 5000' : pedido.valor > 1000 ? 'valor > 1000' : 'valor <= 1000',
  });

  // Etapa 3: Transição automática de status (Novo → Em análise)
  const idx = db.pedidos.findIndex(p => p.id === pedidoId);
  if (idx !== -1) {
    db.pedidos[idx].status = 'Em análise';
    db.pedidos[idx].atualizado_em = new Date().toISOString();
  }
  registrarWorkflowLog(db, pedidoId, 'STATUS_ALTERADO', { de: 'Novo', para: 'Em análise', motivo: 'Transição automática pós-criação' });

  // Etapa 4: Webhook disparado
  simularWebhook({ id: pedidoId, ...pedido }, 'NOVO_PEDIDO');
  registrarWorkflowLog(db, pedidoId, 'WEBHOOK_DISPARADO', { destino: 'https://webhook.empresa.com/pedidos', status: 'simulado' });

  // Etapa 5: Alerta para alta prioridade (condicional)
  if (pedido.prioridade === 'Alta' || pedido.prioridade === 'Crítica') {
    registrarWorkflowLog(db, pedidoId, 'ALERTA_PRIORIDADE_ALTA', {
      mensagem: `Pedido ${pedido.prioridade} requer atenção imediata`,
      notificacoes: ['gestor@empresa.com', 'slack:#pedidos-urgentes'],
    });
    console.log(`[ALERTA] ⚠️  Pedido #${pedidoId} é ${pedido.prioridade} — Equipe notificada!`);
  }

  console.log(`[WORKFLOW] ═══ Pipeline concluído: Pedido #${pedidoId} ═══\n`);
}

// ─── Utilitários HTTP ─────────────────────────────────────────
function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  const extMap = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
  const mime   = extMap[path.extname(filePath)] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

// ─── Servidor e Rotas ─────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const baseUrl   = `http://localhost:${PORT}`;
  const parsedUrl = new URL(req.url, baseUrl);
  const pathname  = parsedUrl.pathname;
  const method    = req.method;

  // CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  // GET /pedidos
  if (method === 'GET' && pathname === '/pedidos') {
    const db   = carregarDB();
    const dados = [...db.pedidos].reverse().map(p => ({
      ...p,
      workflow_logs: db.workflow_logs.filter(l => l.pedido_id === p.id).sort((a, b) => new Date(a.executado_em) - new Date(b.executado_em)),
    }));
    return jsonResponse(res, 200, { sucesso: true, total: dados.length, dados });
  }

  // POST /pedidos
  if (method === 'POST' && pathname === '/pedidos') {
    try {
      const body = await parseBody(req);
      const { cliente, valor, cep, endereco, bairro, cidade, uf } = body;

      if (!cliente || !String(cliente).trim()) return jsonResponse(res, 400, { sucesso: false, erro: 'Nome do cliente é obrigatório.' });
      if (!valor || isNaN(valor) || Number(valor) <= 0) return jsonResponse(res, 400, { sucesso: false, erro: 'Valor do pedido deve ser positivo.' });

      const db    = carregarDB();
      const agora = new Date().toISOString();
      const novoPedido = {
        id: db.nextId++, cliente: String(cliente).trim(), valor: Number(valor),
        prioridade: calcularPrioridade(Number(valor)), status: 'Novo',
        cep: cep || null, endereco: endereco || null, bairro: bairro || null,
        cidade: cidade || null, uf: uf || null, criado_em: agora, atualizado_em: agora,
      };

      db.pedidos.push(novoPedido);
      executarWorkflowCriacao(db, novoPedido.id, novoPedido);  // ★ Pipeline de automação
      salvarDB(db);

      const pedidoAtualizado = db.pedidos.find(p => p.id === novoPedido.id);
      return jsonResponse(res, 201, { sucesso: true, mensagem: 'Pedido criado e workflow executado com sucesso.', dados: pedidoAtualizado });
    } catch (err) {
      return jsonResponse(res, 500, { sucesso: false, erro: err.message });
    }
  }

  // PUT /pedidos/:id
  const matchPut = pathname.match(/^\/pedidos\/(\d+)$/);
  if (method === 'PUT' && matchPut) {
    try {
      const id   = parseInt(matchPut[1]);
      const body = await parseBody(req);
      const { status } = body;
      const statusValidos = ['Novo', 'Em análise', 'Aprovado', 'Recusado', 'Concluído'];

      if (!statusValidos.includes(status)) return jsonResponse(res, 400, { sucesso: false, erro: `Status inválido. Use: ${statusValidos.join(', ')}` });

      const db  = carregarDB();
      const idx = db.pedidos.findIndex(p => p.id === id);
      if (idx === -1) return jsonResponse(res, 404, { sucesso: false, erro: 'Pedido não encontrado.' });

      const statusAnterior = db.pedidos[idx].status;
      db.pedidos[idx].status        = status;
      db.pedidos[idx].atualizado_em = new Date().toISOString();

      registrarWorkflowLog(db, id, 'STATUS_ALTERADO_MANUAL', { de: statusAnterior, para: status, motivo: 'Atualização manual via API' });
      simularWebhook({ id, status }, 'PEDIDO_ATUALIZADO');
      salvarDB(db);

      return jsonResponse(res, 200, { sucesso: true, mensagem: 'Status atualizado com sucesso.', dados: db.pedidos[idx] });
    } catch (err) {
      return jsonResponse(res, 500, { sucesso: false, erro: err.message });
    }
  }

  // GET /pedidos/:id/logs
  const matchLogs = pathname.match(/^\/pedidos\/(\d+)\/logs$/);
  if (method === 'GET' && matchLogs) {
    const id   = parseInt(matchLogs[1]);
    const db   = carregarDB();
    const logs = db.workflow_logs.filter(l => l.pedido_id === id).sort((a, b) => new Date(a.executado_em) - new Date(b.executado_em));
    return jsonResponse(res, 200, { sucesso: true, total: logs.length, dados: logs });
  }

  // Servir arquivos estáticos do frontend
  if (method === 'GET') {
    const staticMap = {
      '/': path.join(FRONTEND, 'index.html'),
      '/index.html': path.join(FRONTEND, 'index.html'),
      '/style.css': path.join(FRONTEND, 'style.css'),
      '/app.js': path.join(FRONTEND, 'app.js'),
    };
    if (staticMap[pathname]) return serveStatic(res, staticMap[pathname]);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Rota não encontrada');
});

carregarDB(); // Inicializa o DB se não existir

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       ERP AUTOMATION SYSTEM — Backend        ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Servidor:  http://localhost:${PORT}            ║`);
  console.log('║  Banco:     erp-data.json                    ║');
  console.log('║  Workflow:  Ativo                            ║');
  console.log('║  Deps:      Zero (Node.js nativo)            ║');
  console.log('╚══════════════════════════════════════════════╝\n');
});

