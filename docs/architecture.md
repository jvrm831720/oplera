# Oplera V0.4 architecture

## Boundary

A Oplera é um Autonomous Revenue Recovery Agent conectado ao CRM da empresa. O CRM continua sendo o system of record comercial; a Oplera persiste e opera apenas estado de recovery.

## Components

1. **CRM Adapter** lista candidatos e lê contexto comercial autorizado.
2. **Discovery Engine** encontra oportunidades stale/lost elegíveis.
3. **Context Builder** normaliza evidências sem inventar fatos.
4. **Recovery Scoring** calcula prioridade reproduzível.
5. **Recovery Planner** escolhe objetivo, canal e próximo `dueAt`.
6. **Policy Engine** decide `allowed`, `blocked` ou `requires_approval`.
7. **Task Queue** controla due work, leasing, retry e idempotência.
8. **Action Executor** é o único boundary de side effect.
9. **Reply Observer** associa resposta à recovery session.
10. **Conversation Agent** classifica intent/objection e propõe continuação.
11. **Human Handoff** encerra autonomia quando necessário.
12. **CRM Sync** registra atividade/estado de volta no provider.

## Runtime

A Operator Console não é necessária para execução. `/api/v0.4/*` fornece bridges server-side e o n8n dispara passos operacionais. Fechar `/demo` não muda o estado do processo servidor.

## Data model

Entidades conceituais: `recovery_opportunities`, `recovery_sessions`, `recovery_tasks`, `recovery_messages`, `recovery_decisions`, `recovery_events`, `recovery_policies`, `recovery_handoffs` e `provider_connections`.

A Demo Mode materializa essas formas em schemas Zod e memória. O projeto base não contém PostgreSQL, então a V0.4 não introduz um banco apenas para parecer mais enterprise. Em produção, `recovery_tasks` deve usar claim transacional com `FOR UPDATE SKIP LOCKED`, lease expiry e idempotency key única.

## Provider boundaries

Nenhuma tool recebe acesso genérico ao banco. O código expõe providers pequenos para CRM, messaging, calendar e AI. O executor depende dessas interfaces e o Demo Mode usa implementações sem rede.

## Auditability

`recovery_events` registra timestamp, opportunity/task, actor, action, input summary, decision, policy result, tool, result e error. Não registra secrets nem chain-of-thought.
