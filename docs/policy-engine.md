# Policy Engine

## Rule

A decisão da IA e a permissão do sistema são separadas.

```text
AI decision → Policy decision → Execution
```

Resultado do gate: `allowed`, `blocked` ou `requires_approval`.

## Contact policy

Verifica antes do side effect: opt-out, suppression, conversa humana ativa, máximo de tentativas, weekday, allowed hours e intervalo mínimo.

## WhatsApp service window

O Policy Engine importa diretamente `resolveServiceWindow()` de `api/domain/recovery.ts`, criado e testado na V0.1.1. Não existe fórmula duplicada na V0.4.

A função determina a janela a partir do último inbound válido:

- até 24h inclusive: `serviceWindowOpen=true` e free-form pode seguir para os próximos gates;
- acima de 24h: free-form exige aprovação/replanejamento;
- sem inbound: estado desconhecido/manual review;
- approved template fora da janela só é aceito quando `messageMode=approved_template` e o provider declara `providerSupportsApprovedTemplate=true`.

## Commercial policy

A configuração controla menção de preço, limite de desconto autônomo, payment conditions permitidas e custom proposal. O default demo não permite desconto autônomo e exige humano para proposta customizada.

## Handoff policy

Alta intenção, reclamação, contrato/jurídico, customização desconhecida e evidência insuficiente podem encerrar autonomia e criar handoff factual.
