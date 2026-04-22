/**
 * ============================================================
 * ERP AUTOMATION SYSTEM — Frontend Principal
 * ============================================================
 * Responsabilidades:
 *   - Comunicação com o backend via API REST (fetch)
 *   - Integração com ViaCEP (autopreenchimento de endereço)
 *   - Renderização dinâmica dos pedidos
 *   - Exibição dos logs de workflow em tempo real
 *   - Filtros, busca e atualização de status
 * ============================================================
 */

'use strict';

// ─── Configuração ────────────────────────────────────────────
const API_BASE = 'http://localhost:3000';

// Cache local dos pedidos para filtros sem nova requisição
let pedidosCache = [];

// ─── Utilitários ─────────────────────────────────────────────

/**
 * Formata um número como moeda brasileira.
 * @param {number} valor
 * @returns {string}
 */
const formatarMoeda = (valor) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

/**
 * Formata uma data ISO para exibição local.
 * @param {string} iso
 * @returns {string}
 */
const formatarData = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

/**
 * Normaliza o CEP removendo caracteres não numéricos.
 * @param {string} cep
 * @returns {string}
 */
const limparCEP = (cep) => cep.replace(/\D/g, '');

// ─── Relógio do Header ────────────────────────────────────────
function iniciarRelogio() {
  const el = document.getElementById('header-clock');
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('pt-BR');
  };
  tick();
  setInterval(tick, 1000);
}

// ─── Sistema de Notificações (Toast) ─────────────────────────

/**
 * Exibe uma notificação toast na tela.
 * @param {string} tipo   - 'success' | 'error' | 'info'
 * @param {string} titulo
 * @param {string} msg
 */
function toast(tipo, titulo, msg) {
  const container = document.getElementById('toast-container');

  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z"/></svg>`,
  };

  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `
    <div class="toast-icon">${icons[tipo]}</div>
    <div class="toast-content">
      <div class="toast-title">${titulo}</div>
      <div class="toast-msg">${msg}</div>
    </div>
  `;

  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 250);
  }, 4000);
}

// ─── Integração: ViaCEP ───────────────────────────────────────

/**
 * Consulta a API ViaCEP e preenche os campos de endereço
 * automaticamente. Integração real com API externa.
 *
 * @param {string} cep - CEP a ser consultado
 */
async function buscarEnderecoPorCEP(cep) {
  const cepLimpo = limparCEP(cep);

  if (cepLimpo.length !== 8) {
    toast('error', 'CEP inválido', 'Digite um CEP com 8 dígitos.');
    return;
  }

  const btnCEP = document.getElementById('btn-buscar-cep');
  btnCEP.style.opacity = '0.5';
  btnCEP.disabled = true;

  try {
    // Chamada à API pública ViaCEP
    const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const dados = await res.json();

    if (dados.erro) {
      toast('error', 'CEP não encontrado', 'Verifique o CEP digitado.');
      return;
    }

    // Preenchimento automático dos campos
    document.getElementById('addr-logradouro').value = dados.logradouro || '';
    document.getElementById('addr-bairro').value     = dados.bairro     || '';
    document.getElementById('addr-cidade').value     = dados.localidade || '';
    document.getElementById('addr-uf').value         = dados.uf         || '';

    // Exibe o bloco de endereço com animação
    document.getElementById('address-block').classList.add('visible');

    toast('success', 'Endereço encontrado', `${dados.logradouro}, ${dados.bairro} — ${dados.localidade}/${dados.uf}`);

  } catch {
    toast('error', 'Erro na consulta', 'Não foi possível conectar ao ViaCEP.');
  } finally {
    btnCEP.style.opacity = '';
    btnCEP.disabled = false;
  }
}

// ─── Preview de Prioridade em Tempo Real ──────────────────────

/**
 * Atualiza o preview de prioridade conforme o valor é digitado.
 * Espelha exatamente a regra de negócio do backend.
 */
function atualizarPreviewPrioridade() {
  const valor = parseFloat(document.getElementById('valor').value);
  const previewEl = document.getElementById('preview-value');

  if (!valor || valor <= 0) {
    previewEl.textContent = '—';
    previewEl.className = 'preview-value';
    return;
  }

  let prioridade, cls;
  if (valor > 5000) {
    prioridade = 'Crítica ⚠️'; cls = 'critica';
  } else if (valor > 1000) {
    prioridade = 'Alta'; cls = 'alta';
  } else {
    prioridade = 'Normal'; cls = 'normal';
  }

  previewEl.textContent = prioridade;
  previewEl.className = `preview-value ${cls}`;
}

// ─── API: Buscar Pedidos ──────────────────────────────────────

/**
 * Busca todos os pedidos do backend e atualiza a interface.
 * Também atualiza os KPIs e o log de workflow.
 *
 * @param {boolean} highlightFirst - Destaca a primeira linha (novo pedido)
 */
async function carregarPedidos(highlightFirst = false) {
  const btnRefresh = document.getElementById('btn-refresh');
  btnRefresh.classList.add('spinning');

  try {
    const res = await fetch(`${API_BASE}/pedidos`);
    const json = await res.json();

    if (!json.sucesso) throw new Error(json.erro);

    pedidosCache = json.dados;
    renderizarTabela(pedidosCache, highlightFirst);
    atualizarKPIs(pedidosCache);
    atualizarWorkflowLogs(pedidosCache);

  } catch (err) {
    toast('error', 'Erro ao carregar', err.message || 'Servidor indisponível.');
  } finally {
    btnRefresh.classList.remove('spinning');
  }
}

// ─── Renderização: Tabela ─────────────────────────────────────

/**
 * Gera as linhas da tabela de pedidos no DOM.
 * Aplica filtros de busca e status se necessário.
 *
 * @param {Array}   pedidos
 * @param {boolean} highlightFirst
 */
function renderizarTabela(pedidos, highlightFirst = false) {
  const busca      = document.getElementById('search-input').value.toLowerCase();
  const filtStatus = document.getElementById('filter-status').value;
  const filtPrio   = document.getElementById('filter-prioridade').value;

  let filtrados = pedidos.filter((p) => {
    const matchBusca  = !busca || p.cliente.toLowerCase().includes(busca) || String(p.id).includes(busca);
    const matchStatus = !filtStatus || p.status === filtStatus;
    const matchPrio   = !filtPrio || p.prioridade === filtPrio;
    return matchBusca && matchStatus && matchPrio;
  });

  const tbody    = document.getElementById('table-body');
  const emptyEl  = document.getElementById('empty-state');
  const badgeEl  = document.getElementById('table-count-badge');

  badgeEl.textContent = `${filtrados.length} registro${filtrados.length !== 1 ? 's' : ''}`;

  if (filtrados.length === 0) {
    tbody.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  tbody.innerHTML = filtrados.map((p, idx) => {
    const prioClass   = p.prioridade === 'Crítica' ? 'critica' : p.prioridade.toLowerCase();
    const statusClass = p.status.toLowerCase().replace(/\s/g, '-').replace('ã', 'a').replace('í', 'i');
    const enderecoStr = p.cidade ? `${p.cidade}/${p.uf}` : null;
    const isNew       = highlightFirst && idx === 0;

    return `
      <tr data-id="${p.id}" class="${isNew ? 'new-row' : ''}">
        <td class="col-id">#${String(p.id).padStart(4, '0')}</td>
        <td style="color: var(--text-bright); font-weight:500;">${p.cliente}</td>
        <td class="col-valor">${formatarMoeda(p.valor)}</td>
        <td>
          <span class="priority-badge ${prioClass}">${p.prioridade}</span>
        </td>
        <td>
          <span class="status-badge ${statusClass}">${p.status}</span>
        </td>
        <td>
          ${enderecoStr
            ? `<span class="addr-text" title="${p.endereco || ''} - ${p.bairro || ''}, ${enderecoStr}">${enderecoStr}</span>`
            : `<span class="addr-empty">—</span>`}
        </td>
        <td style="color: var(--text-muted); font-size: 11px;">${formatarData(p.criado_em)}</td>
        <td>
          <select class="action-select" onchange="alterarStatus(${p.id}, this.value, this)">
            <option value="">Alterar...</option>
            <option value="Novo"       ${p.status === 'Novo'       ? 'disabled' : ''}>Novo</option>
            <option value="Em análise" ${p.status === 'Em análise' ? 'disabled' : ''}>Em análise</option>
            <option value="Aprovado"   ${p.status === 'Aprovado'   ? 'disabled' : ''}>Aprovado</option>
            <option value="Recusado"   ${p.status === 'Recusado'   ? 'disabled' : ''}>Recusado</option>
            <option value="Concluído"  ${p.status === 'Concluído'  ? 'disabled' : ''}>Concluído</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── KPIs ─────────────────────────────────────────────────────

/**
 * Calcula e atualiza os indicadores no topo da página.
 * @param {Array} pedidos
 */
function atualizarKPIs(pedidos) {
  const total   = pedidos.length;
  const analise = pedidos.filter(p => p.status === 'Em análise').length;
  const alta    = pedidos.filter(p => p.prioridade === 'Alta' || p.prioridade === 'Crítica').length;
  const volume  = pedidos.reduce((acc, p) => acc + p.valor, 0);

  document.getElementById('kpi-total').textContent   = total;
  document.getElementById('kpi-analise').textContent = analise;
  document.getElementById('kpi-alta').textContent    = alta;
  document.getElementById('kpi-volume').textContent  =
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(volume);
}

// ─── Workflow Logs ────────────────────────────────────────────

/**
 * Renderiza os logs de workflow do pedido mais recente.
 * Exibe a linha do tempo de automação ao usuário.
 *
 * @param {Array} pedidos - Lista completa de pedidos com logs
 */
function atualizarWorkflowLogs(pedidos) {
  const timeline = document.getElementById('log-timeline');

  if (pedidos.length === 0) {
    timeline.innerHTML = '<div class="log-empty">Aguardando eventos do workflow...</div>';
    return;
  }

  // Mostra os logs do pedido mais recente
  const ultimo = pedidos[0];
  const logs   = ultimo.workflow_logs || [];

  if (logs.length === 0) {
    timeline.innerHTML = '<div class="log-empty">Nenhum log disponível.</div>';
    return;
  }

  timeline.innerHTML = `
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-ghost);padding:0 0 10px;letter-spacing:.05em;text-transform:uppercase;">
      Pedido #${String(ultimo.id).padStart(4,'0')} — ${ultimo.cliente}
    </div>
    ${logs.map(log => {
      let detalhes = '';
      try {
        const d = JSON.parse(log.detalhes || '{}');
        detalhes = Object.entries(d)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(' · ');
      } catch { detalhes = log.detalhes || ''; }

      const hora = new Date(log.executado_em).toLocaleTimeString('pt-BR');

      return `
        <div class="log-entry">
          <div class="log-line"><div class="log-dot"></div></div>
          <div class="log-content">
            <div class="log-event">${log.evento}</div>
            <div class="log-detail">${detalhes}</div>
          </div>
          <div class="log-time">${hora}</div>
        </div>
      `;
    }).join('')}
  `;

  // Scroll automático para o final
  timeline.scrollTop = timeline.scrollHeight;
}

// ─── API: Criar Pedido ────────────────────────────────────────

/**
 * Coleta os dados do formulário, envia ao backend e atualiza a UI.
 * O backend executa o pipeline de automação (workflow) automaticamente.
 */
async function criarPedido() {
  const cliente  = document.getElementById('cliente').value.trim();
  const valor    = parseFloat(document.getElementById('valor').value);
  const cep      = limparCEP(document.getElementById('cep').value);
  const endereco = document.getElementById('addr-logradouro').value;
  const bairro   = document.getElementById('addr-bairro').value;
  const cidade   = document.getElementById('addr-cidade').value;
  const uf       = document.getElementById('addr-uf').value;

  // Validações no frontend
  if (!cliente) { toast('error', 'Campo obrigatório', 'Informe o nome do cliente.'); return; }
  if (!valor || valor <= 0) { toast('error', 'Valor inválido', 'Informe um valor positivo.'); return; }

  // Estado de loading
  const btn     = document.getElementById('btn-submit');
  const spinner = document.getElementById('btn-spinner');
  const btnIcon = document.getElementById('btn-icon-submit');

  btn.disabled       = true;
  spinner.classList.add('visible');
  btnIcon.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente, valor, cep: cep || undefined, endereco, bairro, cidade, uf }),
    });

    const json = await res.json();
    if (!json.sucesso) throw new Error(json.erro);

    const p = json.dados;
    toast('success', 'Pedido criado!', `#${String(p.id).padStart(4,'0')} — Prioridade: ${p.prioridade} | Workflow executado.`);

    // Limpa o formulário
    document.getElementById('cliente').value = '';
    document.getElementById('valor').value   = '';
    document.getElementById('cep').value     = '';
    document.getElementById('addr-logradouro').value = '';
    document.getElementById('addr-bairro').value     = '';
    document.getElementById('addr-cidade').value     = '';
    document.getElementById('addr-uf').value         = '';
    document.getElementById('address-block').classList.remove('visible');
    document.getElementById('preview-value').textContent = '—';
    document.getElementById('preview-value').className   = 'preview-value';

    // Recarrega com destaque na nova linha
    await carregarPedidos(true);

  } catch (err) {
    toast('error', 'Erro ao criar pedido', err.message || 'Verifique a conexão com o servidor.');
  } finally {
    btn.disabled = false;
    spinner.classList.remove('visible');
    btnIcon.style.display = '';
  }
}

// ─── API: Alterar Status ──────────────────────────────────────

/**
 * Envia uma requisição PUT para atualizar o status de um pedido.
 * O backend registra a mudança no log de workflow automaticamente.
 *
 * @param {number} id     - ID do pedido
 * @param {string} status - Novo status
 * @param {HTMLElement} selectEl - Elemento select para resetar
 */
async function alterarStatus(id, status, selectEl) {
  if (!status) return;

  try {
    const res = await fetch(`${API_BASE}/pedidos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    const json = await res.json();
    if (!json.sucesso) throw new Error(json.erro);

    toast('info', 'Status atualizado', `Pedido #${String(id).padStart(4,'0')} → ${status}`);
    await carregarPedidos();

  } catch (err) {
    toast('error', 'Erro ao atualizar', err.message);
    selectEl.value = '';
  }
}

// ─── Event Listeners ─────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Relógio
  iniciarRelogio();

  // Carregar pedidos iniciais
  carregarPedidos();

  // Botão criar pedido
  document.getElementById('btn-submit').addEventListener('click', criarPedido);

  // Preview de prioridade em tempo real
  document.getElementById('valor').addEventListener('input', atualizarPreviewPrioridade);

  // Formatação automática do CEP enquanto digita
  document.getElementById('cep').addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 5) val = val.slice(0, 5) + '-' + val.slice(5, 8);
    e.target.value = val;
  });

  // Buscar CEP pelo botão
  document.getElementById('btn-buscar-cep').addEventListener('click', () => {
    buscarEnderecoPorCEP(document.getElementById('cep').value);
  });

  // Buscar CEP ao pressionar Enter no campo
  document.getElementById('cep').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscarEnderecoPorCEP(e.target.value);
  });

  // Buscar ao pressionar Enter no formulário
  document.getElementById('cliente').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('valor').focus();
  });
  document.getElementById('valor').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') criarPedido();
  });

  // Filtros — atualiza a tabela sem nova requisição
  document.getElementById('search-input').addEventListener('input',
    () => renderizarTabela(pedidosCache));
  document.getElementById('filter-status').addEventListener('change',
    () => renderizarTabela(pedidosCache));
  document.getElementById('filter-prioridade').addEventListener('change',
    () => renderizarTabela(pedidosCache));

  // Botão de refresh manual
  document.getElementById('btn-refresh').addEventListener('click', () => carregarPedidos());

  // Auto-refresh a cada 30 segundos (simula ambiente real)
  setInterval(() => carregarPedidos(), 30000);
});

const API = "";