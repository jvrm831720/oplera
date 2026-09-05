# Oplera Revenue — MVP V0.1.1

Oplera encontra receita que já entrou na operação comercial, mas ficou parada em
conversas sem o próximo passo correto.

Este repositório contém um MCP App para o [deco Studio](https://github.com/decocms/studio).
O MVP analisa conversas importadas, exclui vendas concluídas e perdas explícitas,
prioriza oportunidades recuperáveis e prepara uma retomada para revisão humana.

## O que pode ser demonstrado hoje

- painel executivo com pipeline potencial, prioridades e necessidade de template;
- análise determinística e auditável de intenção, abandono e valor;
- importação local de CSV, sem enviar o histórico a um serviço externo;
- mensagem de retomada sugerida por oportunidade;
- cálculo da janela de atendimento do WhatsApp a partir do último inbound válido;
- MCP tool e interface interativa compatíveis com o deco Studio;
- modo de demonstração com dados completamente fictícios.

## Limite honesto do MVP

A WhatsApp Cloud API entrega novas mensagens por webhook, mas não funciona como
uma API de exportação retroativa de todo o histórico. Para analisar conversas
anteriores, o MVP recebe um CSV exportado do CRM, provedor de atendimento ou outra
fonte autorizada pelo cliente.

A V0.1.1 **não envia mensagens**. A janela livre é calculada pelo tempo real decorrido
desde a última mensagem inbound válida: até 24 horas inclusive resulta em
`free_form`; acima de 24 horas resulta em `approved_template_required`; quando não
há evidência inbound suficiente ou confiável, o resultado é `manual_review`.

A V0.1.1 não valida se um template está efetivamente aprovado ou aplicável. Fora da
janela livre, o envio pela WhatsApp Business Platform depende de template aplicável
e aprovado conforme a política vigente. Conexão e envio oficial entram somente após
piloto contratado e continuam sujeitos a revisão humana.

## Formato do CSV

Uma linha representa uma mensagem. Mensagens com o mesmo `conversation_id` são
agrupadas.

```csv
conversation_id,contact_name,phone,owner,source,estimated_value,direction,message,timestamp
opp-001,Ana Souza,5521999999999,Beatriz,Meta Ads,3500,inbound,"Quanto custa e como posso pagar?",2026-09-01T10:00:00.000Z
```

`direction` aceita `inbound` ou `outbound`; `timestamp` deve estar em ISO 8601.
Use dados autorizados e minimizados. Não faça upload de conversas reais na demo
pública.

## Rodar localmente

Requer [Bun](https://bun.sh/) 1.3+.

```bash
bun install
bun run build
bun run dev:api
```

- MCP: `http://localhost:3001/api/mcp`
- demonstração: `http://localhost:3001/demo`
- health check: `http://localhost:3001/health`

Para usar no deco Studio, execute `bun start`, copie a URL pública do túnel e
adicione `/api/mcp` ao final.

## Ferramenta MCP

### `analyze_revenue_recovery`

Recebe `company_name`, `average_ticket`, `reference_date` e uma lista opcional de
`conversations`. Sem conversas, retorna o cenário fictício de demonstração. Com
conversas, valida e analisa no servidor.

O score V0.1.1 é uma heurística explicável, não uma previsão estatística de fechamento.
Pipeline potencial também não é receita garantida. Receita recuperada só existe
quando uma venda puder ser atribuída posteriormente à retomada.

## Qualidade

```bash
bun run ci:check
bun run check
bun run test
bun run build
```

## Próximo incremento após pré-venda

1. adaptar o CSV/exportação do sistema real do cliente;
2. armazenar oportunidades com isolamento por cliente;
3. configurar webhook da WhatsApp Cloud API para novas mensagens;
4. integrar templates aprovados e aprovação humana antes do envio;
5. medir respostas, reuniões, vendas e receita efetivamente recuperada.

## Licença e base

Estrutura inicial derivada do template MIT `decocms/mcp-app`. Consulte
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
