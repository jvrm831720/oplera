# Agent lifecycle

## 1. Discover

O CRM provider fornece candidatos. Discovery normaliza contexto e registra evento.

## 2. Score

Sinais determinísticos produzem `recoveryScore`, reason code e justificativa factual.

## 3. Plan

O planner escolhe estratégia, objetivo, canal, tentativas e timing.

## 4. Policy

Antes de side effect, o Policy Engine verifica contact policy, commercial policy e regras do canal. WhatsApp chama a regra V0.1.1 de 24h.

## 5. Queue

A ação vira task com `dueAt`, prioridade, attempt, lease e idempotency key. Um dispatcher genérico busca due work.

## 6. Execute

Somente provider abstractions executam efeitos. O DemoMessagingProvider não usa rede e deduplica idempotency keys.

## 7. Observe reply

Resposta é associada à opportunity/session e classificada por intent/objection.

## 8. Continue or handoff

Opt-out suprime, no-interest encerra, objeções simples podem continuar dentro de policy e alta intenção/contrato/reclamação/human request viram handoff.

## 9. Audit and sync

Ações e decisões estruturadas entram no audit trail. O CRM provider recebe activity/status sem reasoning interno.
