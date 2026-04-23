#!/bin/bash
echo "Instalando ERP v2..."
mkdir -p backend/controllers backend/services backend/repositories backend/middlewares backend/utils backend/data frontend

cat > backend/config.js << 'EOFILE_MARKER_XYZ'
/**
 * config.js — Fonte única de configuração
 * Lê variáveis de ambiente e expõe valores com defaults seguros
 */
const path = require("path");

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: "0.0.0.0",
    env: process.env.NODE_ENV || "development",
  },
  cors: {
    origin: process.env.FRONTEND_ORIGIN || "*",
  },
  auth: {
    jwtSecret:   process.env.JWT_SECRET   || "dev-secret-TROQUE-em-producao",
    jwtExpiresIn: parseInt(process.env.JWT_EXPIRES_IN) || 86400, // 24h em segundos
    adminUser:   process.env.ADMIN_USER   || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  },
  data: {
    file: path.join(__dirname, "data", "pedidos.json"),
  },
};

// Aviso em produção se segredos não foram trocados
if (config.server.env === "production") {
  if (config.auth.jwtSecret === "dev-secret-TROQUE-em-producao") {
    console.warn("⚠️  AVISO: JWT_SECRET usando valor padrão em produção!");
  }
  if (config.auth.adminPassword === "admin123") {
    console.warn("⚠️  AVISO: ADMIN_PASSWORD usando valor padrão em produção!");
  }
}

module.exports = config;

EOFILE_MARKER_XYZ
echo "OK: backend/config.js"

cat > backend/router.js << 'EOFILE_MARKER_XYZ'
/**
 * router.js — Mapeamento de rotas para controllers
 *
 * Cada rota define:
 *   - method: verbo HTTP
 *   - pattern: string ou regex para match do pathname
 *   - handler: função do controller
 *   - auth: se true, exige JWT válido
 *
 * Parâmetros de URL são extraídos via named groups do regex.
 */
const { URL }     = require("url");
const corsMiddleware = require("./middlewares/cors");
const authMiddleware = require("./middlewares/auth");
const loggerMiddleware = require("./middlewares/logger");
const errorHandler   = require("./middlewares/error");
const { sendJSON, sendError } = require("./utils/http");

const authCtrl      = require("./controllers/auth.controller");
const pedidosCtrl   = require("./controllers/pedidos.controller");
const dashboardCtrl = require("./controllers/dashboard.controller");

// ── Tabela de rotas ───────────────────────────────────────────────────────────
const routes = [
  // Público
  { method: "GET",  path: /^\/api\/health$/,                  handler: handleHealth,                auth: false },
  { method: "POST", path: /^\/api\/auth\/login$/,             handler: authCtrl.login,              auth: false },

  // Dashboard (protegido)
  { method: "GET",  path: /^\/api\/dashboard\/stats$/,        handler: dashboardCtrl.getStats,      auth: true },

  // Pedidos (protegidos)
  { method: "GET",  path: /^\/api\/pedidos$/,                 handler: pedidosCtrl.listar,          auth: true },
  { method: "POST", path: /^\/api\/pedidos$/,                 handler: pedidosCtrl.criar,           auth: true },
  { method: "GET",  path: /^\/api\/pedidos\/export\/csv$/,    handler: pedidosCtrl.exportarCSV,     auth: true },
  { method: "GET",  path: /^\/api\/pedidos\/(?<id>[^/]+)$/,   handler: pedidosCtrl.buscarPorId,     auth: true },
  { method: "PUT",  path: /^\/api\/pedidos\/(?<id>[^/]+)$/,   handler: pedidosCtrl.atualizar,       auth: true },
  { method: "GET",  path: /^\/api\/pedidos\/(?<id>[^/]+)\/logs$/, handler: pedidosCtrl.buscarLogs,  auth: true },
];

// ── Dispatcher principal ──────────────────────────────────────────────────────
async function dispatch(req, res) {
  const startTime = Date.now();

  // CORS em toda resposta
  corsMiddleware(req, res);

  // Preflight OPTIONS
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    return sendError(res, 400, "URL malformada");
  }

  const pathname = parsedUrl.pathname.replace(/\/$/, "") || "/";

  // Só loga rotas /api
  if (pathname.startsWith("/api")) {
    loggerMiddleware(req, startTime);
  }

  // Encontra rota compatível
  for (const route of routes) {
    if (req.method !== route.method) continue;

    const match = pathname.match(route.path);
    if (!match) continue;

    // Verifica autenticação se necessário
    if (route.auth) {
      const authResult = authMiddleware(req, res);
      if (!authResult.ok) {
        return sendError(res, authResult.status, authResult.message);
      }
    }

    // Parâmetros de URL (ex: id)
    const params = { ...match.groups, searchParams: parsedUrl.searchParams };

    try {
      await route.handler(req, res, params);
    } catch (err) {
      errorHandler(res, err, `${req.method} ${pathname}`);
    }
    return;
  }

  // Nenhuma rota de API bateu
  if (pathname.startsWith("/api")) {
    return sendError(res, 404, `Rota não encontrada: ${req.method} ${pathname}`);
  }

  // Rotas não-API → resposta informativa (frontend está no Vercel)
  sendJSON(res, 200, {
    service:   "ERP Automation System — API",
    version:   "2.0.0",
    status:    "online",
    endpoints: {
      health:  "GET /api/health",
      login:   "POST /api/auth/login",
      pedidos: "GET /api/pedidos",
      stats:   "GET /api/dashboard/stats",
    },
    frontend: "https://erp-automation-system-eight.vercel.app",
  });
}

function handleHealth(req, res) {
  sendJSON(res, 200, {
    status:    "ok",
    service:   "ERP Automation System",
    version:   "2.0.0",
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || "development",
  });
}

module.exports = { dispatch };

EOFILE_MARKER_XYZ
echo "OK: backend/router.js"

cat > backend/server.js << 'EOFILE_MARKER_XYZ'
/**
 * server.js — Ponto de entrada do servidor
 *
 * Responsabilidade ÚNICA: criar o servidor HTTP, vincular o router,
 * inicializar dependências e gerenciar lifecycle (startup/shutdown).
 *
 * Sem lógica de negócio, sem rotas, sem acesso a dados aqui.
 */
const http   = require("http");
const config = require("./config");
const router = require("./router");
const repo   = require("./repositories/pedidos.repository");

// ── Inicialização ─────────────────────────────────────────────────────────────
repo.init();

const server = http.createServer(router.dispatch);

server.listen(config.server.port, config.server.host, () => {
  console.log("─".repeat(52));
  console.log("  🚀 ERP Automation System v2.0");
  console.log(`  📡 http://${config.server.host}:${config.server.port}`);
  console.log(`  🌍 Env: ${config.server.env}`);
  console.log(`  🔒 CORS: ${config.cors.origin}`);
  console.log("─".repeat(52));
  console.log("  Rotas:");
  console.log("  POST /api/auth/login");
  console.log("  GET  /api/health");
  console.log("  GET  /api/dashboard/stats       [JWT]");
  console.log("  GET  /api/pedidos               [JWT]");
  console.log("  POST /api/pedidos               [JWT]");
  console.log("  GET  /api/pedidos/:id           [JWT]");
  console.log("  PUT  /api/pedidos/:id           [JWT]");
  console.log("  GET  /api/pedidos/:id/logs      [JWT]");
  console.log("  GET  /api/pedidos/export/csv    [JWT]");
  console.log("─".repeat(52));
});

server.on("error", err => {
  console.error("❌ Erro fatal:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`   Porta ${config.server.port} já está em uso`);
  }
  process.exit(1);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n🛑 ${signal} — encerrando servidor...`);
  server.close(() => {
    console.log("✅ Servidor encerrado.");
    process.exit(0);
  });

  // Força saída após 10s se pendente
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Captura exceções não tratadas sem derrubar o servidor
process.on("uncaughtException", err => {
  console.error("⚠️  Exceção não tratada:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("⚠️  Promise rejeitada não tratada:", reason);
});

module.exports = server;

EOFILE_MARKER_XYZ
echo "OK: backend/server.js"

cat > backend/package.json << 'EOFILE_MARKER_XYZ'
{
  "name": "erp-automation-system-backend",
  "version": "2.0.0",
  "description": "ERP Automation System — Backend Node.js puro, arquitetura em camadas",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": ["erp", "automation", "nodejs", "portfolio"],
  "license": "MIT"
}

EOFILE_MARKER_XYZ
echo "OK: backend/package.json"

cat > backend/utils/http.js << 'EOFILE_MARKER_XYZ'
/**
 * utils/http.js — Helpers para trabalhar com req/res do Node http nativo
 */

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type":   "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message, details = null) {
  sendJSON(res, statusCode, {
    erro:      true,
    mensagem:  message,
    ...(details ? { detalhes: details } : {}),
    timestamp: new Date().toISOString(),
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
      if (body.length > 512_000) { // 512kb limit
        req.destroy();
        reject(new Error("Payload excede o limite permitido"));
      }
    });

    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Corpo da requisição com JSON inválido"));
      }
    });

    req.on("error", reject);
  });
}

module.exports = { sendJSON, sendError, parseBody };

EOFILE_MARKER_XYZ
echo "OK: backend/utils/http.js"

cat > backend/middlewares/cors.js << 'EOFILE_MARKER_XYZ'
const config = require("../config");

function corsMiddleware(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  config.cors.origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age",       "86400");

  // Segurança básica
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options",        "DENY");
}

module.exports = corsMiddleware;

EOFILE_MARKER_XYZ
echo "OK: backend/middlewares/cors.js"

cat > backend/middlewares/auth.js << 'EOFILE_MARKER_XYZ'
const jwtService = require("../services/jwt.service");

/**
 * Middleware de autenticação JWT.
 * Extrai o token do header Authorization: Bearer <token>
 * e injeta o payload decodificado em req.user.
 * Retorna 401 se ausente ou inválido.
 */
function authMiddleware(req, res) {
  const authHeader = req.headers["authorization"] || "";

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Token de autenticação não fornecido" };
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwtService.verify(token);
    req.user = payload;
    return { ok: true };
  } catch (err) {
    return { ok: false, status: 401, message: err.message };
  }
}

module.exports = authMiddleware;

EOFILE_MARKER_XYZ
echo "OK: backend/middlewares/auth.js"

cat > backend/middlewares/error.js << 'EOFILE_MARKER_XYZ'
function errorHandler(res, err, context = "") {
  const isProd = process.env.NODE_ENV === "production";

  console.error(`[ERROR]${context ? " " + context : ""}:`, err.message || err);

  const body = JSON.stringify({
    erro:      true,
    mensagem:  isProd ? "Erro interno do servidor" : (err.message || "Erro desconhecido"),
    ...(isProd ? {} : { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });

  if (!res.headersSent) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  }
}

module.exports = errorHandler;

EOFILE_MARKER_XYZ
echo "OK: backend/middlewares/error.js"

cat > backend/middlewares/logger.js << 'EOFILE_MARKER_XYZ'
function loggerMiddleware(req, startTime) {
  const duration = Date.now() - startTime;
  const ts       = new Date().toISOString();
  console.log(`${ts} | ${req.method.padEnd(7)} ${req.url.padEnd(40)} — ${duration}ms`);
}

module.exports = loggerMiddleware;

EOFILE_MARKER_XYZ
echo "OK: backend/middlewares/logger.js"

cat > backend/controllers/auth.controller.js << 'EOFILE_MARKER_XYZ'
const authService = require("../services/auth.service");
const { parseBody, sendJSON, sendError } = require("../utils/http");

async function login(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendError(res, 400, err.message);
  }

  const { username, password } = body;

  if (!username || !password) {
    return sendError(res, 400, "Campos 'username' e 'password' são obrigatórios");
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";

  try {
    const result = authService.login(username, password, ip);
    sendJSON(res, 200, result);
  } catch (err) {
    sendError(res, err.status || 401, err.message);
  }
}

module.exports = { login };

EOFILE_MARKER_XYZ
echo "OK: backend/controllers/auth.controller.js"

cat > backend/controllers/pedidos.controller.js << 'EOFILE_MARKER_XYZ'
const pedidosService          = require("../services/pedidos.service");
const { parseBody, sendJSON, sendError } = require("../utils/http");

async function listar(req, res, { searchParams }) {
  try {
    const pedidos = await pedidosService.listar({
      status:  searchParams.get("status")  || undefined,
      cliente: searchParams.get("cliente") || undefined,
    });
    sendJSON(res, 200, { total: pedidos.length, pedidos, timestamp: new Date().toISOString() });
  } catch (err) {
    sendError(res, err.status || 500, err.message);
  }
}

async function buscarPorId(req, res, { id }) {
  try {
    const pedido = await pedidosService.buscarPorId(id);
    sendJSON(res, 200, pedido);
  } catch (err) {
    sendError(res, err.status || 500, err.message);
  }
}

async function criar(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendError(res, 400, err.message);
  }

  try {
    const pedido = await pedidosService.criar(body);
    sendJSON(res, 201, pedido);
  } catch (err) {
    sendError(res, err.status || 500, err.message);
  }
}

async function atualizar(req, res, { id }) {
  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendError(res, 400, err.message);
  }

  try {
    const pedido = await pedidosService.atualizar(id, body, req.user?.sub || "admin");
    sendJSON(res, 200, pedido);
  } catch (err) {
    sendError(res, err.status || 500, err.message, err.detalhes);
  }
}

async function buscarLogs(req, res, { id }) {
  try {
    const logs = await pedidosService.buscarLogs(id);
    sendJSON(res, 200, logs);
  } catch (err) {
    sendError(res, err.status || 500, err.message);
  }
}

async function exportarCSV(req, res) {
  try {
    const pedidos = await pedidosService.listar();

    // Separador ponto e vírgula — padrão do Excel em pt-BR
    const SEP = ";";

    // Tradução dos valores para o usuário final
    const statusPT = {
      pendente:     "Pendente",
      em_andamento: "Em Andamento",
      concluido:    "Concluído",
      cancelado:    "Cancelado",
    };
    const prioridadePT = {
      alta:  "Alta",
      media: "Média",
      baixa: "Baixa",
    };

    function fmtData(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      return d.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      });
    }

    function csvCell(value) {
      const str = String(value ?? "");
      // Envolve em aspas se contém separador, aspas ou quebra de linha
      if (str.includes(SEP) || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    function formatarItens(itens) {
      if (!itens || itens.length === 0) return "Sem itens";
      return itens.map(i => `${i.nome} (${i.quantidade}x)`).join(" | ");
    }

    const cabecalho = [
      "ID do Pedido",
      "Cliente",
      "Descrição",
      "Status",
      "Prioridade",
      "Qtd de Itens",
      "Itens",
      "Observações",
      "Criado Em",
      "Atualizado Em",
      "Concluído Em",
    ].map(csvCell).join(SEP);

    const linhas = pedidos.map(p => [
      csvCell(p.id),
      csvCell(p.cliente),
      csvCell(p.descricao),
      csvCell(statusPT[p.status] || p.status),
      csvCell(prioridadePT[p.prioridade] || p.prioridade),
      csvCell((p.itens || []).length),
      csvCell(formatarItens(p.itens)),
      csvCell(p.observacoes || ""),
      csvCell(fmtData(p.criadoEm)),
      csvCell(fmtData(p.atualizadoEm)),
      csvCell(fmtData(p.concluidoEm)),
    ].join(SEP));

    // sep= instrui o Excel a usar ; como separador automaticamente
    const excel_hint = `sep=${SEP}\n`;
    const bom        = "\uFEFF";
    const csv        = excel_hint + cabecalho + "\n" + linhas.join("\n");
    const content    = bom + csv;

    const nomeArquivo = `pedidos-${new Date().toISOString().slice(0,10)}.csv`;

    res.writeHead(200, {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Content-Length":       Buffer.byteLength(content, "utf-8"),
    });
    res.end(content);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, buscarLogs, exportarCSV };

EOFILE_MARKER_XYZ
echo "OK: backend/controllers/pedidos.controller.js"

cat > backend/controllers/dashboard.controller.js << 'EOFILE_MARKER_XYZ'
const dashboardService        = require("../services/dashboard.service");
const { sendJSON, sendError } = require("../utils/http");

async function getStats(req, res) {
  try {
    const stats = await dashboardService.getStats();
    sendJSON(res, 200, stats);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

module.exports = { getStats };

EOFILE_MARKER_XYZ
echo "OK: backend/controllers/dashboard.controller.js"

cat > backend/services/jwt.service.js << 'EOFILE_MARKER_XYZ'
/**
 * jwt.service.js — Implementação JWT HS256 usando apenas crypto nativo do Node.js
 * Zero dependências externas.
 */
const crypto = require("crypto");
const config = require("../config");

function base64urlEncode(input) {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input) {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function sign(payload) {
  const secret    = config.auth.jwtSecret;
  const expiresIn = config.auth.jwtExpiresIn;
  const now       = Math.floor(Date.now() / 1000);

  const header  = base64urlEncode({ alg: "HS256", typ: "JWT" });
  const body    = base64urlEncode({ ...payload, iat: now, exp: now + expiresIn });
  const sigInput = `${header}.${body}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(sigInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${header}.${body}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== "string") {
    throw new Error("Token inválido");
  }

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Formato de token inválido");

  const [header, body, signature] = parts;
  const secret = config.auth.jwtSecret;

  // Verifica assinatura
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Comparação segura (evita timing attacks)
  const sigBuffer      = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error("Assinatura do token inválida");
  }

  // Decodifica e verifica expiração
  const payload = JSON.parse(base64urlDecode(body));

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expirado");
  }

  return payload;
}

module.exports = { sign, verify };

EOFILE_MARKER_XYZ
echo "OK: backend/services/jwt.service.js"

cat > backend/services/auth.service.js << 'EOFILE_MARKER_XYZ'
const jwtService = require("./jwt.service");
const config     = require("../config");

const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000; // 15 minutos

// Mapa simples em memória para rate limiting de login (reinicia com o servidor)
const loginAttempts = new Map(); // ip → { count, firstAt }

function isLockedOut(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOCKOUT_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, firstAt: Date.now() };
  entry.count += 1;
  loginAttempts.set(ip, entry);
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

/**
 * Valida credenciais e retorna um JWT assinado.
 * @returns {{ token: string, expiresIn: number, user: string }}
 */
function login(username, password, ip = "unknown") {
  if (isLockedOut(ip)) {
    throw Object.assign(
      new Error("Muitas tentativas incorretas. Tente novamente em 15 minutos."),
      { status: 429 }
    );
  }

  const validUser = config.auth.adminUser;
  const validPass = config.auth.adminPassword;

  if (username !== validUser || password !== validPass) {
    recordAttempt(ip);
    throw Object.assign(
      new Error("Credenciais inválidas"),
      { status: 401 }
    );
  }

  clearAttempts(ip);

  const token = jwtService.sign({ sub: username, role: "admin" });

  return {
    token,
    expiresIn: config.auth.jwtExpiresIn,
    user: username,
  };
}

module.exports = { login };

EOFILE_MARKER_XYZ
echo "OK: backend/services/auth.service.js"

cat > backend/services/pedidos.service.js << 'EOFILE_MARKER_XYZ'
/**
 * pedidos.service.js — Regras de negócio do domínio de pedidos
 *
 * Responsabilidades:
 *   - Validação de entrada
 *   - Geração de IDs e logs
 *   - Workflow de status
 *   - Coordena chamadas ao repositório
 */
const repo = require("../repositories/pedidos.repository");

// ── Workflow de status permitidos ──────────────────────────────────────────────
const STATUS_WORKFLOW = {
  pendente:     ["em_andamento", "cancelado"],
  em_andamento: ["concluido",   "cancelado"],
  concluido:    [],
  cancelado:    [],
};

const PRIORIDADES_VALIDAS = ["baixa", "media", "alta"];

// ── Geração de ID ──────────────────────────────────────────────────────────────
function gerarId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random    = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `PED-${timestamp}-${random}`;
}

function gerarLogId() {
  return `LOG-${Date.now().toString(36).toUpperCase()}`;
}

// ── Sanitização de string ──────────────────────────────────────────────────────
function sanitize(str) {
  return String(str || "")
    .trim()
    .replace(/[<>]/g, ""); // remove tags básicas
}

// ── Validação de itens ─────────────────────────────────────────────────────────
function validarItens(itens) {
  if (!Array.isArray(itens)) return [];

  return itens
    .filter(i => i && typeof i.nome === "string" && i.nome.trim())
    .map(i => ({
      nome:       sanitize(i.nome),
      quantidade: Math.max(1, parseInt(i.quantidade) || 1),
    }));
}

// ── Serviços públicos ──────────────────────────────────────────────────────────

async function listar({ status, cliente } = {}) {
  return repo.findAll({ status, cliente });
}

async function buscarPorId(id) {
  const pedido = await repo.findById(id);
  if (!pedido) {
    throw Object.assign(new Error(`Pedido '${id}' não encontrado`), { status: 404 });
  }
  return pedido;
}

async function criar({ cliente, descricao, prioridade, itens }) {
  const clienteSanitizado   = sanitize(cliente);
  const descricaoSanitizada = sanitize(descricao);

  if (!clienteSanitizado) {
    throw Object.assign(new Error("Campo 'cliente' é obrigatório"), { status: 400 });
  }
  if (!descricaoSanitizada) {
    throw Object.assign(new Error("Campo 'descricao' é obrigatório"), { status: 400 });
  }

  const agora = new Date().toISOString();

  const novoPedido = {
    id:           gerarId(),
    cliente:      clienteSanitizado,
    descricao:    descricaoSanitizada,
    prioridade:   PRIORIDADES_VALIDAS.includes(prioridade) ? prioridade : "media",
    status:       "pendente",
    itens:        validarItens(itens),
    criadoEm:     agora,
    atualizadoEm: agora,
    logs: [
      {
        id:             gerarLogId(),
        acao:           "criado",
        descricao:      "Pedido criado no sistema",
        statusAnterior: null,
        statusNovo:     "pendente",
        timestamp:      agora,
        usuario:        "sistema",
      },
    ],
  };

  return repo.create(novoPedido);
}

async function atualizar(id, { status, descricao, itens, prioridade, observacoes }, usuario = "admin") {
  const pedido = await buscarPorId(id);
  const agora  = new Date().toISOString();
  const changes = {};
  const logsNovos = [];

  // ── Mudança de status com validação de workflow ──────────────────────────────
  if (status && status !== pedido.status) {
    const permitidos = STATUS_WORKFLOW[pedido.status] || [];
    if (!permitidos.includes(status)) {
      throw Object.assign(
        new Error(`Transição inválida: '${pedido.status}' → '${status}'. Permitidos: [${permitidos.join(", ")}]`),
        { status: 422, detalhes: { statusAtual: pedido.status, permitidos } }
      );
    }

    changes.status = status;
    if (status === "concluido") changes.concluidoEm = agora;

    logsNovos.push({
      id:             gerarLogId(),
      acao:           "status_alterado",
      descricao:      `Status alterado de '${pedido.status}' para '${status}'`,
      statusAnterior: pedido.status,
      statusNovo:     status,
      timestamp:      agora,
      usuario,
    });
  }

  // ── Outros campos editáveis ──────────────────────────────────────────────────
  const camposEditaveis = { descricao, itens, prioridade, observacoes };
  const camposAlterados = [];

  if (descricao !== undefined) {
    changes.descricao = sanitize(descricao);
    camposAlterados.push("descricao");
  }
  if (itens !== undefined) {
    changes.itens = validarItens(itens);
    camposAlterados.push("itens");
  }
  if (prioridade !== undefined && PRIORIDADES_VALIDAS.includes(prioridade)) {
    changes.prioridade = prioridade;
    camposAlterados.push("prioridade");
  }
  if (observacoes !== undefined) {
    changes.observacoes = sanitize(observacoes);
    camposAlterados.push("observacoes");
  }

  if (camposAlterados.length > 0) {
    logsNovos.push({
      id:        gerarLogId(),
      acao:      "editado",
      descricao: `Campos atualizados: ${camposAlterados.join(", ")}`,
      timestamp: agora,
      usuario,
    });
  }

  if (Object.keys(changes).length === 0) {
    throw Object.assign(new Error("Nenhum campo válido para atualizar"), { status: 400 });
  }

  // Aplica mudanças e appenda logs
  await repo.update(id, changes);

  for (const log of logsNovos) {
    await repo.appendLog(id, log);
  }

  return repo.findById(id);
}

async function buscarLogs(id) {
  const pedido = await buscarPorId(id);
  return {
    pedidoId:  pedido.id,
    cliente:   pedido.cliente,
    status:    pedido.status,
    totalLogs: (pedido.logs || []).length,
    logs:      pedido.logs || [],
  };
}

module.exports = { listar, buscarPorId, criar, atualizar, buscarLogs };

EOFILE_MARKER_XYZ
echo "OK: backend/services/pedidos.service.js"

cat > backend/services/dashboard.service.js << 'EOFILE_MARKER_XYZ'
/**
 * dashboard.service.js — Cálculo de métricas do sistema
 */
const repo = require("../repositories/pedidos.repository");

/**
 * Retorna estatísticas completas para o dashboard.
 */
async function getStats() {
  const todos = await repo.readAll();
  const agora = new Date();

  // ── Contagem por status ────────────────────────────────────────────────────
  const porStatus = {
    pendente:     0,
    em_andamento: 0,
    concluido:    0,
    cancelado:    0,
  };

  for (const p of todos) {
    if (porStatus[p.status] !== undefined) {
      porStatus[p.status]++;
    }
  }

  // ── Pedidos por dia (últimos 7 dias) ──────────────────────────────────────
  const porDia = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(agora);
    d.setDate(d.getDate() - i);
    const dataStr = d.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const total  = todos.filter(p => p.criadoEm?.slice(0, 10) === dataStr).length;
    const concluidos = todos.filter(
      p => p.criadoEm?.slice(0, 10) === dataStr && p.status === "concluido"
    ).length;

    porDia.push({ data: dataStr, total, concluidos });
  }

  // ── Tempo médio de conclusão ──────────────────────────────────────────────
  const concluidosComTempo = todos.filter(
    p => p.status === "concluido" && p.criadoEm && p.concluidoEm
  );

  let tempoMedioHoras = null;

  if (concluidosComTempo.length > 0) {
    const totalMs = concluidosComTempo.reduce((acc, p) => {
      return acc + (new Date(p.concluidoEm) - new Date(p.criadoEm));
    }, 0);
    tempoMedioHoras = parseFloat((totalMs / concluidosComTempo.length / 3_600_000).toFixed(1));
  }

  // ── Taxa de conclusão ─────────────────────────────────────────────────────
  const finalizados  = porStatus.concluido + porStatus.cancelado;
  const taxaConclusao = finalizados > 0
    ? Math.round((porStatus.concluido / finalizados) * 100)
    : null;

  // ── Pedidos de alta prioridade pendentes ──────────────────────────────────
  const altaPrioridadePendentes = todos.filter(
    p => p.prioridade === "alta" && p.status === "pendente"
  ).length;

  return {
    total:                    todos.length,
    porStatus,
    porDia,
    tempoMedioConclucaoHoras: tempoMedioHoras,
    taxaConclusaoPercent:     taxaConclusao,
    altaPrioridadePendentes,
    geradoEm:                 agora.toISOString(),
  };
}

module.exports = { getStats };

EOFILE_MARKER_XYZ
echo "OK: backend/services/dashboard.service.js"

cat > backend/repositories/pedidos.repository.js << 'EOFILE_MARKER_XYZ'
/**
 * pedidos.repository.js — Camada de acesso a dados
 *
 * Responsabilidades:
 *   - Ler e escrever no arquivo JSON de persistência
 *   - Garantir operações atômicas via WriteQueue (evita race condition)
 *   - Expor CRUD primitivo sem lógica de negócio
 */
const fs   = require("fs");
const path = require("path");
const config = require("../config");

const DATA_FILE = config.data.file;

// ── WriteQueue: serializa escritas para evitar race condition ──────────────────
class WriteQueue {
  constructor() {
    this._queue = Promise.resolve();
  }

  enqueue(fn) {
    this._queue = this._queue.then(fn, fn);
    return this._queue;
  }
}

const writeQueue = new WriteQueue();

// ── Inicialização ──────────────────────────────────────────────────────────────
function init() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf-8");
    console.log("📁 Repositório inicializado:", DATA_FILE);
  }
}

// ── Leitura (async) ────────────────────────────────────────────────────────────
async function readAll() {
  try {
    const raw = await fs.promises.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Escrita atômica via fila ───────────────────────────────────────────────────
async function writeAll(pedidos) {
  return writeQueue.enqueue(() =>
    fs.promises.writeFile(DATA_FILE, JSON.stringify(pedidos, null, 2), "utf-8")
  );
}

// ── Operações CRUD ────────────────────────────────────────────────────────────

async function findAll({ status, cliente } = {}) {
  let data = await readAll();

  if (status)  data = data.filter(p => p.status === status);
  if (cliente) data = data.filter(p =>
    p.cliente.toLowerCase().includes(cliente.toLowerCase())
  );

  return data;
}

async function findById(id) {
  const data = await readAll();
  return data.find(p => p.id === id) || null;
}

async function create(pedido) {
  const data = await readAll();
  data.push(pedido);
  await writeAll(data);
  return pedido;
}

async function update(id, changes) {
  const data = await readAll();
  const idx  = data.findIndex(p => p.id === id);
  if (idx === -1) return null;

  data[idx] = { ...data[idx], ...changes, atualizadoEm: new Date().toISOString() };
  await writeAll(data);
  return data[idx];
}

async function appendLog(id, logEntry) {
  const data = await readAll();
  const idx  = data.findIndex(p => p.id === id);
  if (idx === -1) return null;

  data[idx].logs        = [...(data[idx].logs || []), logEntry];
  data[idx].atualizadoEm = new Date().toISOString();
  await writeAll(data);
  return data[idx];
}

module.exports = { init, findAll, findById, create, update, appendLog, readAll };

EOFILE_MARKER_XYZ
echo "OK: backend/repositories/pedidos.repository.js"

cat > frontend/index.html << 'EOFILE_MARKER_XYZ'
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ERP Automation System</title>
  <link rel="stylesheet" href="style.css" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234f8ef7' stroke-width='1.5'><path stroke-linecap='round' stroke-linejoin='round' d='M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3'/></svg>" />
</head>
<body>

<!-- ─── Tela de Login ──────────────────────────────────────────────────────── -->
<div id="login-screen" class="login-screen hidden">
  <div class="login-card">
    <div class="login-brand">
      <svg class="login-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
      </svg>
      <h1>ERP Automation</h1>
      <p>Sistema de Gestão de Pedidos</p>
    </div>
    <div id="login-error" class="login-error hidden"></div>
    <div class="form-group">
      <label for="l-user">Usuário</label>
      <input type="text" id="l-user" placeholder="admin" autocomplete="username" />
    </div>
    <div class="form-group">
      <label for="l-pass">Senha</label>
      <input type="password" id="l-pass" placeholder="••••••••" autocomplete="current-password" />
    </div>
    <button class="btn btn-primary btn-full" id="login-btn" onclick="Auth.login()">
      Entrar
    </button>
    <div id="login-coldstart-hint" class="login-coldstart hidden">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
      </svg>
      O servidor está acordando (pode levar até 50s no plano gratuito do Render). Aguarde...
    </div>
    <p class="login-hint">Credenciais padrão: admin / admin123</p>
  </div>
</div>

<!-- ─── App Principal ──────────────────────────────────────────────────────── -->
<div id="app" class="hidden">

  <aside class="sidebar">
    <div class="sidebar-brand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
      </svg>
      <div>
        <span class="brand-title">ERP System</span>
        <span class="brand-sub">Automation</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <a href="#" class="nav-item active" data-page="dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <span>Dashboard</span>
      </a>

      <a href="#" class="nav-item" data-page="pedidos">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
        <span>Pedidos</span>
      </a>

      <a href="#" class="nav-item" data-page="novo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span>Novo Pedido</span>
      </a>
    </nav>

    <div class="sidebar-footer">
      <span id="api-status" class="api-badge checking">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
        </svg>
        Verificando...
      </span>
      <button class="btn-logout" onclick="Auth.logout()" title="Sair">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
        <span>Sair</span>
      </button>
    </div>
  </aside>

  <main class="main-content">
    <header class="top-bar">
      <h1 id="page-title">Dashboard</h1>
      <div class="top-bar-actions">
        <button class="btn btn-icon" onclick="App.exportarCSV()" title="Exportar CSV">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
        <button class="btn btn-secondary btn-icon-text" onclick="App.refreshData()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Atualizar
        </button>
      </div>
    </header>

    <div id="toast-container"></div>

    <!-- ── Dashboard ───────────────────────────────────────────── -->
    <section id="page-dashboard" class="page active">
      <div class="stats-grid" id="stats-grid">
        <div class="stat-card skeleton-card"><div class="skeleton" style="height:80px"></div></div>
        <div class="stat-card skeleton-card"><div class="skeleton" style="height:80px"></div></div>
        <div class="stat-card skeleton-card"><div class="skeleton" style="height:80px"></div></div>
        <div class="stat-card skeleton-card"><div class="skeleton" style="height:80px"></div></div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header"><h2>Pedidos Recentes</h2></div>
          <div class="card-body" id="recent-pedidos">
            <div class="skeleton" style="height:68px;margin-bottom:8px"></div>
            <div class="skeleton" style="height:68px;margin-bottom:8px"></div>
            <div class="skeleton" style="height:68px"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2>Volume (7 dias)</h2></div>
          <div class="card-body">
            <div id="chart-container">
              <div class="skeleton" style="height:140px"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Pedidos ─────────────────────────────────────────────── -->
    <section id="page-pedidos" class="page">
      <div class="page-toolbar">
        <div class="filter-group">
          <label>Status</label>
          <select id="filter-status" onchange="App.filterPedidos()">
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Cliente</label>
          <input type="text" id="filter-cliente" placeholder="Buscar..." oninput="App.filterPedidos()" />
        </div>
      </div>
      <div id="pedidos-container">
        <div class="skeleton" style="height:90px;margin-bottom:10px"></div>
        <div class="skeleton" style="height:90px;margin-bottom:10px"></div>
        <div class="skeleton" style="height:90px"></div>
      </div>
    </section>

    <!-- ── Novo Pedido ─────────────────────────────────────────── -->
    <section id="page-novo" class="page">
      <div class="novo-pedido-layout">

        <!-- Coluna principal: formulário -->
        <div class="novo-pedido-form">

          <!-- Bloco 1: Dados do cliente -->
          <div class="form-block">
            <div class="form-block-title">
              <span class="form-block-num">1</span>
              Dados do Cliente
            </div>
            <div class="form-block-body">
              <div class="form-row-2">
                <div class="form-group">
                  <label for="f-cliente">Nome do cliente *</label>
                  <input type="text" id="f-cliente"
                    placeholder="Ex: Empresa XPTO Ltda."
                    oninput="App.updateSummary()" />
                  <span class="field-error" id="err-cliente"></span>
                </div>
                <div class="form-group">
                  <label for="f-prioridade">Prioridade</label>
                  <select id="f-prioridade" onchange="App.updateSummary()">
                    <option value="baixa">🟢 Baixa</option>
                    <option value="media" selected>🟡 Média</option>
                    <option value="alta">🔴 Alta</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="f-descricao">Descrição do pedido *</label>
                <textarea id="f-descricao" rows="3"
                  placeholder="Descreva o que está sendo solicitado, contexto, requisitos..."
                  oninput="App.updateSummary()"></textarea>
                <span class="field-error" id="err-descricao"></span>
              </div>
              <div class="form-group">
                <label for="f-obs">Observações <span class="label-opt">opcional</span></label>
                <input type="text" id="f-obs"
                  placeholder="Ex: Entregar até sexta-feira, atenção especial ao embalamento..." />
              </div>
            </div>
          </div>

          <!-- Bloco 2: Itens -->
          <div class="form-block">
            <div class="form-block-title">
              <span class="form-block-num">2</span>
              Itens do Pedido
              <span class="form-block-count" id="itens-count">0 item</span>
            </div>
            <div class="form-block-body">
              <div id="itens-container"></div>
              <button class="btn-add-item" onclick="App.addItem()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                Adicionar item
              </button>
            </div>
          </div>

          <!-- Ações -->
          <div class="form-footer">
            <button class="btn btn-secondary" onclick="App.navigate('pedidos')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/>
              </svg>
              Cancelar
            </button>
            <button class="btn btn-primary" id="btn-criar" onclick="App.criarPedido()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              Criar Pedido
            </button>
          </div>

        </div>

        <!-- Coluna lateral: resumo ao vivo -->
        <aside class="novo-pedido-summary">
          <div class="summary-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
            </svg>
            Resumo do Pedido
          </div>

          <div class="summary-body">
            <div class="summary-field">
              <span class="summary-label">Cliente</span>
              <span class="summary-value" id="sum-cliente">—</span>
            </div>
            <div class="summary-field">
              <span class="summary-label">Prioridade</span>
              <span class="summary-value" id="sum-prioridade">
                <span class="prio-badge prio-media">Média</span>
              </span>
            </div>
            <div class="summary-field">
              <span class="summary-label">Descrição</span>
              <span class="summary-value summary-desc" id="sum-descricao">—</span>
            </div>

            <div class="summary-divider"></div>

            <div class="summary-field">
              <span class="summary-label">Itens</span>
              <span class="summary-value" id="sum-itens-count">0 item</span>
            </div>

            <div id="sum-itens-list" class="summary-itens"></div>

            <div class="summary-divider"></div>

            <div class="summary-status">
              <div class="status-badge status-pending" style="width:100%;justify-content:center;padding:6px 0;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Será criado como Pendente
              </div>
            </div>
          </div>

          <div class="summary-tip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
            </svg>
            O resumo atualiza em tempo real conforme você preenche o formulário.
          </div>
        </aside>

      </div>
    </section>

    <!-- ── Modal ───────────────────────────────────────────────── -->
    <div id="modal-overlay" class="modal-overlay hidden" onclick="App.closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <button class="modal-close" onclick="App.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div id="modal-content"></div>
      </div>
    </div>

    <!-- ── Dialog de Confirmação ───────────────────────────────── -->
    <div id="confirm-overlay" class="modal-overlay hidden">
      <div class="confirm-dialog">
        <div id="confirm-icon" class="confirm-icon"></div>
        <h3 id="confirm-title"></h3>
        <p id="confirm-message"></p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" onclick="App.confirmCancel()">Cancelar</button>
          <button class="btn btn-danger" id="confirm-ok" onclick="App.confirmOk()">Confirmar</button>
        </div>
      </div>
    </div>

  </main>
</div>

<script src="app.js"></script>
</body>
</html>

EOFILE_MARKER_XYZ
echo "OK: frontend/index.html"

cat > frontend/app.js << 'EOFILE_MARKER_XYZ'
/**
 * ERP Automation System — Frontend v2.0
 *
 * Melhorias desta versão:
 *  - Autenticação JWT (login/logout/token refresh automático)
 *  - State management real para itens do formulário (sem manipulação direta de DOM)
 *  - Sanitização de output (previne XSS)
 *  - Loading skeletons em vez de texto "Carregando..."
 *  - Confirmação antes de ações destrutivas
 *  - Mini gráfico SVG de barras no dashboard
 *  - Exportação CSV
 *  - Timeout + mensagem de cold start do Render
 *  - Retry automático em falha de rede
 */

// ─── Configuração ─────────────────────────────────────────────────────────────
const CONFIG = {
  API_BASE: (() => {
    if (window.__API_URL__) return window.__API_URL__.replace(/\/$/, "");
    const origin = window.location.origin;
    if (origin.includes("vercel.app") || origin.includes("vercel")) {
      return "https://erp-automation-system.onrender.com/api";
    }
    if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      return `${origin}/api`;
    }
    return "http://localhost:3000/api";
  })(),
  REQUEST_TIMEOUT_MS: 12_000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

const STATUS_META = {
  pendente:     { label: "Pendente",      cls: "status-pending",   iconPath: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
  em_andamento: { label: "Em Andamento",  cls: "status-progress",  iconPath: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
  concluido:    { label: "Concluído",     cls: "status-done",      iconPath: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  cancelado:    { label: "Cancelado",     cls: "status-canceled",  iconPath: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
};

const PRIO_META = {
  alta:  { label: "Alta",  cls: "prio-alta" },
  media: { label: "Média", cls: "prio-media" },
  baixa: { label: "Baixa", cls: "prio-baixa" },
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = "info", duration = 3500) {
  const container = $("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const Auth = {
  TOKEN_KEY: "erp_token",

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  isLoggedIn() {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
      return payload.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  },

  showLogin(reason = null) {
    $("login-screen").classList.remove("hidden");
    $("app").classList.add("hidden");
    // Mostra motivo do logout se houver (ex: sessão expirada)
    if (reason) {
      const errEl = $("login-error");
      errEl.textContent = reason;
      errEl.classList.remove("hidden");
    }
    setTimeout(() => $("l-user").focus(), 100);
  },

  showApp() {
    $("login-screen").classList.add("hidden");
    $("app").classList.remove("hidden");
  },

  async login() {
    const username = $("l-user").value.trim();
    const password = $("l-pass").value;
    const btn      = $("login-btn");
    const errEl    = $("login-error");

    errEl.classList.add("hidden");

    if (!username || !password) {
      errEl.textContent = "Preencha usuário e senha";
      errEl.classList.remove("hidden");
      return;
    }

    btn.disabled = true;

    // Timer progressivo: informa sobre cold start após 4s
    let coldStartTimer = setTimeout(() => {
      btn.textContent = "Aguardando servidor...";
      const hint = $("login-coldstart-hint");
      if (hint) hint.classList.remove("hidden");
    }, 4000);

    btn.textContent = "Entrando...";

    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 55_000); // 55s para Render cold start

      const res = await fetch(`${CONFIG.API_BASE}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username, password }),
        signal:  controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensagem || "Credenciais inválidas");

      this.setToken(data.token);
      $("l-pass").value = "";
      const hint = $("login-coldstart-hint");
      if (hint) hint.classList.add("hidden");
      this.showApp();
      App.init();
    } catch (err) {
      let msg = err.message;
      if (err.name === "AbortError") {
        msg = "O servidor demorou demais para responder. Tente novamente.";
      }
      errEl.textContent = msg;
      errEl.classList.remove("hidden");
    } finally {
      clearTimeout(coldStartTimer);
      btn.disabled    = false;
      btn.textContent = "Entrar";
      const hint = $("login-coldstart-hint");
      if (hint) hint.classList.add("hidden");
    }
  },

  logout(reason = null) {
    this.clearToken();
    App.state = { pedidos: [], page: "dashboard", formItens: [] };
    this.showLogin(reason);
  },
};

// ─── API Client ───────────────────────────────────────────────────────────────
const API = {
  async request(method, path, body = null) {
    const url        = `${CONFIG.API_BASE}${path}`;
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

    const opts = {
      method,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${Auth.getToken()}`,
      },
      signal: controller.signal,
    };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res  = await fetch(url, opts);
      clearTimeout(timeoutId);

      if (res.status === 401) {
        Auth.clearToken();
        Auth.showLogin("Sua sessão expirou. Faça login novamente.");
        throw new Error("Sessão expirada");
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.mensagem || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("A API demorou mais de 12s para responder. Se for o primeiro acesso do dia, o servidor pode estar iniciando (Render free tier). Tente novamente em alguns segundos.");
      }
      throw err;
    }
  },

  get:  (path)       => API.request("GET",  path),
  post: (path, body) => API.request("POST", path, body),
  put:  (path, body) => API.request("PUT",  path, body),
};

// ─── App ──────────────────────────────────────────────────────────────────────
const App = {
  state: {
    pedidos:   [],
    page:      "dashboard",
    formItens: [{ id: 1, nome: "", quantidade: 1 }],
  },

  _confirmCallback: null,
  _filterTimer:     null,

  // ── Navegação ──────────────────────────────────────────────────
  navigate(page) {
    this.state.page = page;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

    $(`page-${page}`)?.classList.add("active");
    document.querySelector(`[data-page="${page}"]`)?.classList.add("active");

    const titles = { dashboard: "Dashboard", pedidos: "Pedidos", novo: "Novo Pedido" };
    $("page-title").textContent = titles[page] || page;

    if (page === "dashboard") this.loadDashboard();
    if (page === "pedidos")   this.loadPedidos();
  },

  // ── Dashboard ──────────────────────────────────────────────────
  async loadDashboard() {
    try {
      const stats = await API.get("/dashboard/stats");
      this.renderStats(stats);
      this.renderChart(stats.porDia);

      const { pedidos } = await API.get("/pedidos");
      this.state.pedidos = pedidos;

      const recentes = [...pedidos].reverse().slice(0, 5);
      $("recent-pedidos").innerHTML = recentes.length
        ? recentes.map(p => this.renderPedidoCard(p)).join("")
        : `<p class="empty-state">Nenhum pedido ainda. <a href="#" onclick="App.navigate('novo')">Criar o primeiro</a></p>`;
    } catch (err) {
      const isColdStart = err.message.includes("12s") || err.message.includes("Render");
      $("recent-pedidos").innerHTML = `
        <div class="error-state">
          <p>${isColdStart
            ? "⏳ O servidor está iniciando. Isso pode levar até 50s no Render gratuito."
            : "❌ " + esc(err.message)
          }</p>
          <button class="btn btn-ghost btn-sm" style="margin-top:10px"
            onclick="App.loadDashboard()">Tentar novamente</button>
        </div>`;
      // Limpa stats para não mostrar valores antigos/errados
      $("stats-grid").innerHTML = `
        <div class="stat-card"><div class="stat-icon pending"></div>
          <div class="stat-body"><span class="stat-value">—</span><span class="stat-label">Pendentes</span></div></div>
        <div class="stat-card"><div class="stat-icon progress"></div>
          <div class="stat-body"><span class="stat-value">—</span><span class="stat-label">Em Andamento</span></div></div>
        <div class="stat-card"><div class="stat-icon done"></div>
          <div class="stat-body"><span class="stat-value">—</span><span class="stat-label">Concluídos</span></div></div>
        <div class="stat-card"><div class="stat-icon total"></div>
          <div class="stat-body"><span class="stat-value">—</span><span class="stat-label">Total</span></div></div>`;
    }
  },

  renderStats(stats) {
    const { total, porStatus, tempoMedioConclucaoHoras, taxaConclusaoPercent } = stats;

    $("stats-grid").innerHTML = `
      <div class="stat-card">
        <div class="stat-icon pending">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="stat-body">
          <span class="stat-value">${porStatus.pendente}</span>
          <span class="stat-label">Pendentes</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon progress">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/>
          </svg>
        </div>
        <div class="stat-body">
          <span class="stat-value">${porStatus.em_andamento}</span>
          <span class="stat-label">Em Andamento</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon done">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="stat-body">
          <span class="stat-value">${porStatus.concluido}</span>
          <span class="stat-label">Concluídos${taxaConclusaoPercent !== null ? ` <small>(${taxaConclusaoPercent}%)</small>` : ""}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon total">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>
          </svg>
        </div>
        <div class="stat-body">
          <span class="stat-value">${total}</span>
          <span class="stat-label">Total${tempoMedioConclucaoHoras !== null ? ` · ${tempoMedioConclucaoHoras}h méd.` : ""}</span>
        </div>
      </div>`;
  },

  renderChart(porDia) {
    if (!porDia?.length) return;

    // ── Dimensões fixas do viewBox (não escalam com o container) ──
    const W    = 420;   // largura do viewBox
    const H    = 160;   // altura do viewBox — CSS limita o render real
    const padL = 8;
    const padR = 8;
    const padT = 20;    // espaço acima das barras (para valor)
    const padB = 36;    // espaço abaixo (para label de data)
    const chartH = H - padT - padB;   // altura útil das barras = 104px

    // Garante que maxVal ≥ 1 para evitar divisão por zero
    // e ≥ 4 para que barra com valor 1 não ocupe 100% da altura
    const maxVal = Math.max(...porDia.map(d => d.total), 4);

    const barW = (W - padL - padR) / porDia.length;

    // ── Linhas de grade horizontais ────────────────────────────────
    const gridSteps = 4;
    const gridLines = Array.from({ length: gridSteps + 1 }, (_, i) => {
      const yGrid = padT + (chartH / gridSteps) * i;
      const val   = Math.round(maxVal - (maxVal / gridSteps) * i);
      return `
        <line x1="${padL}" y1="${yGrid}" x2="${W - padR}" y2="${yGrid}"
          stroke="rgba(255,255,255,.06)" stroke-width="1" />
        <text x="${padL - 2}" y="${yGrid + 3.5}"
          text-anchor="end" class="bar-label" opacity=".5">${i === 0 ? val : ""}</text>`;
    }).join("");

    // ── Barras ─────────────────────────────────────────────────────
    const bars = porDia.map((d, i) => {
      const ratio    = d.total / maxVal;
      const barH     = Math.max(ratio > 0 ? 6 : 3, ratio * chartH);
      const x        = padL + i * barW + barW * 0.18;
      const wBar     = barW * 0.64;
      const y        = padT + chartH - barH;

      const ratioC   = d.concluidos / maxVal;
      const barHConc = Math.max(0, ratioC * chartH);
      const yConc    = padT + chartH - barHConc;

      const dateLabel = fmtDateShort(d.data + "T12:00:00");

      return `
        <rect x="${x}" y="${y}" width="${wBar}" height="${barH}"
          rx="3" class="${d.total > 0 ? "bar-total" : "bar-empty"}" />
        ${barHConc > 0 ? `
        <rect x="${x}" y="${yConc}" width="${wBar}" height="${barHConc}"
          rx="3" class="bar-concluido" />` : ""}
        <text x="${x + wBar / 2}" y="${padT + chartH + 14}"
          text-anchor="middle" class="bar-label">${dateLabel}</text>
        ${d.total > 0 ? `
        <text x="${x + wBar / 2}" y="${y - 5}"
          text-anchor="middle" class="bar-value">${d.total}</text>` : ""}`;
    }).join("");

    $("chart-container").innerHTML = `
      <svg
        viewBox="0 0 ${W} ${H}"
        width="100%"
        height="160"
        preserveAspectRatio="xMidYMid meet"
        class="bar-chart"
      >
        ${gridLines}
        ${bars}
        <line x1="${padL}" y1="${padT + chartH}" x2="${W - padR}" y2="${padT + chartH}"
          stroke="rgba(255,255,255,.12)" stroke-width="1"/>
      </svg>
      <div class="chart-legend">
        <span class="legend-dot total"></span> Total
        <span class="legend-dot concluido"></span> Concluídos
      </div>`;
  },

  // ── Pedidos ────────────────────────────────────────────────────
  async loadPedidos() {
    $("pedidos-container").innerHTML = `
      <div class="skeleton" style="height:90px;margin-bottom:10px"></div>
      <div class="skeleton" style="height:90px;margin-bottom:10px"></div>
      <div class="skeleton" style="height:90px"></div>`;

    try {
      const params = new URLSearchParams();
      const s = $("filter-status")?.value;
      const c = $("filter-cliente")?.value?.trim();
      if (s) params.set("status", s);
      if (c) params.set("cliente", c);

      const { pedidos } = await API.get(`/pedidos${params.size ? "?" + params : ""}`);
      this.state.pedidos = pedidos;

      $("pedidos-container").innerHTML = pedidos.length
        ? pedidos.map(p => this.renderPedidoCard(p)).join("")
        : `<p class="empty-state">Nenhum pedido encontrado.</p>`;
    } catch (err) {
      $("pedidos-container").innerHTML =
        `<p class="error-state">${esc(err.message)} <button class="btn btn-ghost btn-sm" onclick="App.loadPedidos()">Tentar novamente</button></p>`;
    }
  },

  filterPedidos() {
    clearTimeout(this._filterTimer);
    this._filterTimer = setTimeout(() => this.loadPedidos(), 350);
  },

  refreshData() {
    this.navigate(this.state.page);
    toast("Dados atualizados", "info");
  },

  // ── Render cards ───────────────────────────────────────────────
  renderPedidoCard(p) {
    const s  = STATUS_META[p.status] || { label: p.status, cls: "", iconPath: "" };
    const pr = PRIO_META[p.prioridade] || { label: p.prioridade, cls: "" };

    return `
      <div class="pedido-card" onclick="App.verDetalhes('${esc(p.id)}')">
        <div class="pedido-card-header">
          <span class="pedido-id">${esc(p.id)}</span>
          <span class="status-badge ${s.cls}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="${s.iconPath}"/>
            </svg>
            ${s.label}
          </span>
        </div>
        <div class="pedido-card-body">
          <div class="pedido-cliente">${esc(p.cliente)}</div>
          <div class="pedido-desc">${esc(p.descricao)}</div>
        </div>
        <div class="pedido-card-footer">
          <span class="prio-badge ${pr.cls}">${pr.label}</span>
          <span class="pedido-meta">${fmtDate(p.criadoEm)}</span>
          <span class="pedido-meta">${(p.logs||[]).length} log(s)</span>
          ${p.itens?.length ? `<span class="pedido-meta">${p.itens.length} item(s)</span>` : ""}
        </div>
      </div>`;
  },

  // ── Formulário de Itens com STATE MANAGEMENT real ─────────────
  addItem() {
    this.state.formItens.push({ id: Date.now(), nome: "", quantidade: 1 });
    this.renderFormItens();
  },

  removeItem(id) {
    if (this.state.formItens.length <= 1) return; // já tratado com disabled
    this.state.formItens = this.state.formItens.filter(i => i.id !== id);
    this.renderFormItens();
  },

  updateItem(id, field, value) {
    const item = this.state.formItens.find(i => i.id === id);
    if (item) {
      item[field] = field === "quantidade" ? Math.max(1, parseInt(value) || 1) : value;
      this.updateSummary();
    }
  },

  renderFormItens() {
    const container = $("itens-container");
    const soUmItem  = this.state.formItens.length === 1;

    const header = `
      <div class="item-row-header">
        <span>Nome do item</span>
        <span>Qtd</span>
        <span></span>
      </div>`;

    const rows = this.state.formItens.map(item => `
      <div class="item-row" data-id="${item.id}">
        <input
          type="text"
          placeholder="Ex: Notebook Dell, Suporte monitor..."
          value="${esc(item.nome)}"
          oninput="App.updateItem(${item.id}, 'nome', this.value)"
        />
        <input
          type="number"
          min="1"
          value="${item.quantidade}"
          oninput="App.updateItem(${item.id}, 'quantidade', this.value)"
        />
        <button
          class="btn-remove-item"
          onclick="App.removeItem(${item.id})"
          ${soUmItem ? "disabled title='Mínimo 1 item'" : "title='Remover item'"}
          aria-label="Remover item"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>`).join("");

    container.innerHTML = header + rows;
    this.updateSummary();
  },

  resetForm() {
    $("f-cliente").value     = "";
    $("f-descricao").value   = "";
    $("f-prioridade").value  = "media";
    if ($("f-obs")) $("f-obs").value = "";
    $("err-cliente").textContent   = "";
    $("err-descricao").textContent = "";
    this.state.formItens = [{ id: Date.now(), nome: "", quantidade: 1 }];
    this.renderFormItens(); // já chama updateSummary
  },

  // ── Resumo ao vivo ─────────────────────────────────────────────
  updateSummary() {
    const cliente   = $("f-cliente")?.value?.trim()   || "";
    const descricao = $("f-descricao")?.value?.trim() || "";
    const prioridade = $("f-prioridade")?.value       || "media";

    // Cliente
    const sumCliente = $("sum-cliente");
    if (sumCliente) {
      sumCliente.textContent = cliente || "—";
      sumCliente.style.color = cliente ? "var(--text)" : "var(--gray)";
    }

    // Prioridade
    const prioMap = {
      alta:  { label: "Alta",  cls: "prio-alta" },
      media: { label: "Média", cls: "prio-media" },
      baixa: { label: "Baixa", cls: "prio-baixa" },
    };
    const pr = prioMap[prioridade] || prioMap.media;
    const sumPrio = $("sum-prioridade");
    if (sumPrio) {
      sumPrio.innerHTML = `<span class="prio-badge ${pr.cls}">${pr.label}</span>`;
    }

    // Descrição
    const sumDesc = $("sum-descricao");
    if (sumDesc) {
      sumDesc.textContent = descricao || "—";
      sumDesc.style.color = descricao ? "var(--text-dim)" : "var(--gray)";
    }

    // Itens
    const itensPreenchidos = this.state.formItens.filter(i => i.nome.trim());
    const total = itensPreenchidos.length;

    const sumItensCount = $("sum-itens-count");
    if (sumItensCount) {
      sumItensCount.textContent = total === 0 ? "Nenhum item"
        : total === 1 ? "1 item" : `${total} itens`;
    }

    const sumItensList = $("sum-itens-list");
    if (sumItensList) {
      sumItensList.innerHTML = itensPreenchidos.map(i => `
        <div class="summary-item-row">
          <span class="summary-item-nome">${esc(i.nome)}</span>
          <span class="summary-item-qtd">${i.quantidade}x</span>
        </div>`).join("") || "";
    }

    // Contador no bloco
    const itensCountBadge = $("itens-count");
    if (itensCountBadge) {
      itensCountBadge.textContent = total === 1 ? "1 item" : `${total} itens`;
    }
  },


  async criarPedido() {
    const cliente   = $("f-cliente").value.trim();
    const descricao = $("f-descricao").value.trim();
    const prioridade = $("f-prioridade").value;

    // Inline validation
    let valid = true;
    if (!cliente) {
      $("err-cliente").textContent  = "Campo obrigatório";
      $("f-cliente").classList.add("input-error");
      valid = false;
    } else {
      $("err-cliente").textContent  = "";
      $("f-cliente").classList.remove("input-error");
    }
    if (!descricao) {
      $("err-descricao").textContent = "Campo obrigatório";
      $("f-descricao").classList.add("input-error");
      valid = false;
    } else {
      $("err-descricao").textContent = "";
      $("f-descricao").classList.remove("input-error");
    }
    if (!valid) return;

    const itens = this.state.formItens.filter(i => i.nome.trim());

    const btn = $("btn-criar");
    btn.disabled    = true;
    btn.textContent = "Criando...";

    try {
      const pedido = await API.post("/pedidos", { cliente, descricao, prioridade, itens });
      toast(`Pedido ${pedido.id} criado! ✓`, "success");
      this.resetForm();
      setTimeout(() => this.navigate("pedidos"), 800);
    } catch (err) {
      toast(err.message, "error", 5000);
    } finally {
      btn.disabled    = false;
      btn.textContent = "Criar Pedido";
    }
  },

  // ── Modal de Detalhes ──────────────────────────────────────────
  async verDetalhes(id) {
    $("modal-content").innerHTML = `
      <div class="skeleton" style="height:40px;margin-bottom:16px"></div>
      <div class="skeleton" style="height:100px;margin-bottom:16px"></div>
      <div class="skeleton" style="height:80px"></div>`;
    $("modal-overlay").classList.remove("hidden");
    document.body.style.overflow = "hidden";

    try {
      const [pedido, logsData] = await Promise.all([
        API.get(`/pedidos/${id}`),
        API.get(`/pedidos/${id}/logs`),
      ]);

      const s  = STATUS_META[pedido.status] || { label: pedido.status, cls: "" };
      const pr = PRIO_META[pedido.prioridade] || { label: pedido.prioridade, cls: "" };

      const workflow = {
        pendente:     ["em_andamento", "cancelado"],
        em_andamento: ["concluido",    "cancelado"],
        concluido:    [],
        cancelado:    [],
      };

      const acoes = (workflow[pedido.status] || []).map(a => {
        const meta = STATUS_META[a] || {};
        const isDestructive = a === "cancelado";
        return `
          <button class="btn btn-acao ${isDestructive ? "btn-danger-outline" : "btn-success-outline"}"
            onclick="App.confirmarStatus('${esc(id)}', '${a}', '${meta.label}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="${meta.iconPath}"/>
            </svg>
            ${meta.label}
          </button>`;
      }).join("");

      const itensHTML = pedido.itens?.length
        ? `<ul class="itens-list">${pedido.itens.map(i =>
            `<li><span class="item-qtd-badge">${i.quantidade}x</span> ${esc(i.nome)}</li>`
          ).join("")}</ul>`
        : "<p class='text-dim'>Sem itens</p>";

      const logsHTML = (logsData.logs || []).map(l => `
        <div class="log-item">
          <span class="log-acao">${esc(l.acao || "ação")}</span>
          <span class="log-desc">${esc(l.descricao)}</span>
          <span class="log-time">${fmtDate(l.timestamp)}</span>
        </div>`).join("") || "<p class='text-dim'>Sem logs</p>";

      $("modal-content").innerHTML = `
        <div class="modal-header">
          <div>
            <code class="pedido-id-modal">${esc(pedido.id)}</code>
            <h2>${esc(pedido.cliente)}</h2>
          </div>
          <span class="status-badge ${s.cls}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="${s.iconPath}"/>
            </svg>
            ${s.label}
          </span>
        </div>

        <div class="modal-grid">
          <div class="modal-section">
            <label>Prioridade</label>
            <span class="prio-badge ${pr.cls}">${pr.label}</span>
          </div>
          <div class="modal-section">
            <label>Criado em</label>
            <p>${fmtDate(pedido.criadoEm)}</p>
          </div>
          <div class="modal-section full-width">
            <label>Descrição</label>
            <p>${esc(pedido.descricao)}</p>
          </div>
          ${pedido.observacoes ? `<div class="modal-section full-width"><label>Observações</label><p>${esc(pedido.observacoes)}</p></div>` : ""}
          <div class="modal-section full-width">
            <label>Itens (${(pedido.itens||[]).length})</label>
            ${itensHTML}
          </div>
        </div>

        ${acoes ? `<div class="modal-actions"><strong>Alterar Status</strong><div class="action-btns">${acoes}</div></div>` : ""}

        <div class="logs-section">
          <h3>Histórico <span class="badge-count">${logsData.totalLogs}</span></h3>
          <div class="logs-list">${logsHTML}</div>
        </div>`;
    } catch (err) {
      $("modal-content").innerHTML =
        `<p class="error-state">${esc(err.message)}</p>`;
    }
  },

  closeModal(event) {
    if (event && event.target !== $("modal-overlay")) return;
    $("modal-overlay").classList.add("hidden");
    document.body.style.overflow = "";
  },

  // ── Confirmação de ação destrutiva ────────────────────────────
  confirmarStatus(id, novoStatus, label) {
    const isDestructive = novoStatus === "cancelado";
    $("confirm-icon").innerHTML = isDestructive
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="icon-warn"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="icon-info"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;

    $("confirm-title").textContent   = `Alterar para "${label}"?`;
    $("confirm-message").textContent = isDestructive
      ? "Esta ação não pode ser desfeita. O pedido será marcado como cancelado."
      : `O status do pedido será alterado para "${label}".`;

    $("confirm-ok").className = isDestructive ? "btn btn-danger" : "btn btn-primary";
    $("confirm-ok").textContent = "Confirmar";

    this._confirmCallback = () => this.executarMudancaStatus(id, novoStatus);
    $("confirm-overlay").classList.remove("hidden");
  },

  confirmOk() {
    $("confirm-overlay").classList.add("hidden");
    if (this._confirmCallback) {
      this._confirmCallback();
      this._confirmCallback = null;
    }
  },

  confirmCancel() {
    $("confirm-overlay").classList.add("hidden");
    this._confirmCallback = null;
  },

  async executarMudancaStatus(id, novoStatus) {
    try {
      await API.put(`/pedidos/${id}`, { status: novoStatus });
      const meta = STATUS_META[novoStatus];
      toast(`Status alterado para "${meta?.label}"`, "success");
      this.closeModal();
      if (this.state.page === "dashboard") this.loadDashboard();
      else this.loadPedidos();
    } catch (err) {
      toast(err.message, "error", 5000);
    }
  },

  // ── Exportar CSV ───────────────────────────────────────────────
  async exportarCSV() {
    try {
      const token = Auth.getToken();
      const res   = await fetch(`${CONFIG.API_BASE}/pedidos/export/csv`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Falha ao exportar");

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `pedidos-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast("CSV exportado com sucesso!", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  },

  // ── Health Check ───────────────────────────────────────────────
  async checkAPIStatus() {
    const badge = $("api-status");
    try {
      const res = await fetch(`${CONFIG.API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg> API Online`;
        badge.className = "api-badge online";
      } else throw new Error();
    } catch {
      badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg> API Offline`;
      badge.className = "api-badge offline";
    }
  },

  // ── Init ───────────────────────────────────────────────────────
  init() {
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", e => {
        e.preventDefault();
        this.navigate(item.dataset.page);
      });
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        this.closeModal();
        this.confirmCancel();
      }
    });

    this.renderFormItens();
    this.checkAPIStatus();
    this.navigate("dashboard");
    setInterval(() => this.checkAPIStatus(), 60_000);
  },
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Enter no login
  [$("l-user"), $("l-pass")].forEach(el => {
    el?.addEventListener("keydown", e => { if (e.key === "Enter") Auth.login(); });
  });

  if (Auth.isLoggedIn()) {
    Auth.showApp();
    App.init();
  } else {
    Auth.showLogin();
  }
});

EOFILE_MARKER_XYZ
echo "OK: frontend/app.js"

cat > frontend/style.css << 'EOFILE_MARKER_XYZ'
/* ──────────────────────────────────────────────────────────────────────────────
   ERP Automation System v2.0 — Stylesheet
   ────────────────────────────────────────────────────────────────────────── */

:root {
  --bg:        #0d1117;
  --bg2:       #161b27;
  --bg3:       #1c2333;
  --bg4:       #21293a;
  --border:    #2a3347;
  --accent:    #4f8ef7;
  --accent-h:  #3a7ae0;
  --green:     #22c55e;
  --yellow:    #f59e0b;
  --red:       #ef4444;
  --red-dim:   rgba(239,68,68,.15);
  --gray:      #8b9ab4;
  --text:      #e2e8f0;
  --text-dim:  #94a3b8;
  --radius:    10px;
  --radius-sm: 6px;
  --shadow:    0 8px 32px rgba(0,0,0,.45);
  --sidebar-w: 220px;
  --transition: .18s ease;
}

*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 15px; }

body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  line-height: 1.55;
}

/* ── Scrollbar ──────────────────────────────────────────────────────────── */
::-webkit-scrollbar       { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* ── Layout ─────────────────────────────────────────────────────────────── */
#app { display: flex; min-height: 100vh; }

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--border);
}
.sidebar-brand svg { width: 28px; height: 28px; color: var(--accent); flex-shrink: 0; }
.brand-title { display: block; font-weight: 700; font-size: .95rem; }
.brand-sub   { display: block; font-size: .7rem; color: var(--gray); letter-spacing: .06em; text-transform: uppercase; }

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  text-decoration: none;
  font-size: .88rem;
  transition: background var(--transition), color var(--transition);
}
.nav-item svg  { width: 18px; height: 18px; flex-shrink: 0; }
.nav-item:hover { background: var(--bg3); color: var(--text); }
.nav-item.active { background: rgba(79,142,247,.12); color: var(--accent); font-weight: 600; }

.sidebar-footer {
  padding: 12px 10px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: .75rem;
  padding: 5px 10px;
  border-radius: 20px;
  line-height: 1;
}
.api-badge svg    { width: 13px; height: 13px; }
.api-badge.checking { background: rgba(139,154,180,.1); color: var(--gray); }
.api-badge.online   { background: rgba(34,197,94,.12);  color: var(--green); }
.api-badge.offline  { background: rgba(239,68,68,.12);  color: var(--red); }

.btn-logout {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  padding: 7px 12px;
  font-size: .82rem;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-logout svg   { width: 16px; height: 16px; }
.btn-logout:hover { background: var(--red-dim); border-color: var(--red); color: var(--red); }

/* ── Main ───────────────────────────────────────────────────────────────── */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
  position: sticky;
  top: 0;
  z-index: 10;
}
.top-bar h1 { font-size: 1.1rem; font-weight: 700; }
.top-bar-actions { display: flex; gap: 8px; align-items: center; }

/* ── Pages ──────────────────────────────────────────────────────────────── */
.page { display: none; flex: 1; padding: 22px 24px; overflow-y: auto; }
.page.active { display: block; }

/* ── Skeleton ───────────────────────────────────────────────────────────── */
.skeleton {
  background: linear-gradient(90deg, var(--bg3) 25%, var(--bg4) 50%, var(--bg3) 75%);
  background-size: 400% 100%;
  animation: shimmer 1.6s infinite;
  border-radius: var(--radius-sm);
  display: block;
}
@keyframes shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

/* ── Stats Grid ─────────────────────────────────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.stat-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: border-color var(--transition), transform var(--transition);
}
.stat-card:hover { border-color: var(--accent); transform: translateY(-1px); }

.stat-icon {
  width: 42px; height: 42px;
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stat-icon svg     { width: 20px; height: 20px; }
.stat-icon.pending  { background: rgba(245,158,11,.12); color: var(--yellow); }
.stat-icon.progress { background: rgba(79,142,247,.12); color: var(--accent); }
.stat-icon.done     { background: rgba(34,197,94,.12);  color: var(--green); }
.stat-icon.total    { background: rgba(139,92,246,.12); color: #a78bfa; }

.stat-value { display: block; font-size: 1.75rem; font-weight: 800; line-height: 1.1; }
.stat-label { display: block; font-size: .75rem; color: var(--text-dim); margin-top: 2px; }
.stat-label small { color: var(--green); font-size: .7em; }

/* ── Dashboard Grid ─────────────────────────────────────────────────────── */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 16px;
}

/* ── Cards ──────────────────────────────────────────────────────────────── */
.card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.card-header {
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-header h2 { font-size: .95rem; font-weight: 600; }
.card-body { padding: 16px 18px; }

/* ── Gráfico de Barras ──────────────────────────────────────────────────── */
.bar-chart {
  overflow: visible;
  display: block;      /* remove espaço inline extra */
  max-width: 100%;
  height: 160px !important;  /* força altura física independente do container */
}
.bar-total    { fill: rgba(79,142,247,.35); transition: fill .15s; }
.bar-total:hover { fill: rgba(79,142,247,.55); }
.bar-empty    { fill: rgba(255,255,255,.05); }
.bar-concluido { fill: rgba(34,197,94,.65); }
.bar-label    { font-size: 10px; fill: var(--gray); font-family: inherit; }
.bar-value    { font-size: 10px; fill: var(--text-dim); font-weight: 600; font-family: inherit; }

.chart-legend {
  display: flex;
  gap: 14px;
  margin-top: 8px;
  font-size: .75rem;
  color: var(--text-dim);
}
.legend-dot {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 2px;
  margin-right: 4px;
  vertical-align: middle;
}
.legend-dot.total    { background: rgba(79,142,247,.4); }
.legend-dot.concluido { background: rgba(34,197,94,.7); }

/* ── Pedido Cards ───────────────────────────────────────────────────────── */
.pedido-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 13px 16px;
  cursor: pointer;
  transition: border-color var(--transition), transform var(--transition);
  margin-bottom: 8px;
}
.pedido-card:last-child { margin-bottom: 0; }
.pedido-card:hover { border-color: var(--accent); transform: translateY(-1px); }

.pedido-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.pedido-id { font-family: monospace; font-size: .72rem; color: var(--gray); }

.pedido-cliente { font-weight: 600; font-size: .92rem; margin-bottom: 3px; }
.pedido-desc    {
  font-size: .83rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 560px;
  margin-bottom: 8px;
}

.pedido-card-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pedido-meta        { font-size: .73rem; color: var(--gray); }

/* ── Badges ─────────────────────────────────────────────────────────────── */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: .73rem;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 20px;
  white-space: nowrap;
  line-height: 1;
}
.status-badge svg { width: 12px; height: 12px; }
.status-pending  { background: rgba(245,158,11,.12); color: var(--yellow); }
.status-progress { background: rgba(79,142,247,.12); color: var(--accent); }
.status-done     { background: rgba(34,197,94,.12);  color: var(--green); }
.status-canceled { background: rgba(239,68,68,.12);  color: var(--red); }

.prio-badge {
  font-size: .71rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
}
.prio-alta  { background: rgba(239,68,68,.12);  color: #f87171; }
.prio-media { background: rgba(245,158,11,.12); color: var(--yellow); }
.prio-baixa { background: rgba(34,197,94,.12);  color: var(--green); }

.badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: .72rem;
  padding: 1px 7px;
  color: var(--text-dim);
  font-weight: normal;
  margin-left: 6px;
}

/* ── Toolbar / Filtros ──────────────────────────────────────────────────── */
.page-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: .8rem;
  color: var(--text-dim);
}

/* ── Formulários ────────────────────────────────────────────────────────── */
.form-card { /* max-width removido — layout de 2 colunas controla o espaço */ }

.form-row {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 14px;
}

.form-group { margin-bottom: 16px; }
.form-group label {
  display: block;
  font-size: .8rem;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 5px;
}

input[type="text"],
input[type="number"],
input[type="password"],
textarea,
select {
  width: 100%;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  padding: 8px 12px;
  font-size: .88rem;
  font-family: inherit;
  transition: border-color var(--transition);
  outline: none;
}
input:focus, textarea:focus, select:focus { border-color: var(--accent); }
textarea { resize: vertical; min-height: 80px; }
.input-error { border-color: var(--red) !important; }
.field-error  { font-size: .75rem; color: var(--red); display: block; margin-top: 3px; min-height: 16px; }

/* ── Itens ──────────────────────────────────────────────────────────────── */
.item-row {
  display: grid;
  grid-template-columns: 1fr 90px 36px;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}

/* Override do width:100% global dentro do item-row */
.item-row input {
  width: 100%;
  min-width: 0; /* essencial para flex/grid não quebrar */
}

.item-nome-label {
  font-size: .72rem;
  color: var(--gray);
  display: block;
  margin-bottom: 3px;
}

.item-row-header {
  display: grid;
  grid-template-columns: 1fr 90px 36px;
  gap: 8px;
  margin-bottom: 4px;
  padding: 0 2px;
}
.item-row-header span {
  font-size: .72rem;
  color: var(--gray);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.btn-remove-item {
  background: var(--red-dim);
  border: 1px solid rgba(239,68,68,.2);
  color: var(--red);
  border-radius: var(--radius-sm);
  width: 36px;
  height: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background var(--transition), border-color var(--transition);
}
.btn-remove-item svg      { width: 14px; height: 14px; }
.btn-remove-item:hover    { background: rgba(239,68,68,.3); border-color: rgba(239,68,68,.5); }
.btn-remove-item:disabled { opacity: .25; cursor: not-allowed; }
.btn-remove-item:disabled:hover { background: var(--red-dim); border-color: rgba(239,68,68,.2); }

/* ── Buttons ────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: .85rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity var(--transition), transform var(--transition);
  text-decoration: none;
  white-space: nowrap;
  line-height: 1;
}
.btn svg      { width: 15px; height: 15px; }
.btn:hover    { opacity: .85; }
.btn:active   { transform: scale(.97); }
.btn:disabled { opacity: .4; cursor: not-allowed; transform: none; }
.btn-sm       { padding: 5px 11px; font-size: .78rem; }
.btn-full     { width: 100%; justify-content: center; padding: 10px; }
.btn-icon     { padding: 8px; }
.btn-icon-text { }

.btn-primary   { background: var(--accent);    color: #fff; }
.btn-secondary { background: var(--bg3); color: var(--text); border: 1px solid var(--border); }
.btn-ghost     { background: transparent; color: var(--accent); border: 1px solid rgba(79,142,247,.3); }
.btn-danger    { background: var(--red);    color: #fff; }
.btn-danger-outline  { background: var(--red-dim);           color: var(--red);   border: 1px solid rgba(239,68,68,.3); }
.btn-success-outline { background: rgba(34,197,94,.1);       color: var(--green); border: 1px solid rgba(34,197,94,.3); }

.btn-acao { padding: 7px 14px; font-size: .82rem; }

.form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
.mt-1 { margin-top: 10px; }

/* ── Modal ──────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
  backdrop-filter: blur(4px);
  animation: fadeIn .15s ease;
}
.modal-overlay.hidden { display: none; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 14px;
  width: 100%;
  max-width: 660px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px 26px;
  position: relative;
  box-shadow: var(--shadow);
  animation: slideUp .2s ease;
}
@keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }

.modal-close {
  position: absolute;
  top: 14px; right: 14px;
  background: var(--bg3);
  border: 1px solid var(--border);
  color: var(--text-dim);
  width: 28px; height: 28px;
  border-radius: 50%;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--transition);
}
.modal-close svg  { width: 14px; height: 14px; }
.modal-close:hover { background: var(--bg4); color: var(--text); }

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 12px;
}
.pedido-id-modal { font-size: .72rem; color: var(--gray); display: block; margin-bottom: 3px; }
.modal-header h2 { font-size: 1rem; font-weight: 700; }

.modal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 18px;
}
.modal-section.full-width { grid-column: 1 / -1; }
.modal-section label { font-size: .75rem; color: var(--gray); display: block; margin-bottom: 4px; }
.modal-section p { font-size: .9rem; }

.modal-actions {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 13px 15px;
  margin-bottom: 18px;
}
.modal-actions strong { display: block; font-size: .8rem; color: var(--text-dim); margin-bottom: 9px; }
.action-btns { display: flex; gap: 8px; flex-wrap: wrap; }

.itens-list {
  list-style: none;
  font-size: .86rem;
}
.itens-list li {
  padding: 5px 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
}
.itens-list li:last-child { border-bottom: none; }
.item-qtd-badge {
  background: rgba(79,142,247,.12);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: .72rem;
  font-weight: 700;
}

/* ── Logs ───────────────────────────────────────────────────────────────── */
.logs-section h3 { font-size: .9rem; margin-bottom: 10px; display: flex; align-items: center; }
.logs-list { display: flex; flex-direction: column; gap: 6px; }

.log-item {
  background: var(--bg3);
  border-left: 3px solid var(--border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 8px 12px;
  display: grid;
  grid-template-columns: 110px 1fr auto;
  gap: 10px;
  align-items: center;
  transition: border-color var(--transition);
}
.log-item:hover { border-left-color: var(--accent); }
.log-acao {
  font-family: monospace;
  font-size: .71rem;
  background: rgba(79,142,247,.1);
  color: var(--accent);
  padding: 2px 7px;
  border-radius: 4px;
  text-align: center;
}
.log-desc { font-size: .83rem; color: var(--text-dim); }
.log-time { font-size: .7rem; color: var(--gray); white-space: nowrap; }

/* ── Confirm Dialog ─────────────────────────────────────────────────────── */
.confirm-dialog {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px 28px 22px;
  width: 100%;
  max-width: 400px;
  text-align: center;
  box-shadow: var(--shadow);
  animation: slideUp .2s ease;
}
.confirm-icon { margin-bottom: 14px; display: flex; justify-content: center; }
.icon-warn { width: 44px; height: 44px; color: var(--yellow); }
.icon-info { width: 44px; height: 44px; color: var(--accent); }
.confirm-dialog h3 { font-size: 1rem; margin-bottom: 8px; }
.confirm-dialog p  { font-size: .85rem; color: var(--text-dim); margin-bottom: 20px; }
.confirm-actions   { display: flex; gap: 10px; justify-content: center; }

/* ── Toast ──────────────────────────────────────────────────────────────── */
#toast-container {
  position: fixed;
  bottom: 22px; right: 22px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  z-index: 200;
}
.toast {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 11px 16px;
  font-size: .86rem;
  box-shadow: var(--shadow);
  transform: translateX(10px);
  opacity: 0;
  transition: all .25s ease;
  max-width: 320px;
  pointer-events: auto;
}
.toast.show      { transform: translateX(0); opacity: 1; }
.toast-success   { border-left: 3px solid var(--green); }
.toast-error     { border-left: 3px solid var(--red); }
.toast-info      { border-left: 3px solid var(--accent); }

/* ── Login ──────────────────────────────────────────────────────────────── */
.login-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background: var(--bg);
}
.login-screen.hidden { display: none; }

.login-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 36px 32px;
  width: 100%;
  max-width: 380px;
  box-shadow: var(--shadow);
}

.login-brand {
  text-align: center;
  margin-bottom: 28px;
}
.login-logo {
  width: 48px; height: 48px;
  color: var(--accent);
  margin-bottom: 10px;
}
.login-brand h1 { font-size: 1.3rem; font-weight: 800; margin-bottom: 4px; }
.login-brand p  { font-size: .83rem; color: var(--text-dim); }

.login-error {
  background: var(--red-dim);
  border: 1px solid rgba(239,68,68,.3);
  border-radius: var(--radius-sm);
  color: #f87171;
  font-size: .83rem;
  padding: 9px 12px;
  margin-bottom: 14px;
}
.login-error.hidden { display: none; }

.login-hint {
  text-align: center;
  font-size: .75rem;
  color: var(--gray);
  margin-top: 14px;
}

.login-coldstart {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: rgba(245,158,11,.08);
  border: 1px solid rgba(245,158,11,.25);
  border-radius: var(--radius-sm);
  color: var(--yellow);
  font-size: .78rem;
  padding: 10px 12px;
  margin-top: 10px;
  line-height: 1.45;
  animation: pulse-border 2s ease infinite;
}
.login-coldstart svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px; }
.login-coldstart.hidden { display: none; }

@keyframes pulse-border {
  0%, 100% { border-color: rgba(245,158,11,.25); }
  50%       { border-color: rgba(245,158,11,.55); }
}

/* ── Estados ────────────────────────────────────────────────────────────── */
.empty-state { text-align: center; padding: 28px; color: var(--gray); font-size: .88rem; }
.error-state { text-align: center; padding: 20px; color: var(--red); font-size: .85rem; }
.empty-state a { color: var(--accent); text-decoration: none; }
.empty-state a:hover { text-decoration: underline; }
.text-dim { color: var(--text-dim); font-size: .85rem; }

/* ── Hidden ─────────────────────────────────────────────────────────────── */
.hidden { display: none !important; }

/* ── Novo Pedido — Layout de 2 colunas ──────────────────────────────────── */
.novo-pedido-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
  align-items: start;
}

/* Coluna esquerda: formulário */
.novo-pedido-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Bloco de seção do formulário */
.form-block {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.form-block-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  font-size: .85rem;
  font-weight: 700;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  background: var(--bg3);
}

.form-block-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: .72rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.form-block-count {
  margin-left: auto;
  font-size: .72rem;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--bg4);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 20px;
}

.form-block-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.form-block-body .form-group:last-child {
  margin-bottom: 0;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 150px;
  gap: 12px;
}

/* Label opcional */
.label-opt {
  font-size: .7rem;
  color: var(--gray);
  font-weight: 400;
  margin-left: 4px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

/* Botão adicionar item */
.btn-add-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  margin-top: 10px;
  background: rgba(79,142,247,.08);
  border: 1px dashed rgba(79,142,247,.35);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: .83rem;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  justify-content: center;
  transition: background var(--transition), border-color var(--transition);
  font-family: inherit;
}
.btn-add-item svg        { width: 15px; height: 15px; }
.btn-add-item:hover      { background: rgba(79,142,247,.14); border-color: rgba(79,142,247,.6); }

/* Footer do form */
.form-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 0 4px;
}

/* Coluna direita: resumo */
.novo-pedido-summary {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  position: sticky;
  top: 72px; /* altura do top-bar */
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: .85rem;
  font-weight: 700;
  border-bottom: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text);
}
.summary-header svg { width: 16px; height: 16px; color: var(--accent); flex-shrink: 0; }

.summary-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.summary-label {
  font-size: .7rem;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--gray);
  font-weight: 600;
}
.summary-value {
  font-size: .86rem;
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
}
.summary-desc {
  color: var(--text-dim);
  font-size: .82rem;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.summary-divider {
  height: 1px;
  background: var(--border);
  margin: 2px 0;
}

.summary-itens {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 4px;
}
.summary-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: .8rem;
  color: var(--text-dim);
  padding: 4px 8px;
  background: var(--bg3);
  border-radius: 5px;
}
.summary-item-nome { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-item-qtd {
  font-size: .72rem;
  font-weight: 700;
  color: var(--accent);
  background: rgba(79,142,247,.1);
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
  flex-shrink: 0;
}

.summary-status {
  margin-top: 2px;
}

.summary-tip {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: .72rem;
  color: var(--gray);
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: rgba(255,255,255,.02);
  line-height: 1.45;
}
.summary-tip svg { width: 13px; height: 13px; flex-shrink: 0; margin-top: 1px; }

/* ── Responsive ─────────────────────────────────────────────────────────── */

/* Tablet: dashboard empilha, novo pedido empilha */
@media (max-width: 960px) {
  .dashboard-grid       { grid-template-columns: 1fr; }
  .novo-pedido-layout   { grid-template-columns: 1fr; }
  .novo-pedido-summary  { position: static; order: -1; }
  .summary-body         { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .summary-divider      { grid-column: 1 / -1; }
  .summary-status       { grid-column: 1 / -1; }
}

/* Mobile: sidebar colapsa, layouts em coluna única */
@media (max-width: 640px) {
  .sidebar             { width: 56px; min-width: 56px; }
  .sidebar-brand > div,
  .nav-item span,
  .btn-logout span     { display: none; }
  .sidebar-brand       { justify-content: center; padding: 16px 10px; }
  .nav-item            { justify-content: center; padding: 11px; }
  .btn-logout          { justify-content: center; padding: 8px; }
  .page                { padding: 14px 12px; }
  .top-bar             { padding: 12px 14px; }
  .form-row            { grid-template-columns: 1fr; }
  .form-row-2          { grid-template-columns: 1fr; }
  .log-item            { grid-template-columns: 1fr; gap: 4px; }
  .modal-grid          { grid-template-columns: 1fr; }
  .summary-body        { display: flex; flex-direction: column; }
  .stats-grid          { grid-template-columns: repeat(2, 1fr); }
}


EOFILE_MARKER_XYZ
echo "OK: frontend/style.css"

cat > frontend/vercel.json << 'EOFILE_MARKER_XYZ'
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*\\.js|.*\\.css)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }]
    }
  ]
}

EOFILE_MARKER_XYZ
echo "OK: frontend/vercel.json"

cat > render.yaml << 'EOFILE_MARKER_XYZ'
services:
  - type: web
    name: erp-automation-system
    env: node
    region: oregon
    plan: free
    rootDir: backend
    buildCommand: "echo 'no build needed'"
    startCommand: "node server.js"
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: FRONTEND_ORIGIN
        value: https://erp-automation-system-eight.vercel.app
      - key: JWT_SECRET
        generateValue: true
      - key: ADMIN_USER
        value: admin
      - key: ADMIN_PASSWORD
        sync: false

EOFILE_MARKER_XYZ
echo "OK: render.yaml"

echo ""
echo "Concluido! Agora rode:"
echo "git add . && git commit -m feat-v2 && git push origin main"