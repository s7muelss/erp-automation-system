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
    const ExcelJS  = require("exceljs");
    const pedidos  = await pedidosService.listar();

    const wb = new ExcelJS.Workbook();
    wb.creator  = "ERP Automation System";
    wb.created  = new Date();

    const ws = wb.addWorksheet("Pedidos", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
      views: [{ state: "frozen", ySplit: 1 }], // congela cabeçalho
    });

    // ── Colunas ──────────────────────────────────────────────────
    ws.columns = [
      { header: "ID do Pedido",  key: "id",           width: 22 },
      { header: "Cliente",       key: "cliente",       width: 22 },
      { header: "Descricao",     key: "descricao",     width: 35 },
      { header: "Status",        key: "status",        width: 16 },
      { header: "Prioridade",    key: "prioridade",    width: 13 },
      { header: "Qtd de Itens",  key: "qtdItens",      width: 13 },
      { header: "Itens",         key: "itens",         width: 38 },
      { header: "Observacoes",   key: "observacoes",   width: 28 },
      { header: "Criado Em",     key: "criadoEm",      width: 20 },
      { header: "Atualizado Em", key: "atualizadoEm",  width: 20 },
      { header: "Concluido Em",  key: "concluidoEm",   width: 20 },
    ];

    // ── Estilo do cabeçalho ───────────────────────────────────────
    const headerRow = ws.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
      cell.fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: "FF1E3A5F" }, // azul escuro
      };
      cell.font        = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Segoe UI" };
      cell.alignment   = { vertical: "middle", horizontal: "center", wrapText: false };
      cell.border      = {
        bottom: { style: "medium", color: { argb: "FF4F8EF7" } },
      };
    });

    // ── Cores por status ──────────────────────────────────────────
    const statusConfig = {
      pendente:     { label: "Pendente",      bg: "FFFFF3CD", font: "FF856404" },
      em_andamento: { label: "Em Andamento",  bg: "FFD0E8FF", font: "FF0550AE" },
      concluido:    { label: "Concluido",     bg: "FFD1FAE5", font: "FF065F46" },
      cancelado:    { label: "Cancelado",     bg: "FFFEE2E2", font: "FF991B1B" },
    };

    const prioConfig = {
      alta:  { label: "Alta",  bg: "FFFEE2E2", font: "FF991B1B" },
      media: { label: "Media", bg: "FFFFF3CD", font: "FF856404" },
      baixa: { label: "Baixa", bg: "FFD1FAE5", font: "FF065F46" },
    };

    function fmtData(iso) {
      if (!iso) return "";
      const d   = new Date(iso);
      const pad = n => String(n).padStart(2, "0");
      return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }

    function formatarItens(itens) {
      if (!itens || itens.length === 0) return "Sem itens";
      return itens.map(i => `${i.nome} (${i.quantidade}x)`).join(" | ");
    }

    // ── Linhas de dados ───────────────────────────────────────────
    pedidos.forEach((p, idx) => {
      const isEven  = idx % 2 === 0;
      const rowBg   = isEven ? "FFF8FAFC" : "FFFFFFFF";
      const sCfg    = statusConfig[p.status]     || { label: p.status,     bg: "FFFFFFFF", font: "FF000000" };
      const prCfg   = prioConfig[p.prioridade]   || { label: p.prioridade, bg: "FFFFFFFF", font: "FF000000" };

      const row = ws.addRow({
        id:           p.id,
        cliente:      p.cliente,
        descricao:    p.descricao,
        status:       sCfg.label,
        prioridade:   prCfg.label,
        qtdItens:     (p.itens || []).length,
        itens:        formatarItens(p.itens),
        observacoes:  p.observacoes || "",
        criadoEm:     fmtData(p.criadoEm),
        atualizadoEm: fmtData(p.atualizadoEm),
        concluidoEm:  fmtData(p.concluidoEm),
      });

      row.height = 22;

      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        // Fundo alternado padrão
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        cell.font = { size: 10, name: "Segoe UI" };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = {
          top:    { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left:   { style: "thin", color: { argb: "FFE2E8F0" } },
          right:  { style: "thin", color: { argb: "FFE2E8F0" } },
        };

        // Coluna Status (col 4) — cor por valor
        if (colNum === 4) {
          cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: sCfg.bg } };
          cell.font      = { bold: true, size: 10, color: { argb: sCfg.font }, name: "Segoe UI" };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }

        // Coluna Prioridade (col 5) — cor por valor
        if (colNum === 5) {
          cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: prCfg.bg } };
          cell.font      = { bold: true, size: 10, color: { argb: prCfg.font }, name: "Segoe UI" };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }

        // Coluna Qtd (col 6) — centralizado
        if (colNum === 6) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
      });
    });

    // ── Rodapé com total ──────────────────────────────────────────
    const totalRow = ws.addRow({
      id:       `Total: ${pedidos.length} pedido(s)`,
      cliente:  "", descricao: "", status: "", prioridade: "",
      qtdItens: pedidos.reduce((a, p) => a + (p.itens||[]).length, 0),
    });
    totalRow.height = 24;
    totalRow.eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Segoe UI" };
      cell.alignment = { vertical: "middle" };
    });

    // ── Envia o arquivo ───────────────────────────────────────────
    const nomeArquivo = `pedidos-${new Date().toISOString().slice(0,10)}.xlsx`;

    res.writeHead(200, {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    });

    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    sendError(res, 500, err.message);
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, buscarLogs, exportarCSV };