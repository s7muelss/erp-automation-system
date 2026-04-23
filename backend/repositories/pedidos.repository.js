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
