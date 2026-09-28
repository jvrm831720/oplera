# Oplera Revenue

> **Infraestrutura para encontrar e recuperar oportunidades comerciais que ficaram paradas.**

A Oplera analisa conversas comerciais, identifica oportunidades recuperáveis e prepara a próxima ação de retomada para revisão humana.

O projeto nasceu de uma pergunta simples:

> Quantas oportunidades já entraram no funil, demonstraram intenção de compra e simplesmente morreram porque ninguém executou o próximo passo certo?

A proposta da Oplera é transformar esse problema em um fluxo operacional auditável.

---

## O problema

Operações comerciais acumulam conversas em CRM, WhatsApp e ferramentas de atendimento.

Parte dessas conversas contém:

- intenção real de compra;
- proposta enviada;
- dúvida de preço;
- negociação interrompida;
- lead sem follow-up;
- oportunidade que esfriou.

O problema não é necessariamente gerar mais leads.

Muitas vezes, existe receita potencial esquecida dentro da própria operação.

---

## Como funciona

```text
Conversas comerciais
        ↓
Importação / ingestão
        ↓
Análise de contexto
        ↓
Exclusão de vendas e perdas explícitas
        ↓
Priorização de oportunidades recuperáveis
        ↓
Sugestão de próxima ação
        ↓
Revisão humana
        ↓
Retomada
```

O MVP atual utiliza importação estruturada de conversas e mantém decisões importantes explicáveis e auditáveis.

---

## O que o MVP demonstra

- painel executivo de oportunidades;
- estimativa de pipeline potencial;
- análise de intenção e abandono;
- priorização de oportunidades;
- classificação determinística;
- mensagem de retomada sugerida;
- regras para janela de atendimento do WhatsApp;
- fluxo com revisão humana;
- MCP tool;
- interface interativa;
- dados fictícios para demonstração segura.

---

## Human-in-the-loop

A Oplera não foi desenhada para disparar mensagens cegamente.

O fluxo atual prepara a recomendação e mantém revisão humana antes da ação.

Isso permite separar:

```text
detecção
   ↓
recomendação
   ↓
aprovação
   ↓
execução
```

Essa fronteira é especialmente importante em operações comerciais e canais como WhatsApp.

---

## WhatsApp

A integração considera uma limitação operacional importante:

A WhatsApp Cloud API recebe novas mensagens via webhook, mas não funciona como uma API retroativa de exportação completa do histórico de conversas.

Por isso, o MVP trabalha com históricos importados de fontes autorizadas, como:

- CRM;
- plataforma de atendimento;
- exportação interna;
- CSV estruturado.

Novas mensagens podem futuramente entrar por webhook.

Conversas fora da janela livre exigem tratamento compatível com templates aprovados e regras aplicáveis ao canal.

---

## Arquitetura conceitual

```text
CRM / Atendimento / CSV
          ↓
     Normalização
          ↓
 Revenue Analysis
          ↓
 Opportunity Score
          ↓
 Recommended Action
          ↓
   Human Approval
          ↓
 WhatsApp / CRM Action
          ↓
 Outcome Measurement
```

O objetivo é manter a análise separada da execução, evitando transformar heurística em automação irreversível.

---

## MCP

O projeto expõe a ferramenta:

```text
analyze_revenue_recovery
```

Ela recebe contexto da empresa, ticket médio, data de referência e conversas opcionais.

A saída inclui oportunidades analisadas e priorizadas para recuperação.

O score atual é uma **heurística explicável**, não uma previsão estatística de fechamento.

Pipeline estimado também não deve ser interpretado como receita garantida.

---

## Formato de entrada

Uma linha representa uma mensagem e mensagens do mesmo `conversation_id` são agrupadas.

```csv
conversation_id,contact_name,phone,owner,source,estimated_value,direction,message,timestamp
opp-001,Ana Souza,5521999999999,Beatriz,Meta Ads,3500,inbound,"Quanto custa e como posso pagar?",2026-09-01T10:00:00.000Z
```

Dados reais devem ser autorizados e minimizados antes de qualquer processamento.

---

## Qualidade

O projeto possui gates explícitos:

```bash
bun run ci:check
bun run check
bun run test
bun run build
```

A prioridade é manter o comportamento reproduzível antes de ampliar automação.

---

## Stack e conceitos

- TypeScript
- Bun
- MCP
- deco Studio
- análise determinística
- workflows comerciais
- WhatsApp Cloud API
- human-in-the-loop
- dados estruturados
- testes automatizados

---

## Próximos incrementos

A evolução prevista inclui:

1. adaptar importação aos sistemas reais do cliente;
2. persistir oportunidades com isolamento por organização;
3. receber novas mensagens via webhook;
4. integrar templates e ações oficiais de WhatsApp;
5. registrar aprovação humana;
6. medir respostas, reuniões, vendas e receita efetivamente recuperada.

---

## Limites do MVP

O MVP atual não afirma:

- prever fechamento de vendas;
- garantir receita futura;
- reconstruir histórico completo via WhatsApp Cloud API;
- enviar mensagens automaticamente sem revisão;
- substituir CRM ou equipe comercial.

Esses limites são deliberados.

---

## O que este projeto demonstra

Do ponto de vista de engenharia e produto, a Oplera demonstra trabalho com:

- automação comercial;
- desenho de workflows;
- análise de conversas;
- integração com WhatsApp;
- MCP;
- sistemas auditáveis;
- human-in-the-loop;
- arquitetura orientada a receita;
- produto B2B.

---

## Autor

**João Mendes**  
AI, Automation & Software Technical Partner

Construo software, automações, integrações e soluções com IA para empresas, agências e software houses.

GitHub: [@jvrm831720](https://github.com/jvrm831720)

---

## Base e licenças

A estrutura inicial utiliza componentes derivados do template MIT `decocms/mcp-app`.

Consulte [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) para detalhes.
