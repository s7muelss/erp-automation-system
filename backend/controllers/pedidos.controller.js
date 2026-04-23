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

