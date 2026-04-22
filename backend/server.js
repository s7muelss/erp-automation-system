/**
 * ============================================================
 * ERP AUTOMATION SYSTEM — Backend (API ONLY)
 * ============================================================
 * Deploy: Render
 * Responsabilidade: API REST + Workflow
 * Sem frontend
 * ============================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'erp-data.json');

// ─── DB ──────────────────────────────────────────────────────
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

// ─── Regras ─────────────────────────────────────────────────
function calcularPrioridade(valor) {
  if (valor > 5000) return 'Crítica';
  if (valor > 1000) return 'Alta';
  return 'Normal';
}

// ─── Logs ───────────────────────────────────────────────────
function registrarWorkflowLog(db, pedidoId, evento, detalhes = {}) {
  db.workflow_logs.push({
    id: db.nextLogId++,
    pedido_id: pedidoId,
    evento,
    detalhes: JSON.stringify(detalhes),
    executado_em: new Date().toISOString(),
  });
}

// ─── Workflow ───────────────────────────────────────────────
function executarWorkflowCriacao(db, pedidoId, pedido) {
  registrarWorkflowLog(db, pedidoId, 'PEDIDO_CRIADO', pedido);

  registrarWorkflowLog(db, pedidoId, 'PRIORIDADE_CALCULADA', {
    prioridade: pedido.prioridade
  });

  const idx = db.pedidos.findIndex(p => p.id === pedidoId);
  if (idx !== -1) {
    db.pedidos[idx].status = 'Em análise';
  }

  registrarWorkflowLog(db, pedidoId, 'STATUS_ALTERADO', {
    de: 'Novo',
    para: 'Em análise'
  });
}

// ─── Helpers HTTP ───────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function bodyParser(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject('JSON inválido'); }
    });
  });
}

// ─── SERVER ─────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;
  const pathname = url.pathname;

  if (method === 'OPTIONS') return json(res, 204, {});

  const db = carregarDB();

  // ─── GET PEDIDOS ──────────────────────────────────────────
  if (method === 'GET' && pathname === '/pedidos') {
    const dados = [...db.pedidos].reverse().map(p => ({
      ...p,
      workflow_logs: db.workflow_logs.filter(l => l.pedido_id === p.id)
    }));

    return json(res, 200, {
      sucesso: true,
      total: dados.length,
      dados
    });
  }

  // ─── POST PEDIDO ──────────────────────────────────────────
  if (method === 'POST' && pathname === '/pedidos') {
    try {
      const body = await bodyParser(req);
      const { cliente, valor } = body;

      if (!cliente) return json(res, 400, { erro: 'Cliente obrigatório' });
      if (!valor || valor <= 0) return json(res, 400, { erro: 'Valor inválido' });

      const novo = {
        id: db.nextId++,
        cliente,
        valor,
        prioridade: calcularPrioridade(valor),
        status: 'Novo',
        criado_em: new Date().toISOString()
      };

      db.pedidos.push(novo);
      executarWorkflowCriacao(db, novo.id, novo);
      salvarDB(db);

      return json(res, 201, {
        sucesso: true,
        dados: novo
      });

    } catch (e) {
      return json(res, 500, { erro: e.toString() });
    }
  }

  // ─── PUT STATUS ───────────────────────────────────────────
  const match = pathname.match(/^\/pedidos\/(\d+)$/);

  if (method === 'PUT' && match) {
    const id = Number(match[1]);
    const body = await bodyParser(req);

    const idx = db.pedidos.findIndex(p => p.id === id);
    if (idx === -1) return json(res, 404, { erro: 'Não encontrado' });

    db.pedidos[idx].status = body.status;

    registrarWorkflowLog(db, id, 'STATUS_MANUAL', {
      status: body.status
    });

    salvarDB(db);

    return json(res, 200, { sucesso: true, dados: db.pedidos[idx] });
  }

  // ─── DEFAULT ──────────────────────────────────────────────
  return json(res, 404, { erro: 'Rota não encontrada' });
});

// ─── START ──────────────────────────────────────────────────
carregarDB();

server.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});