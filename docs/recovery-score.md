# Recovery Score V0.4

O score final é determinístico e reproduzível, limitado a 0–100.

## Fórmula

Base: `20`.

Valor:

- >= R$ 20.000: +15
- >= R$ 8.000: +10
- >= R$ 2.500: +5
- abaixo: +1

Inatividade:

- <= 30 dias: +15
- <= 60 dias: +8
- <= 90 dias: +2
- > 90 dias: -8

Sinais:

- previous engagement: +12
- proposal sent: +12
- explicit buying question: +15
- known objection: +5
- seller dropped: +8
- lost due to timing: +10
- lost due to budget: +4
- active human conversation: -25

Uma contribuição semântica opcional é limitada a `-5..+5`. O LLM não controla o número final.

Opt-out é override: `score = 0` e `recoverable = false`.

O threshold V0.4 para recoverable é `>= 35`.

O score é uma priorização operacional, não uma probabilidade estatística de fechamento.
