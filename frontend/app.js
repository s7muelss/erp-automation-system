/**
 * ERP Automation System — Frontend App
 * SPA puro (sem frameworks)
 * Detecta automaticamente a URL da API (dev vs produção)
 */

// ─── Configuração da API ──────────────────────────────────────────────────────
const CONFIG = {
  // Em produção usa a env var injetada pelo Vercel, ou a URL do Render
  // Em dev usa localhost
  API_BASE: (() => {
    // window.ENV_API_URL pode ser setada no HTML por um script de env
    if (window.ENV_API_URL) return window.ENV_API_URL.replace(/\/$/, "");

    // Se o próprio backend estiver servindo o frontend (mesmo domínio)
    const sameOrigin = window.location.origin;
    if (!sameOrigin.includes("localhost") && !sameOrigin.includes("127.0.0.1")) {
      // Verifica se é o Vercel (frontend separado) ou o Render (mesmo servidor)
      if (sameOrigin.includes("vercel.app") || sameOrigin.includes("vercel")) {
        // Frontend no Vercel → aponta para Render
        return "https://erp-automation-system.onrender.com/api";
      }
      // Se não é Vercel, assume mesmo servidor
      return `${sameOrigin}/api`;
    }

    // Localhost dev
    return "http://localhost:3000/api";
  })(),
};

console.log("🔗 API Base URL:", CONFIG.API_BASE);

// ─── Utilitários ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const toast = (msg, type = "info") => {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $("toast-container").appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3500);
};

const statusLabel = {
  pendente:    { text: "Pendente",     emoji: "📬", cls: "status-pending" },
  em_andamento:{ text: "Em Andamento", emoji: "⚡", cls: "status-progress" },
  concluido:   { text: "Concluído",    emoji: "✅", cls: "status-done" },
  cancelado:   { text: "Cancelado",    emoji: "🚫", cls: "status-canceled" },
};

const prioLabel = {
  alta:  { text: "Alta",  cls: "prio-alta" },
  media: { text: "Média", cls: "prio-media" },
  baixa: { text: "Baixa", cls: "prio-baixa" },
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── API Client ───────────────────────────────────────────────────────────────
const API = {
  async request(method, path, body = null) {
    const url = `${CONFIG.API_BASE}${path}`;
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.mensagem || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        throw new Error("Sem conexão com a API. Verifique se o backend está rodando.");
      }
      throw err;
    }
  },

  get:    (path)       => API.request("GET",  path),
  post:   (path, body) => API.request("POST", path, body),
  put:    (path, body) => API.request("PUT",  path, body),

  pedidos:  () => API.get("/pedidos"),
  pedido:   (id) => API.get(`/pedidos/${id}`),
  criar:    (body) => API.post("/pedidos", body),
  atualizar:(id, body) => API.put(`/pedidos/${id}`, body),
  logs:     (id) => API.get(`/pedidos/${id}/logs`),
  health:   () => API.get("/health"),
};

// ─── App Principal ────────────────────────────────────────────────────────────
const App = {
  state: {
    pedidos: [],
    page: "dashboard",
  },

  // ── Navegação ──────────────────────────────────────────────────
  navigate(page) {
    this.state.page = page;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

    const el = $(`page-${page}`);
    if (el) el.classList.add("active");

    const navEl = document.querySelector(`[data-page="${page}"]`);
    if (navEl) navEl.classList.add("active");

    const titles = { dashboard: "Dashboard", pedidos: "Pedidos", novo: "Novo Pedido" };
    $("page-title").textContent = titles[page] || page;

    if (page === "dashboard") this.loadDashboard();
    if (page === "pedidos")   this.loadPedidos();
  },

  // ── Carregamento ───────────────────────────────────────────────
  async loadDashboard() {
    try {
      const { pedidos } = await API.pedidos();
      this.state.pedidos = pedidos;

      const counts = pedidos.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {});

      $("stat-pendente").textContent  = counts.pendente     || 0;
      $("stat-andamento").textContent = counts.em_andamento || 0;
      $("stat-concluido").textContent = counts.concluido    || 0;
      $("stat-total").textContent     = pedidos.length;

      const recentes = [...pedidos].reverse().slice(0, 5);
      $("recent-pedidos").innerHTML = recentes.length
        ? recentes.map(p => this.renderPedidoCard(p)).join("")
        : '<p class="empty-state">Nenhum pedido ainda. <a href="#" onclick="App.navigate(\'novo\')">Criar primeiro pedido</a></p>';

    } catch (err) {
      $("recent-pedidos").innerHTML = `<p class="error-state">❌ ${err.message}</p>`;
    }
  },

  async loadPedidos() {
    const container = $("pedidos-container");
    container.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      const status  = $("filter-status")?.value || "";
      const cliente = $("filter-cliente")?.value || "";
      let url = "/pedidos";
      const params = new URLSearchParams();
      if (status)  params.set("status",  status);
      if (cliente) params.set("cliente", cliente);
      if ([...params].length) url += `?${params}`;

      const { pedidos } = await API.get(url);
      this.state.pedidos = pedidos;

      container.innerHTML = pedidos.length
        ? pedidos.map(p => this.renderPedidoCard(p)).join("")
        : '<p class="empty-state">Nenhum pedido encontrado.</p>';
    } catch (err) {
      container.innerHTML = `<p class="error-state">❌ ${err.message}</p>`;
    }
  },

  filterPedidos() {
    clearTimeout(this._filterTimer);
    this._filterTimer = setTimeout(() => this.loadPedidos(), 300);
  },

  refreshData() {
    this.navigate(this.state.page);
    toast("Dados atualizados", "info");
  },

  // ── Render de cards ────────────────────────────────────────────
  renderPedidoCard(p) {
    const s = statusLabel[p.status] || { text: p.status, emoji: "❓", cls: "" };
    const pr = prioLabel[p.prioridade] || { text: p.prioridade, cls: "" };
    return `
      <div class="pedido-card" onclick="App.verDetalhes('${p.id}')">
        <div class="pedido-card-header">
          <span class="pedido-id">${p.id}</span>
          <span class="status-badge ${s.cls}">${s.emoji} ${s.text}</span>
        </div>
        <div class="pedido-card-body">
          <div class="pedido-cliente">👤 ${p.cliente}</div>
          <div class="pedido-desc">${p.descricao}</div>
        </div>
        <div class="pedido-card-footer">
          <span class="prio-badge ${pr.cls}">🏷 ${pr.text}</span>
          <span class="pedido-date">📅 ${formatDate(p.criadoEm)}</span>
          <span class="pedido-logs">📝 ${(p.logs||[]).length} log(s)</span>
        </div>
      </div>`;
  },

  // ── Criar Pedido ───────────────────────────────────────────────
  addItem() {
    const container = $("itens-container");
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input type="text" placeholder="Nome do item" class="item-nome" />
      <input type="number" placeholder="Qtd" class="item-qtd" min="1" value="1" />
      <button class="btn-remove-item" onclick="App.removeItem(this)">✕</button>`;
    container.appendChild(row);
  },

  removeItem(btn) {
    const rows = $("itens-container").querySelectorAll(".item-row");
    if (rows.length > 1) btn.closest(".item-row").remove();
  },

  async criarPedido() {
    const cliente   = $("f-cliente").value.trim();
    const descricao = $("f-descricao").value.trim();
    const prioridade = $("f-prioridade").value;

    if (!cliente)   return toast("Cliente é obrigatório", "error");
    if (!descricao) return toast("Descrição é obrigatória", "error");

    const itens = [];
    document.querySelectorAll(".item-row").forEach(row => {
      const nome = row.querySelector(".item-nome").value.trim();
      const qtd  = parseInt(row.querySelector(".item-qtd").value) || 1;
      if (nome) itens.push({ nome, quantidade: qtd });
    });

    const btn = document.querySelector('[onclick="App.criarPedido()"]');
    btn.disabled = true;
    btn.textContent = "Criando...";

    try {
      const pedido = await API.criar({ cliente, descricao, prioridade, itens });
      toast(`Pedido ${pedido.id} criado com sucesso! ✅`, "success");
      $("f-cliente").value  = "";
      $("f-descricao").value = "";
      $("f-prioridade").value = "media";
      $("itens-container").innerHTML = `
        <div class="item-row">
          <input type="text" placeholder="Nome do item" class="item-nome" />
          <input type="number" placeholder="Qtd" class="item-qtd" min="1" value="1" />
          <button class="btn-remove-item" onclick="App.removeItem(this)">✕</button>
        </div>`;
      setTimeout(() => this.navigate("pedidos"), 1200);
    } catch (err) {
      toast(`Erro: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Criar Pedido";
    }
  },

  // ── Modal de Detalhes ──────────────────────────────────────────
  async verDetalhes(id) {
    $("modal-content").innerHTML = '<div class="loading-spinner">Carregando...</div>';
    $("modal-overlay").classList.remove("hidden");
    document.body.style.overflow = "hidden";

    try {
      const [pedido, logsData] = await Promise.all([
        API.pedido(id),
        API.logs(id),
      ]);

      const s  = statusLabel[pedido.status] || { text: pedido.status, emoji: "❓", cls: "" };
      const pr = prioLabel[pedido.prioridade] || { text: pedido.prioridade, cls: "" };

      // Ações disponíveis
      const workflow = {
        pendente:    ["em_andamento", "cancelado"],
        em_andamento:["concluido", "cancelado"],
        concluido:   [],
        cancelado:   [],
      };
      const acoes = workflow[pedido.status] || [];

      const acoesHTML = acoes.length ? `
        <div class="modal-actions">
          <strong>Alterar Status:</strong>
          <div class="action-btns">
            ${acoes.map(a => `
              <button class="btn btn-action btn-${a.replace("_","-")}" 
                onclick="App.alterarStatus('${id}', '${a}')">
                ${statusLabel[a]?.emoji} ${statusLabel[a]?.text}
              </button>`).join("")}
          </div>
        </div>` : `<p class="status-final">Status final: <strong>${s.text}</strong></p>`;

      const itensHTML = pedido.itens?.length
        ? `<ul class="itens-list">${pedido.itens.map(i =>
            `<li>${i.nome} — <strong>${i.quantidade}x</strong></li>`
          ).join("")}</ul>`
        : "<p>Sem itens cadastrados</p>";

      const logsHTML = logsData.logs?.length
        ? logsData.logs.map(l => `
            <div class="log-item">
              <span class="log-acao">${l.acao || "ação"}</span>
              <span class="log-desc">${l.descricao}</span>
              <span class="log-time">${formatDate(l.timestamp)}</span>
            </div>`).join("")
        : "<p>Sem logs</p>";

      $("modal-content").innerHTML = `
        <div class="modal-header">
          <h2>${pedido.id}</h2>
          <span class="status-badge ${s.cls}">${s.emoji} ${s.text}</span>
        </div>
        <div class="modal-grid">
          <div class="modal-section">
            <label>Cliente</label>
            <p>${pedido.cliente}</p>
          </div>
          <div class="modal-section">
            <label>Prioridade</label>
            <p><span class="prio-badge ${pr.cls}">${pr.text}</span></p>
          </div>
          <div class="modal-section full-width">
            <label>Descrição</label>
            <p>${pedido.descricao}</p>
          </div>
          <div class="modal-section">
            <label>Criado em</label>
            <p>${formatDate(pedido.criadoEm)}</p>
          </div>
          <div class="modal-section">
            <label>Atualizado em</label>
            <p>${formatDate(pedido.atualizadoEm)}</p>
          </div>
          <div class="modal-section full-width">
            <label>Itens</label>
            ${itensHTML}
          </div>
        </div>
        ${acoesHTML}
        <div class="logs-section">
          <h3>📝 Histórico de Logs (${logsData.totalLogs})</h3>
          <div class="logs-list">${logsHTML}</div>
        </div>`;
    } catch (err) {
      $("modal-content").innerHTML = `<p class="error-state">❌ ${err.message}</p>`;
    }
  },

  async alterarStatus(id, novoStatus) {
    try {
      await API.atualizar(id, { status: novoStatus });
      const s = statusLabel[novoStatus];
      toast(`Status atualizado para ${s?.text} ${s?.emoji}`, "success");
      this.closeModal();
      this.loadDashboard();
      if (this.state.page === "pedidos") this.loadPedidos();
    } catch (err) {
      toast(`Erro: ${err.message}`, "error");
    }
  },

  closeModal(event) {
    if (event && event.target !== $("modal-overlay")) return;
    $("modal-overlay").classList.add("hidden");
    document.body.style.overflow = "";
  },

  // ── Health Check ───────────────────────────────────────────────
  async checkAPIStatus() {
    const badge = $("api-status");
    try {
      const h = await API.health();
      badge.textContent = `✅ API Online`;
      badge.className   = "api-badge online";
    } catch {
      badge.textContent = `❌ API Offline`;
      badge.className   = "api-badge offline";
    }
  },

  // ── Boot ───────────────────────────────────────────────────────
  init() {
    // Bind navegação
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", e => {
        e.preventDefault();
        this.navigate(item.dataset.page);
      });
    });

    // ESC fecha modal
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") this.closeModal();
    });

    // Verifica API e carrega dashboard
    this.checkAPIStatus();
    this.navigate("dashboard");

    // Re-verifica API a cada 60s
    setInterval(() => this.checkAPIStatus(), 60_000);
  },
};

// Boot quando DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => App.init());
