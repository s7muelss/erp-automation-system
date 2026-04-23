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

    const cabecalho = ["ID", "Cliente", "Descrição", "Status", "Prioridade", "Itens", "Criado Em", "Atualizado Em"];
    const linhas    = pedidos.map(p => [
      p.id,
      `"${(p.cliente   || "").replace(/"/g, '""')}"`,
      `"${(p.descricao || "").replace(/"/g, '""')}"`,
      p.status,
      p.prioridade,
      (p.itens || []).length,
      p.criadoEm,
      p.atualizadoEm,
    ]);

    const csv = [cabecalho.join(","), ...linhas.map(l => l.join(","))].join("\n");
    const bom = "\uFEFF"; // BOM para Excel reconhecer UTF-8

    res.writeHead(200, {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${new Date().toISOString().slice(0,10)}.csv"`,
      "Content-Length":       Buffer.byteLength(bom + csv),
    });
    res.end(bom + csv);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, buscarLogs, exportarCSV };
