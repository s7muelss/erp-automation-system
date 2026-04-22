const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

// 🔥 IMPORTANTE: ajuste automático de frontend
const FRONTEND_PATH = path.join(__dirname);

const DB_FILE = path.join(__dirname, 'erp-data.json');

// ─── DB ─────────────────────────────────────────────
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

// ─── PRIORIDADE ─────────────────────────────────────
function calcularPrioridade(valor) {
  if (valor > 5000) return 'Crítica';
  if (valor > 1000) return 'Alta';
  return 'Normal';
}

// ─── LOG ────────────────────────────────────────────
function registrarLog(db, pedidoId, evento, detalhes = {}) {
  db.workflow_logs.push({
    id: db.nextLogId++,
    pedido_id: pedidoId,
    evento,
    detalhes: JSON.stringify(detalhes),
    executado_em: new Date().toISOString(),
  });
}

// ─── RESPONSE JSON ──────────────────────────────────
function json(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// ─── FRONTEND SERVE ────────────────────────────────
function serve(res, file, type) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

// ─── SERVER ────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // 🔥 API ROUTES PREFIXO
  if (pathname.startsWith('/api')) {

    // GET PEDIDOS
    if (method === 'GET' && pathname === '/api/pedidos') {
      const db = carregarDB();
      return json(res, 200, { sucesso: true, dados: db.pedidos.reverse() });
    }

    // POST PEDIDOS
    if (method === 'POST' && pathname === '/api/pedidos') {
      let body = '';
      req.on('data', c => body += c);

      req.on('end', () => {
        const data = JSON.parse(body || '{}');
        const db = carregarDB();

        const novo = {
          id: db.nextId++,
          cliente: data.cliente,
          valor: Number(data.valor),
          prioridade: calcularPrioridade(data.valor),
          status: 'Novo',
          criado_em: new Date().toISOString()
        };

        db.pedidos.push(novo);
        registrarLog(db, novo.id, 'CRIADO', novo);
        salvarDB(db);

        json(res, 201, { sucesso: true, dados: novo });
      });

      return;
    }

    // PUT STATUS
    const match = pathname.match(/^\/api\/pedidos\/(\d+)$/);
    if (method === 'PUT' && match) {
      const id = Number(match[1]);
      let body = '';

      req.on('data', c => body += c);

      req.on('end', () => {
        const { status } = JSON.parse(body || '{}');
        const db = carregarDB();

        const pedido = db.pedidos.find(p => p.id === id);
        if (!pedido) return json(res, 404, { erro: 'não encontrado' });

        pedido.status = status;

        registrarLog(db, id, 'STATUS', { status });
        salvarDB(db);

        json(res, 200, { sucesso: true, dados: pedido });
      });

      return;
    }
  }

  // 🔥 FRONTEND (SPA FIX - IMPORTANTE PRO RENDER)
  if (
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/app.js' ||
    pathname === '/style.css'
  ) {
    let filePath = path.join(FRONTEND_PATH, pathname === '/' ? 'index.html' : pathname);

    let type = 'text/html';
    if (pathname.endsWith('.js')) type = 'application/javascript';
    if (pathname.endsWith('.css')) type = 'text/css';

    return serve(res, filePath, type);
  }

  // 🔥 FALLBACK (resolve página branca no Render)
  const indexFile = path.join(FRONTEND_PATH, 'index.html');
  serve(res, indexFile, 'text/html');
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});