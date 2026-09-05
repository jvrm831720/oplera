# Recovery model

## Candidate lifecycle

`discovered → eligible → planned → scheduled → contacted → awaiting_reply → engaged → human_review/handed_off/recovered/lost/suppressed`

Nem toda oportunidade passa por todos os estados. Opt-out e conversa humana ativa podem suprimir cedo; alta intenção pode ir diretamente para revisão/handoff.

## Discovery reasons

V0.4 normaliza seis códigos principais: `proposal_ghosted`, `lost_timing`, `seller_dropped`, `budget_objection`, `high_intent_abandoned` e `stale_low_intent`.

A razão é acompanhada de evidências factuais. O reasoning interno de um modelo nunca faz parte do estado persistível.

## Planning

Cada candidato recebe estratégia, objetivo, canal, máximo de tentativas, primeira ação e intervalo de follow-up. O planner cria intenção operacional; ele não concede permissão para executar.

## Recovery value

`recoverableValue` é soma das oportunidades ativas consideradas recuperáveis. Não representa receita garantida. `recoveredValue` só inclui oportunidade marcada como recuperada/won no estado demo/provider.
