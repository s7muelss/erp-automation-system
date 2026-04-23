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

    const SEP = ";";

    const statusPT = {
      pendente:     "Pendente",
      em_andamento: "Em Andamento",
      concluido:    "Concluido",
      cancelado:    "Cancelado",
    };
    const prioridadePT = {
      alta:  "Alta",
      media: "Media",
      baixa: "Baixa",
    };

    function fmtData(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      const pad = n => String(n).padStart(2, "0");
      return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }

    function csvCell(value) {
      const str = String(value ?? "");
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
      "Descricao",
      "Status",
      "Prioridade",
      "Qtd de Itens",
      "Itens",
      "Observacoes",
      "Criado Em",
      "Atualizado Em",
      "Concluido Em",
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

    // sep= faz Excel usar ; automaticamente, sem BOM para evitar conflito de encoding
    const csv = `sep=${SEP}\n` + cabecalho + "\n" + linhas.join("\n");

    const nomeArquivo = `pedidos-${new Date().toISOString().slice(0,10)}.csv`;

    res.writeHead(200, {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Content-Length":       Buffer.byteLength(csv, "utf-8"),
    });
    res.end(csv);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, buscarLogs, exportarCSV };