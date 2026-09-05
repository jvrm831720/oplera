# Demo scenarios

A demo deve deixar claro em menos de 60 segundos qual dinheiro está parado, por que a oportunidade foi escolhida, o que o agente fará, o que já fez, qual resposta recebeu e quando um humano precisa entrar.

## Scenarios

| Scenario | Contact | Expected proof |
| --- | --- | --- |
| Proposal ghosted | Mariana Costa | high score, plan and WhatsApp policy gate |
| Lost timing | Bruno Tavares | timing reactivation without assuming new facts |
| Seller dropped | Patrícia Souza | recovery because seller failed to continue |
| Budget objection | Diego Martins | objection handling without autonomous discount |
| Opt-out | Ana Ribeiro | score zero/suppression and no outreach |
| Active human | Ricardo Alves | suppression while seller is active |
| Recovered | Camila Nunes | won/recovered value from real demo state |
| Handoff | Fernanda Lima | contract/high-intent context transferred to human |

## Walkthrough

1. Abra `/demo` e mostre Recoverable pipeline e Agent Focus.
2. Em Recovery Queue, mostre task, dueAt, score, reason e attempt.
3. Em Opportunities, abra Mariana e mostre CRM Context, Why Oplera picked this, Strategy, Evidence, Current plan e Timeline.
4. Em Policies, mostre que WhatsApp chama `resolveServiceWindow()`.
5. Em Conversations, abra Fernanda e mostre handoff contratual.
6. Em Activity, mostre sequência factual policy → execution/handoff → result.
