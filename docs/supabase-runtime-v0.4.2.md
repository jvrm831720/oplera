# Oplera V0.4.2 — Durable Supabase Runtime

A V0.4.2 troca somente a persistência operacional da Oplera. Recovery Engine, Recovery Score, Planner, Policy Engine, Conversation Agent, HubSpot e WhatsApp Cloud API mantêm a semântica da V0.4/V0.4.1.

Supabase é usado nesta versão apenas como PostgreSQL gerenciado. O código usa `DATABASE_URL` e funciona com PostgreSQL compatível sem APIs proprietárias do Supabase.

## Projeto de piloto

Referência do projeto já criado:

- Project ref: `hcbkcywxwyzlntkcizyi`
- Project URL: `https://hcbkcywxwyzlntkcizyi.supabase.co`

Nenhuma credencial real deve ser adicionada ao Git. Não use publishable key, service-role key ou Supabase Auth para o runtime V0.4.2.

## 1. DATABASE_URL

No Supabase Dashboard, obtenha uma connection string PostgreSQL adequada ao ambiente do backend. Prefira a opção recomendada pelo próprio projeto para processos server-side e conectividade disponível no host.

Configure somente no ambiente do servidor:

```env
DATABASE_URL=
```

A aplicação aceita URLs `postgres://` ou `postgresql://`.

Nunca exponha `DATABASE_URL` no frontend, em workflows públicos, logs, screenshots ou respostas de API. A aplicação não imprime a connection string nem a senha.

Em produção, `DATABASE_URL` é obrigatório. Sem ela, o startup falha com `database_url_required`.

Em desenvolvimento sem `DATABASE_URL`, o Demo Mode continua usando a fila em memória e o piloto pode usar o SQLite local configurado por `PILOT_STATE_DB_PATH`. Esse fallback existe para desenvolvimento/testes, não é o modo recomendado de produção.

## 2. Schema e segurança

As migrations criam um schema privado:

```text
oplera
```

O schema contém somente estado operacional necessário ao recovery:

- `recovery_opportunities`
- `recovery_sessions`
- `recovery_tasks`
- `recovery_messages`
- `recovery_decisions`
- `recovery_events`
- `recovery_handoffs`
- `pilot_approvals`
- `pilot_outbound_operations`
- `pilot_inbound_messages`
- `schema_migrations`

O schema não precisa ser exposto pela Supabase Data API. A migration revoga acesso de `PUBLIC` e, quando os roles Supabase existem, também revoga acesso do schema/tabelas para `anon` e `authenticated`.

O backend acessa o banco diretamente pela conexão PostgreSQL. Não coloque chaves de banco ou service role no navegador.

`recovery_events` é append-only para a aplicação: a migration instala um trigger que rejeita `UPDATE` e `DELETE`.

## 3. Executar migrations

Instale dependências:

```bash
bun install --frozen-lockfile
```

Com `DATABASE_URL` configurada no ambiente do processo:

```bash
bun run db:migrate
```

O migration runner:

1. cria `oplera.schema_migrations` se necessário;
2. lê arquivos `db/migrations/*.sql` em ordem;
3. ignora versões já registradas;
4. aplica cada migration pendente dentro de transação;
5. registra a versão aplicada.

A migration inicial é:

```text
db/migrations/0001_durable_runtime.sql
```

O CI executa a migration em PostgreSQL vazio e executa novamente depois dos testes para verificar repetibilidade do runner.

## 4. Validar o banco

Após aplicar migrations, valide diretamente:

```bash
bun run db:migrate
```

Uma segunda execução sem novas migrations deve terminar sem reaplicar a migration anterior.

Com o piloto configurado, consulte:

```text
GET /api/v0.4.1/pilot/health
```

Em V0.4.2 a resposta inclui, sem detalhes de conexão:

```json
{
  "status": "ok",
  "version": "0.4.2",
  "database": "ok",
  "persistence": "postgres"
}
```

Falha de conexão retorna `503` e `database: "error"`. O endpoint não retorna host, usuário, password ou connection string.

## 5. Durable Task Queue

Produção usa `PostgresTaskQueue`. O Demo Mode mantém `MemoryTaskQueue` para execução rápida local.

A aquisição de tarefas é transacional e usa:

```sql
FOR UPDATE SKIP LOCKED
```

A sequência é equivalente a:

```text
BEGIN
  selecionar tasks elegíveis e travá-las com SKIP LOCKED
  atualizar status para leased
  registrar leased_at e leased_by
  incrementar attempt
COMMIT
```

A ordenação permanece:

1. maior `priority`;
2. menor `due_at`;
3. `id` como desempate determinístico.

Tasks em `leased` ou `running` voltam a ser elegíveis após expiração do lease, desde que `attempt < max_attempts`. Lease expirado que já atingiu `max_attempts` vira `failed`.

A constraint UNIQUE de `idempotency_key` impede enqueues duplicados da mesma operação.

## 6. Pilot State PostgreSQL

Produção usa `PostgresPilotStateStore` no mesmo PostgreSQL.

O store persiste:

### Aprovação humana

`pilot_approvals` armazena:

- opportunity ID;
- attempt;
- fingerprint SHA-256 existente;
- operador;
- horário de aprovação;
- consumo da aprovação.

Aprovação continua vinculada ao fingerprint da ação. Mudança de mensagem, estratégia, attempt, message mode ou template produz outro fingerprint e a aprovação anterior não é encontrada.

### Outbound

`pilot_outbound_operations` registra a operação **antes** da chamada ao WhatsApp.

Estados:

- `reserved`: operação foi reservada e somente um processo pode iniciar o envio;
- `accepted`: provider retornou `provider_message_id` e ele foi persistido;
- `writeback_completed`: HubSpot foi atualizado;
- `uncertain`: houve falha de rede ou resposta ambígua depois de iniciar a chamada e não é seguro reenviar automaticamente.

Fluxo crítico:

```text
reserve idempotency key
→ WhatsApp aceita
→ persist provider_message_id
→ processo cai
→ processo reinicia
→ encontra provider_message_id
→ NÃO chama WhatsApp novamente
→ executa writeback pendente no HubSpot
→ marca writeback_completed
```

Uma resposta HTTP explícita de erro do WhatsApp libera a reserva porque o provider confirmou rejeição. Falhas de rede ou respostas 2xx sem message ID são marcadas como `uncertain`, exigindo investigação em vez de arriscar duplicação.

### Inbound

`pilot_inbound_messages` possui chave única composta:

```text
provider + external_message_id
```

O webhook tenta inserir essa chave antes de executar Conversation Agent ou side effects. Se outro processo já registrou a mensagem, o segundo processamento termina como `duplicate`.

## 7. Recovery persistence

`PostgresRecoveryPersistence` grava apenas o estado operacional da Oplera:

- mapping mínimo de oportunidade externa;
- sessão de recovery;
- mensagens do ciclo de recovery;
- decisões estruturadas;
- eventos factuais;
- handoffs.

A Oplera não replica o CRM inteiro. HubSpot continua sendo a fonte externa de contexto comercial e recebe os writebacks da V0.4.1.

`recovery_decisions` não armazena chain-of-thought, hidden reasoning ou prompts completos. Apenas decisão estruturada, evidência mínima e razão curta factual.

## 8. Testes locais com PostgreSQL

Com um PostgreSQL de teste vazio e `DATABASE_URL` apontando para ele:

```bash
bun run db:migrate
bun run test:postgres
```

Os testes PostgreSQL cobrem:

- dois workers concorrentes, somente um lease da mesma task;
- recuperação de lease expirado;
- retry e max attempts;
- success e cancellation;
- ordering e `due_at`;
- idempotency de enqueue;
- restart com estado persistido;
- approval persistente após restart;
- fingerprint inválido não reutiliza aprovação;
- inbound dedupe concorrente;
- provider message ID persistido antes de crash;
- restart sem segundo envio ao WhatsApp;
- conclusão do writeback pendente no HubSpot.

O CI usa PostgreSQL 17 ephemeral. Ele não usa o projeto Supabase real e não precisa de credenciais do piloto.

## 9. Rollback operacional

A V0.4.2 adiciona persistência e não remove schema anterior da aplicação.

Para rollback do aplicativo:

1. ative `PILOT_KILL_SWITCH=true` antes de qualquer intervenção no piloto;
2. interrompa workers/processos V0.4.2;
3. reverta o deployment para o HEAD V0.4.1 aprovado;
4. preserve as tabelas `oplera.*` para auditoria e eventual retomada;
5. não execute `DROP TABLE` como parte de rollback operacional.

A migration inicial é aditiva. Uma futura migration destrutiva precisa de plano de reversão próprio e backup anterior.

## 10. Backup básico para piloto

Antes de migrations futuras que alterem ou removam dados:

- confirme a política de backup disponível no projeto Supabase;
- faça um backup lógico com ferramenta PostgreSQL compatível quando necessário;
- mantenha o backup fora do repositório Git;
- teste restauração em ambiente isolado antes de depender dela.

Para o piloto, os dados mais críticos para continuidade são `recovery_tasks`, `pilot_outbound_operations`, `pilot_inbound_messages` e `pilot_approvals`.

## 11. Secrets

Devem permanecer somente em configuração server-side:

- `DATABASE_URL`;
- `HUBSPOT_ACCESS_TOKEN`;
- `WHATSAPP_ACCESS_TOKEN`;
- `WHATSAPP_APP_SECRET`;
- `WHATSAPP_VERIFY_TOKEN`;
- `PILOT_ADMIN_TOKEN`.

Nenhum desses valores deve ser commitado.

## 12. Troubleshooting

### `database_url_required`

O processo está em produção ou tentou ativar PostgreSQL sem `DATABASE_URL`. Configure a variável no ambiente do backend.

### `database_url_must_be_postgres`

A variável não começa com `postgres://` ou `postgresql://`.

### Migration falha por permissão

A role da connection string precisa poder criar o schema `oplera`, tabelas, indexes, função e trigger. Use uma conexão de banco apropriada para migrations, nunca uma publishable key.

### Health retorna `database: error`

Verifique conectividade do host, connection string, SSL/rede e se o banco está disponível. A aplicação deliberadamente não retorna os detalhes da conexão no endpoint.

### `pilot_outbound_operation_in_progress`

Existe uma reserva sem resultado final. Outro processo pode estar realizando o envio. Não force um segundo envio.

### `pilot_outbound_delivery_uncertain`

A conexão com o provider falhou de forma ambígua depois da reserva. Consulte o provider e o estado operacional antes de decidir qualquer retry manual. O runtime prefere não duplicar uma mensagem que talvez já tenha sido entregue.

## Escopo preservado

V0.4.2 não adiciona dashboard, agente, CRM, canal, billing, auth, multi-tenancy, enrichment, RAG ou novas regras comerciais. A mudança é exclusivamente de persistência e durabilidade.
