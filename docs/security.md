# Security and privacy

## Autonomy gates

Não existe caminho `reason → unrestricted side effect`. O executor só chama provider após Policy Engine retornar `allowed`.

## Input and output validation

Schemas Zod validam estados, tool inputs e HTTP payloads V0.4. Structured AI output deve passar por schema antes de entrar no domínio.

## Secrets

Credenciais não pertencem ao frontend, exports n8n, logs ou audit events. Providers reais futuros devem receber secrets por environment/secret store.

## Messaging safety

Opt-out, suppression, tentativa máxima, intervalos, horário/dia, conversa humana ativa e regras comerciais são verificados antes do envio. WhatsApp usa o service window existente como gate. `DemoMessagingProvider` não envia tráfego de rede.

## Idempotency and retries

Tasks e sends têm idempotency key. A fila Demo deduplica e recupera leases expirados. Retry é explícito e limitado por `maxAttempts`.

## Audit privacy

Eventos guardam resumo factual, decisão e resultado. Não guardar chain-of-thought, secrets ou PII além do necessário ao caso operacional.

## Webhooks

O endpoint demo de replies valida payload, mas uma integração real deve adicionar verificação criptográfica/assinatura específica do provider antes de aceitar webhook público.

## Rate limits

A V0.4 demonstra orçamento por `maxAttempts`, scheduler único e policy intervals. Rate limiting de borda para providers reais deve ser configurado junto ao adapter contratado; nenhum provider real está habilitado neste MVP.
