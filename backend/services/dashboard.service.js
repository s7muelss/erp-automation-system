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
