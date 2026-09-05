# n8n setup

A V0.4 usa n8n como orquestrador operacional, não como lugar da lógica crítica.

## Import

1. Inicie a API Oplera com `bun run dev:api`.
2. No n8n, configure a variável `OPLERA_BASE_URL`, por exemplo `http://host.docker.internal:3001` quando n8n estiver em Docker e a API no host.
3. Importe os nove JSON em `n8n/workflows/`.
4. Mantenha todos desativados até revisar URL, autenticação/rede e providers do ambiente.
5. Em Demo Mode, execute manualmente os workflows 01–08. O 09 contém o dispatcher genérico e também fica `active=false` no export.

Nenhum workflow contém API key ou secret.

## Workflows

1. CRM Intake / Discovery
2. Recovery Analysis
3. Recovery Planner
4. Policy Gate
5. Outreach
6. Incoming Reply
7. Conversation Agent
8. Human Handoff
9. Follow-up Scheduler

Os workflows 01–08 chamam `/api/v0.4/agent-step`, que delega comportamento ao código versionado. O 09 chama `/api/v0.4/dispatch`.

## Produção

Antes de habilitar side effects reais, configure autenticação do bridge, provider credentials em secret store/env, webhook verification e uma task store durável. A Demo V0.4 não contém credenciais reais e não habilita envio real.
