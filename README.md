# ERP Automation System

> Sistema empresarial de gerenciamento de pedidos com automação de processos, regras de negócio inteligentes e integração com APIs externas.

---

## Sumário

- [Sobre o Projeto](#sobre-o-projeto)
- [Tecnologias](#tecnologias)
- [Funcionalidades](#funcionalidades)
- [Regras de Negócio](#regras-de-negócio)
- [Automação de Processos (Workflow)](#automação-de-processos-workflow)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Como Rodar](#como-rodar)
- [Endpoints da API](#endpoints-da-api)
- [Interface Visual](#interface-visual)

---

## Sobre o Projeto

O **ERP Automation System** é uma aplicação full-stack que simula um módulo de gerenciamento de pedidos de um sistema ERP empresarial. O foco do projeto é demonstrar como processos empresariais podem ser automatizados com regras de negócio claras, rastreabilidade de workflow e integração entre sistemas.

O projeto simula comportamentos encontrados em ferramentas reais como:
- **SAP / Totvs** — gerenciamento de pedidos e status
- **n8n / Zapier** — pipeline de automação de processos
- **Power Automate** — workflows disparados por eventos

---

## Impacto do Projeto

Este sistema foi desenvolvido para simular ganhos reais em um ambiente corporativo, como:

- Redução de tarefas manuais através de automação de processos
- Padronização do fluxo de pedidos
- Tomada de decisão automatizada baseada em regras de negócio
- Integração entre sistemas via APIs
- Rastreabilidade completa de eventos (workflow)

O objetivo é demonstrar como soluções simples podem escalar para cenários empresariais reais.
---

## Tecnologias

| Camada      | Tecnologia         | Motivo                                  |
|-------------|--------------------|-----------------------------------------|
| Backend     | Node.js + Express  | API REST performática e simples         |
| Banco       | SQLite (better-sqlite3) | Persistência sem configuração extra |
| Frontend    | HTML + CSS + JS    | Zero dependências, máximo controle      |
| API Externa | ViaCEP             | Autopreenchimento de endereços          |
| Protocolo   | REST + JSON        | Padrão de integração empresarial        |

---

## Funcionalidades

### Sistema de Pedidos
- Criar pedidos com cliente, valor e endereço (opcional)
- Listar todos os pedidos com filtros e busca
- Atualizar status de qualquer pedido
- Visualizar histórico completo de automação por pedido

### Integração com ViaCEP
- Usuário digita o CEP no formulário
- O sistema consulta automaticamente a API pública ViaCEP
- Logradouro, bairro, cidade e UF são preenchidos automaticamente

### KPIs em Tempo Real
- Total de pedidos
- Pedidos em análise
- Pedidos de alta prioridade
- Volume financeiro total

---

## Regras de Negócio

A prioridade de um pedido é calculada automaticamente no momento da criação, com base no valor:

```
valor > R$ 5.000  →  Prioridade: CRÍTICA  ⚠️
valor > R$ 1.000  →  Prioridade: ALTA
valor ≤ R$ 1.000  →  Prioridade: NORMAL
```

Essa lógica está implementada no backend (`server.js`, função `calcularPrioridade`) e espelhada visualmente no frontend em tempo real conforme o usuário digita o valor.

---

## Automação de Processos (Workflow)

Ao criar um pedido, o sistema executa automaticamente um **pipeline de 5 etapas**, simulando um workflow empresarial (similar ao n8n):

```
[1] PEDIDO_CRIADO
    └─ Registro no banco de dados com timestamp

[2] PRIORIDADE_CALCULADA
    └─ Aplicação da regra de negócio com base no valor

[3] STATUS_ALTERADO
    └─ Transição automática: "Novo" → "Em análise"
    └─ Sem intervenção humana necessária

[4] WEBHOOK_DISPARADO
    └─ Simulação de integração com sistemas externos
    └─ Payload JSON gerado no console (produção: HTTP POST)

[5] ALERTA_PRIORIDADE_ALTA  (condicional)
    └─ Disparado apenas para pedidos Alta/Crítica
    └─ Simula notificação por email e Slack
```

Todos os eventos são **persistidos no banco** na tabela `workflow_logs` e exibidos na interface como uma linha do tempo ao vivo.

---

## Estrutura do Projeto

```
erp-automation/
├── backend/
│   ├── server.js          # Servidor Express + lógica de negócio + workflow
│   ├── package.json       # Dependências do backend
│   └── erp.db             # Banco SQLite (gerado automaticamente)
│
├── frontend/
│   ├── index.html         # Interface do ERP
│   ├── style.css          # Design system industrial dark
│   └── app.js             # Lógica do frontend + integração ViaCEP
│
└── README.md
```

---

## Como Rodar

### Pré-requisitos
- **Node.js** v18+ instalado
- Conexão com internet (para ViaCEP e fontes Google)

### 1. Instalar dependências do backend

```bash
cd backend
npm install
```

### 2. Iniciar o servidor

```bash
node server.js
# ou para desenvolvimento com hot-reload:
npx nodemon server.js
```

O servidor iniciará em: **http://localhost:3000**

### 3. Acessar o frontend

Abra o navegador e acesse:
```
http://localhost:3000
```

O backend já serve os arquivos estáticos do frontend automaticamente.

---

## Endpoints da API

### `GET /pedidos`
Retorna todos os pedidos com seus logs de workflow.

**Resposta:**
```json
{
  "sucesso": true,
  "total": 5,
  "dados": [
    {
      "id": 1,
      "cliente": "Empresa XPTO Ltda",
      "valor": 2500.00,
      "prioridade": "Alta",
      "status": "Em análise",
      "cidade": "São Paulo",
      "uf": "SP",
      "criado_em": "2024-01-15T14:30:00.000Z",
      "workflow_logs": [...]
    }
  ]
}
```

### `POST /pedidos`
Cria um novo pedido e executa o pipeline de automação.

**Body:**
```json
{
  "cliente": "Empresa XPTO Ltda",
  "valor": 2500.00,
  "cep": "01310100",
  "endereco": "Avenida Paulista",
  "bairro": "Bela Vista",
  "cidade": "São Paulo",
  "uf": "SP"
}
```

### `PUT /pedidos/:id`
Atualiza o status de um pedido. Dispara log de workflow e webhook.

**Body:**
```json
{ "status": "Aprovado" }
```

**Status válidos:** `Novo` | `Em análise` | `Aprovado` | `Recusado` | `Concluído`

### `GET /pedidos/:id/logs`
Retorna o histórico completo de automação de um pedido específico.

---

## Interface Visual

### Dashboard Principal
- Header fixo com relógio em tempo real e indicador de workflow ativo
- 4 KPIs atualizados automaticamente após cada operação
- Grid de 2 colunas: formulário à esquerda, tabela à direita

### Formulário de Pedido
- Preview de prioridade calculada em tempo real enquanto o usuário digita o valor
- Busca de CEP com um clique (integração ViaCEP)
- Endereço preenchido automaticamente com animação

### Tabela Operacional
- Busca por cliente ou ID
- Filtros por status e prioridade
- Seletor inline de status para atualização rápida
- Destaque visual automático em novas linhas inseridas

### Linha do Tempo de Workflow
- Exibe os eventos de automação do pedido mais recente
- Atualizada em tempo real após cada criação
- Mostra detalhes técnicos de cada etapa do pipeline

---

## Onde Ocorre a Automação

No arquivo `backend/server.js`, a função `executarWorkflowCriacao()` é o **motor de automação**. Ela é chamada automaticamente após cada `POST /pedidos` e executa:

1. Logs rastreáveis com `registrarWorkflowLog()`
2. Cálculo de prioridade com `calcularPrioridade()`
3. Transição de status sem intervenção humana
4. Disparo de webhook com `simularWebhook()`
5. Alertas condicionais baseados em regras de negócio

---

*Projeto desenvolvido para demonstrar habilidades em automação de processos empresariais, APIs REST, integração com sistemas externos e desenvolvimento full-stack.*
