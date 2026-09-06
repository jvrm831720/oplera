# Oplera V0.5 — Seller Copilot Foundation

## Objetivo

A V0.5 adiciona uma segunda forma de atuação sobre o mesmo contexto de receita da Oplera:

- **Agente de Receita**: trabalha autonomamente dentro das policies existentes;
- **Copilot do Vendedor**: apresenta ao vendedor contexto comercial e o próximo melhor passo.

Os dois reutilizam o mesmo Recovery Score, Planner, Policy Engine, Conversation Agent, tarefas, mensagens, eventos, decisões, handoffs e estado de piloto. A V0.5 não cria um segundo cérebro.

## Modelo comercial

A Oplera continua sendo um **managed service**. O cliente não cria nem configura agentes, prompts, ferramentas ou automações. A equipe Oplera conecta os sistemas, configura comportamento e policies e entrega a operação pronta.

Por isso, a interface principal não contém agent builder nem composer de prompt.

## Escopo deliberadamente excluído

A V0.5 não implementa geração de leads, Apollo, Clay, scraping, enrichment, cold email, sequencing, LinkedIn automation, AI SDR, banco de contatos frios, novo canal ou novo conector.

A versão continua focada em receita que já entrou na operação comercial.

## Revenue Context Layer

`RevenueContextService` agrega, de forma read-only:

### HubSpot

Reutiliza o `HubSpotCRMProvider` existente. O mesmo provider entrega:

- deal;
- contact;
- company;
- notes;
- calls;
- emails;
- meetings;
- stage;
- amount;
- owner;
- activity;
- transcript notes da Oplera.

Não existe segundo HubSpot client nem segunda autenticação.

### Estado interno Oplera

`PostgresInternalRevenueContextReader` consulta somente tabelas existentes:

- `recovery_opportunities`;
- `recovery_sessions`;
- `recovery_tasks`;
- `recovery_messages`;
- `recovery_decisions`;
- `recovery_events`;
- `recovery_handoffs`;
- `pilot_approvals`;
- `pilot_outbound_operations`;
- `pilot_inbound_messages`.

Nenhuma migration ou tabela nova é necessária.

### WhatsApp

A camada reutiliza mensagens e provider IDs já persistidos pela Oplera e as transcript notes do HubSpot. `resolveServiceWindow()` continua sendo a única fonte de verdade para a janela de 24 horas.

## Next Best Action

`SellerCopilotEngine` é determinístico e não usa LLM.

Precedência de segurança:

1. opt-out / suppressed / policy blocked;
2. handoff ou revisão humana;
3. conversa humana ativa;
4. tarefa existente já decidida pelo Planner;
5. intenção positiva ou objeção classificada pelo Conversation Agent;
6. inbound sem resposta;
7. estratégia de recuperação existente;
8. revisão da oportunidade quando faltam evidências.

Sugestões de outbound passam pelo Policy Engine. Quando o resultado é `blocked`, o Copilot não sugere contato. Quando é `requires_approval`, a interface mostra a exigência e não oferece mensagem copiável como se estivesse liberada.

## API V0.5

Todos os endpoints exigem:

```http
Authorization: Bearer <COPILOT_ACCESS_TOKEN>
```

Endpoints:

- `GET /api/v0.5/copilot/health`
- `POST /api/v0.5/copilot/resolve`
- `GET /api/v0.5/copilot/context/:opportunityId`

### Resolver contato

`POST /api/v0.5/copilot/resolve` aceita uma combinação de:

```json
{
  "phone": "+5521999999999",
  "name": "Mariana Costa",
  "email": "mariana@example.com",
  "company": "Clínica Aurora",
  "query": "Mariana"
}
```

A busca opera apenas sobre deals allowlisted no piloto HubSpot existente. Ela não cria contato, lead ou oportunidade.

## Autorização e CORS

Variáveis:

```bash
COPILOT_ACCESS_TOKEN=<token com pelo menos 32 caracteres>
COPILOT_ALLOWED_ORIGINS=chrome-extension://<extension-id>
COPILOT_HUBSPOT_PORTAL_ID=<opcional>
```

`COPILOT_ALLOWED_ORIGINS` é lista separada por vírgula e rejeita `*`.

Isto é autenticação de piloto, não identidade de plataforma. A V0.5 não implementa usuários, organizações, RBAC, SSO, Supabase Auth ou multi-tenancy completo.

## Chrome Extension

Diretório:

`extensions/oplera-copilot/`

Nome: **Oplera Copilot**

Target único: `https://web.whatsapp.com/*`

A extensão usa Manifest V3 e Chrome Side Panel API.

### Instalação local

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione `extensions/oplera-copilot/`.
5. Copie o ID gerado pelo Chrome.
6. Configure no backend:

```bash
COPILOT_ALLOWED_ORIGINS=chrome-extension://<id-gerado>
```

7. Abra **Detalhes > Opções da extensão**.
8. Informe a URL da API Oplera e o token `COPILOT_ACCESS_TOKEN`.

Ao salvar a URL, a extensão solicita permissão somente para aquela origem HTTP/HTTPS. As permissões HTTP/HTTPS estão declaradas como opcionais no manifest, não concedidas por padrão.

## Dados locais da extensão

`chrome.storage.local` pode conter:

- `apiBaseUrl`;
- `accessToken`;
- `conversationMappings`;
- `lastSelection`.

A extensão nunca recebe ou armazena:

- `HUBSPOT_ACCESS_TOKEN`;
- `WHATSAPP_ACCESS_TOKEN`;
- `DATABASE_URL`;
- senha do PostgreSQL/Supabase;
- service role;
- Meta App Secret.

## WhatsApp Web

O content script faz somente detecção mínima no cabeçalho visível da conversa atual:

- título/nome visível;
- telefone quando o próprio título já contém um número;
- contexto da aba.

Ele não:

- percorre o histórico de mensagens;
- abre menus;
- clica na interface;
- envia mensagens;
- captura QR code;
- captura credenciais;
- lê outras conversas.

O histórico exibido no Copilot vem do backend Oplera.

## Resolução ambígua e não encontrada

Se a resolução retornar vários matches, o side panel mostra **“Encontramos mais de um contato”** e deixa o vendedor selecionar.

Se não houver match, mostra **“Contato não encontrado na Oplera”** e a busca **“Buscar no CRM”** por nome, telefone ou e-mail. A busca não cria registros.

## Localização

A aplicação principal e a extensão usam PT-BR. Datas e números usam `Intl` com locale `pt-BR`; valores da interface principal são BRL. Enums e contratos internos permanecem em inglês para preservar compatibilidade.

## Limitações do piloto

- token compartilhado de piloto, sem identidade por vendedor;
- resolução limitada aos deals já allowlisted no HubSpot pilot;
- link “Abrir no HubSpot” depende de `COPILOT_HUBSPOT_PORTAL_ID`;
- o Copilot é read-only nesta versão, exceto por copiar uma mensagem já considerada segura para a área de transferência do vendedor;
- a extensão nunca envia mensagem pelo WhatsApp Web.
