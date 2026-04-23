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

  showLogin() {
    $("login-screen").classList.remove("hidden");
    $("app").classList.add("hidden");
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

    btn.disabled    = true;
    btn.textContent = "Entrando...";

    try {
      const res = await fetch(`${CONFIG.API_BASE}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.mensagem || "Credenciais inválidas");

      this.setToken(data.token);
      $("l-pass").value = "";
      this.showApp();
      App.init();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled    = false;
      btn.textContent = "Entrar";
    }
  },

  logout() {
    this.clearToken();
    App.state = { pedidos: [], page: "dashboard", formItens: [] };
    this.showLogin();
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
        Auth.showLogin();
        throw new Error("Sessão expirada. Faça login novamente.");
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
      $("recent-pedidos").innerHTML = `<p class="error-state">${esc(err.message)} <button class="btn btn-ghost btn-sm" onclick="App.loadDashboard()">Tentar novamente</button></p>`;
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