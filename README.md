# Oplera Revenue — MVP V0.1

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
- proteção explícita para a janela de atendimento do WhatsApp;
- MCP tool e interface interativa compatíveis com o deco Studio;
- modo de demonstração com dados completamente fictícios.

## Limite honesto do MVP

A WhatsApp Cloud API entrega novas mensagens por webhook, mas não funciona como
uma API de exportação retroativa de todo o histórico. Para analisar conversas
anteriores, o MVP recebe um CSV exportado do CRM, provedor de atendimento ou outra
fonte autorizada pelo cliente.

O MVP também **não envia mensagens automaticamente**. Conversas fora da janela
livre precisam de template aprovado e consentimento válido. A ação é preparada
para revisão humana; conexão e envio oficial entram somente no piloto contratado.

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

O score V0.1 é uma heurística explicável, não uma previsão estatística de fechamento.
Pipeline estimado também não é receita garantida. Essas duas distinções devem
permanecer visíveis durante a venda.

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
