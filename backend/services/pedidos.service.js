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
