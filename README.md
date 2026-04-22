# ERP Automation System

> Sistema completo de automação de pedidos com backend em Node.js puro, pipeline de workflow inteligente, logs de auditoria e arquitetura distribuída (Vercel + Render).

---

## 👨‍💻 Autor

**Samuel Alves de Sousa**

Projeto desenvolvido com foco em engenharia de software, automação de processos e simulação de sistemas corporativos reais (ERP/SaaS).

---

## 📌 Visão do Projeto

O **ERP Automation System** simula um ambiente real de ERP corporativo, com foco em:

- Automação de processos internos (workflow engine)
- Controle de pedidos em tempo real
- Registro completo de auditoria (audit log)
- Integração frontend + backend desacoplado
- Arquitetura pronta para escalabilidade (SaaS)

---

## ⚙️ Arquitetura do Sistema


Frontend (Vercel)
↓
API REST (Render - Node.js puro)
↓
Persistência local (JSON - simulação de banco)
↓
Workflow Engine (automação de processos internos)


---

## 🚀 Funcionalidades

### 📦 Gestão de Pedidos
- Criar pedidos via interface ou API
- Atualizar status em tempo real
- Consulta completa de histórico

---

### 🔄 Motor de Workflow (Core do sistema)

Cada pedido passa automaticamente por um pipeline de automação:

- Registro de criação do pedido
- Cálculo automático de prioridade:
  - Normal
  - Alta
  - Crítica
- Transição automática de status
- Registro de logs (audit trail)
- Simulação de webhook externo
- Alertas para pedidos críticos

---

### 📊 Sistema de Auditoria (Logs)

Cada ação no sistema gera um log estruturado:

- Evento executado
- Data e hora
- Dados anteriores e novos
- ID do pedido relacionado

> Simula sistemas reais como SAP, TOTVS e ERPs corporativos.

---

### 🌐 Frontend Inteligente

- Interface responsiva
- Atualização dinâmica sem reload
- Filtros por status e prioridade
- Busca de pedidos em tempo real
- Preview de prioridade ao digitar valor
- Integração com ViaCEP (autopreenchimento de endereço)

---

## 🧠 Decisões Técnicas

### ✔ Backend sem frameworks
Uso de Node.js puro (`http` nativo) para demonstrar:
- Controle total de requisições HTTP
- Baixa dependência de bibliotecas
- Clareza na arquitetura backend

---

### ✔ Persistência leve (JSON)
- Simulação de banco de dados
- Fácil migração para PostgreSQL ou MongoDB
- Ideal para prototipação e MVP

---

### ✔ Arquitetura separada
- Frontend: Vercel (CDN + SPA)
- Backend: Render (API REST)

---

## 🔌 API Endpoints

### 📡 Pedidos

| Método | Endpoint | Descrição |
|--------|----------|----------|
| GET | `/api/pedidos` | Lista todos os pedidos |
| POST | `/api/pedidos` | Cria novo pedido |
| PUT | `/api/pedidos/:id` | Atualiza status |
| GET | `/api/pedidos/:id/logs` | Histórico de logs |

---

## 🔁 Workflow Automático

Quando um pedido é criado:

Pedido registrado
Prioridade calculada automaticamente
Status → "Em análise"
Webhook simulado disparado
Logs de auditoria gerados
Alertas enviados (caso prioridade alta/crítica)

---

## 🧪 Exemplo de Requisição

### Criar pedido
```bash
POST /api/pedidos
Content-Type: application/json

{
  "cliente": "Empresa X",
  "valor": 3500
}
Resposta
{
  "sucesso": true,
  "dados": {
    "id": 1,
    "cliente": "Empresa X",
    "valor": 3500,
    "prioridade": "Alta",
    "status": "Em análise",
    "criado_em": "2026-04-22T..."
  }
}
🧩 Tecnologias Utilizadas
Backend
Node.js (HTTP nativo)
File System (fs)
JSON (persistência local)
Routing manual
Frontend
HTML5
CSS3
JavaScript (Vanilla JS)
Fetch API
Integrações
ViaCEP API (autopreenchimento de endereço)
☁️ Deploy
Backend (Render)
Node.js Web Service
Porta dinâmica (process.env.PORT)
Root Directory configurado corretamente
Frontend (Vercel)
Hosting estático
SPA fallback ativado
Comunicação com API externa
🎯 Diferenciais do Projeto

✔ Sistema inspirado em ERP real
✔ Pipeline de automação (workflow engine)
✔ Logs de auditoria completos
✔ Arquitetura moderna (frontend + backend separados)
✔ Deploy em produção (Render + Vercel)
✔ Sem frameworks (controle total da stack)
✔ Simulação de ambiente SaaS escalável

📈 Objetivo do Projeto

Este projeto foi desenvolvido para demonstrar:

Capacidade de engenharia de software
Construção de sistemas backend reais
Arquitetura de aplicações escaláveis
Integração frontend/backend profissional
Mentalidade de produto (SaaS)