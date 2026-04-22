/**
 * ERP AUTOMATION SYSTEM — Backend Server
 * Node.js puro (sem Express)
 * Compatível com Render: PORT dinâmica, paths corretos, CORS, SPA fallback
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ─── Configurações ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // OBRIGATÓRIO no Render (não use 'localhost')
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*"; // URL do Vercel em produção
const DATA_FILE = path.join(__dirname, "data", "pedidos.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// ─── MIME Types ───────────────────────────────────────────────────────────────
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".svg":  "image/svg+xml",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
};

// ─── Inicializa arquivo de dados ──────────────────────────────────────────────
function initDataFile() {
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf-8");
    console.log("📁 Arquivo de dados criado:", DATA_FILE);
  }
}

// ─── Helpers de dados ─────────────────────────────────────────────────────────
function lerPedidos() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function salvarPedidos(pedidos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(pedidos, null, 2), "utf-8");
}

function gerarId() {
  return `PED-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
}

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────
function setCORSHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message, details = null) {
  sendJSON(res, statusCode, {
    erro: true,
    mensagem: message,
    ...(details && { detalhes: details }),
    timestamp: new Date().toISOString(),
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Payload muito grande"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON inválido no corpo da requisição"));
      }
    });
    req.on("error", reject);
  });
}

// ─── Workflow de Status ───────────────────────────────────────────────────────
const STATUS_WORKFLOW = {
  "pendente":    ["em_andamento", "cancelado"],
  "em_andamento":["concluido", "cancelado"],
  "concluido":   [],
  "cancelado":   [],
};

function validarTransicaoStatus(statusAtual, novoStatus) {
  const permitidos = STATUS_WORKFLOW[statusAtual] || [];
  return permitidos.includes(novoStatus);
}

// ─── Handlers de API ──────────────────────────────────────────────────────────

// GET /api/pedidos  — lista com filtros opcionais (?status=&cliente=)
function handleGetPedidos(req, res, parsedUrl) {
  const pedidos = lerPedidos();
  const params  = parsedUrl.searchParams;
  let resultado = [...pedidos];

  if (params.get("status")) {
    resultado = resultado.filter(p => p.status === params.get("status"));
  }
  if (params.get("cliente")) {
    const q = params.get("cliente").toLowerCase();
    resultado = resultado.filter(p => p.cliente?.toLowerCase().includes(q));
  }

  sendJSON(res, 200, {
    total: resultado.length,
    pedidos: resultado,
    timestamp: new Date().toISOString(),
  });
}

// GET /api/pedidos/:id
function handleGetPedidoById(req, res, id) {
  const pedidos = lerPedidos();
  const pedido  = pedidos.find(p => p.id === id);
  if (!pedido) return sendError(res, 404, `Pedido '${id}' não encontrado`);
  sendJSON(res, 200, pedido);
}

// POST /api/pedidos
async function handleCreatePedido(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendError(res, 400, err.message);
  }

  const { cliente, descricao, itens, prioridade } = body;

  if (!cliente || typeof cliente !== "string" || cliente.trim() === "") {
    return sendError(res, 400, "Campo 'cliente' é obrigatório");
  }
  if (!descricao || typeof descricao !== "string" || descricao.trim() === "") {
    return sendError(res, 400, "Campo 'descricao' é obrigatório");
  }

  const agora   = new Date().toISOString();
  const novoPedido = {
    id:        gerarId(),
    cliente:   cliente.trim(),
    descricao: descricao.trim(),
    itens:     Array.isArray(itens) ? itens : [],
    prioridade: ["baixa","media","alta"].includes(prioridade) ? prioridade : "media",
    status:    "pendente",
    criadoEm:  agora,
    atualizadoEm: agora,
    logs: [
      {
        id:        `LOG-${Date.now()}`,
        acao:      "criado",
        descricao: "Pedido criado no sistema",
        statusAnterior: null,
        statusNovo: "pendente",
        timestamp: agora,
      },
    ],
  };

  const pedidos = lerPedidos();
  pedidos.push(novoPedido);
  salvarPedidos(pedidos);

  console.log(`✅ Pedido criado: ${novoPedido.id} — ${cliente}`);
  sendJSON(res, 201, novoPedido);
}

// PUT /api/pedidos/:id
async function handleUpdatePedido(req, res, id) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendError(res, 400, err.message);
  }

  const pedidos = lerPedidos();
  const idx     = pedidos.findIndex(p => p.id === id);
  if (idx === -1) return sendError(res, 404, `Pedido '${id}' não encontrado`);

  const pedidoAtual = pedidos[idx];
  const agora       = new Date().toISOString();
  const novoLog     = {
    id:        `LOG-${Date.now()}`,
    timestamp: agora,
  };

  // Atualiza status com validação de workflow
  if (body.status && body.status !== pedidoAtual.status) {
    if (!validarTransicaoStatus(pedidoAtual.status, body.status)) {
      return sendError(res, 422, `Transição inválida: '${pedidoAtual.status}' → '${body.status}'`, {
        statusAtual: pedidoAtual.status,
        transicoesPermitidas: STATUS_WORKFLOW[pedidoAtual.status],
      });
    }
    novoLog.acao           = "status_alterado";
    novoLog.descricao      = `Status alterado de '${pedidoAtual.status}' para '${body.status}'`;
    novoLog.statusAnterior = pedidoAtual.status;
    novoLog.statusNovo     = body.status;
    pedidoAtual.status     = body.status;
  }

  // Atualiza outros campos permitidos
  const camposPermitidos = ["descricao", "itens", "prioridade", "observacoes"];
  const camposAlterados  = [];

  for (const campo of camposPermitidos) {
    if (body[campo] !== undefined) {
      pedidoAtual[campo] = body[campo];
      camposAlterados.push(campo);
    }
  }

  if (!novoLog.acao) {
    if (camposAlterados.length === 0) {
      return sendError(res, 400, "Nenhum campo válido enviado para atualização");
    }
    novoLog.acao      = "atualizado";
    novoLog.descricao = `Campos atualizados: ${camposAlterados.join(", ")}`;
  }

  pedidoAtual.atualizadoEm = agora;
  pedidoAtual.logs         = [...(pedidoAtual.logs || []), novoLog];
  pedidos[idx]             = pedidoAtual;
  salvarPedidos(pedidos);

  console.log(`✏️  Pedido atualizado: ${id}`);
  sendJSON(res, 200, pedidoAtual);
}

// GET /api/pedidos/:id/logs
function handleGetLogs(req, res, id) {
  const pedidos = lerPedidos();
  const pedido  = pedidos.find(p => p.id === id);
  if (!pedido) return sendError(res, 404, `Pedido '${id}' não encontrado`);

  sendJSON(res, 200, {
    pedidoId: id,
    cliente:  pedido.cliente,
    status:   pedido.status,
    totalLogs: (pedido.logs || []).length,
    logs:     pedido.logs || [],
  });
}

// GET /api/health — endpoint de health check para Render
function handleHealth(req, res) {
  sendJSON(res, 200, {
    status:    "ok",
    service:   "ERP Automation System",
    version:   "1.0.0",
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || "development",
  });
}

// ─── Roteador de API ──────────────────────────────────────────────────────────
async function handleAPI(req, res, parsedUrl) {
  const method   = req.method.toUpperCase();
  const pathname = parsedUrl.pathname; // ex: /api/pedidos/PED-123/logs

  // Normaliza: remove trailing slash
  const cleanPath = pathname.replace(/\/$/, "") || "/api";

  // Extrai segmentos depois de /api
  const segments = cleanPath.replace(/^\/api/, "").split("/").filter(Boolean);
  // ex: ['pedidos'] ou ['pedidos','PED-123'] ou ['pedidos','PED-123','logs']

  const recurso = segments[0]; // 'pedidos', 'health'
  const id      = segments[1]; // 'PED-123' ou undefined
  const sub     = segments[2]; // 'logs' ou undefined

  // ── Health check ──
  if (recurso === "health" && method === "GET") {
    return handleHealth(req, res);
  }

  // ── Pedidos ──
  if (recurso === "pedidos") {
    if (!id) {
      if (method === "GET")  return handleGetPedidos(req, res, parsedUrl);
      if (method === "POST") return handleCreatePedido(req, res);
    }
    if (id && !sub) {
      if (method === "GET") return handleGetPedidoById(req, res, id);
      if (method === "PUT") return handleUpdatePedido(req, res, id);
    }
    if (id && sub === "logs") {
      if (method === "GET") return handleGetLogs(req, res, id);
    }
  }

  sendError(res, 404, `Rota de API não encontrada: ${method} ${cleanPath}`);
}

// ─── Servidor de arquivos estáticos (frontend) ────────────────────────────────
function serveStatic(req, res, urlPath) {
  // Normaliza o path para evitar path traversal
  const safePath  = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let   filePath  = path.join(PUBLIC_DIR, safePath);

  // Se for diretório, tenta index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  // Arquivo não existe → SPA fallback → serve index.html
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  // index.html também não existe → pasta public não configurada
  if (!fs.existsSync(filePath)) {
    return sendJSON(res, 200, {
      mensagem: "ERP Automation System — API rodando",
      docs:     "/api/health",
      api:      "/api/pedidos",
      nota:     "Frontend deve ser servido pelo Vercel",
    });
  }

  const ext      = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const content = fs.readFileSync(filePath);
    const isHTML  = mimeType.startsWith("text/html");

    res.writeHead(200, {
      "Content-Type":  mimeType,
      "Content-Length": content.length,
      // HTML não faz cache; assets estáticos podem fazer cache
      "Cache-Control": isHTML ? "no-cache, no-store, must-revalidate" : "public, max-age=86400",
    });
    res.end(content);
  } catch (err) {
    console.error("Erro ao servir arquivo:", filePath, err.message);
    sendError(res, 500, "Erro interno ao ler arquivo");
  }
}

// ─── Request Handler Principal ────────────────────────────────────────────────
async function requestHandler(req, res) {
  const rawUrl = req.url || "/";

  // Sempre define CORS (antes de qualquer saída)
  setCORSHeaders(res);

  // Preflight OPTIONS
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl, `http://${req.headers.host || "localhost"}`);
  } catch {
    return sendError(res, 400, "URL inválida");
  }

  const pathname = parsedUrl.pathname;

  console.log(`${new Date().toISOString()} | ${req.method.padEnd(7)} ${pathname}`);

  // Roteamento principal
  if (pathname.startsWith("/api/") || pathname === "/api") {
    return handleAPI(req, res, parsedUrl);
  }

  // Serve arquivos estáticos / SPA fallback
  return serveStatic(req, res, pathname);
}

// ─── Inicialização ────────────────────────────────────────────────────────────
initDataFile();

const server = http.createServer(requestHandler);

server.listen(PORT, HOST, () => {
  console.log("─".repeat(50));
  console.log(`🚀 ERP Automation System iniciado`);
  console.log(`📡 Servidor: http://${HOST}:${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || "development"}`);
  console.log(`📂 Dados: ${DATA_FILE}`);
  console.log(`🔗 CORS Origin: ${FRONTEND_ORIGIN}`);
  console.log("─".repeat(50));
  console.log("Endpoints disponíveis:");
  console.log("  GET    /api/health");
  console.log("  GET    /api/pedidos");
  console.log("  POST   /api/pedidos");
  console.log("  GET    /api/pedidos/:id");
  console.log("  PUT    /api/pedidos/:id");
  console.log("  GET    /api/pedidos/:id/logs");
  console.log("─".repeat(50));
});

server.on("error", (err) => {
  console.error("❌ Erro no servidor:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`Porta ${PORT} já está em uso`);
  }
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM recebido — encerrando servidor...");
  server.close(() => {
    console.log("✅ Servidor encerrado com sucesso");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n🛑 SIGINT — encerrando...");
  server.close(() => process.exit(0));
});

module.exports = server;
