# Especificação — Motor de Probabilidades do Bolão (fase de mata-mata)

Documento de handoff para implementação. Descreve **o que calcular e como**, não o código. O alvo é rodar dentro do próprio sistema do bolão, que tem acesso ao banco (palpites de todos, jogos, pontuação atual, chaveamento).

---

## 0. Resumo em uma frase

Em vez de tentar adivinhar se um jogo vai a prorrogação ou pênaltis, a gente **simula o caminho inteiro de cada confronto** (90 min → prorrogação → pênaltis) muitas vezes. Em cada simulação o jogo está resolvido, então a pontuação vira determinística; a média de centenas de milhares dessas simulações é a probabilidade. O "eventual" (prorrogação/pênaltis) entra naturalmente, ponderado pela chance de acontecer.

---

## 1. Quando o cálculo dispara (arquitetura)

Rodar a simulação completa **não é instantâneo** (são centenas de milhares de cenários). Logo, **não** deve rodar a cada vez que alguém abre a tela. O padrão recomendado é **event-driven com cache**:

**Gatilhos de recálculo:**
1. **Resultado de partida salvo/finalizado** — muda a pontuação base, remove o jogo da lista de "pendentes" e atualiza a calibração do modelo. É o gatilho principal (a "varredura" que você imaginou).
2. **Fechamento do pódio** (apito inicial do 1º jogo do torneio) — a partir daí os palpites de campeão/vice/3º estão travados e entram na conta.
3. **Definição de uma nova rodada do chaveamento** (saiu quem avançou) — surgem novos confrontos e novos palpites a pontuar.
4. **(Opcional) Pouco antes de cada kickoff** — porque palpites mudam até o apito; um recálculo agendado ~5 min antes deixa o número "fresco".

**Como rodar:**
- O gatilho enfileira **um job** (não roda inline na request). Use *debounce*: se vários resultados forem lançados em sequência, colapse em uma única execução.
- O job: (a) recalibra o modelo com todos os jogos já finalizados, (b) roda o Monte Carlo, (c) **grava o resultado numa tabela de cache** (ex.: `simulacao_resultado`), com carimbo de tempo e "referência" (até qual jogo). 
- A tela lê a tabela de cache — **resposta imediata** para o usuário, sempre.
- Exponha também um **botão/endpoint de recálculo manual** (idempotente) para forçar atualização.

**Onde rodar (stack Supabase):** o cálculo numérico pesado é melhor num **worker dedicado** (ex.: Cloud Run / função externa) acionado por **webhook do banco** quando `matches.status` vira `FINISHED`. Uma Edge Function dá conta de orquestrar, mas o laço Monte Carlo de 300k cenários pede algo com numérico eficiente (vetorizado). Guardar o resultado de volta no Postgres.

> Resumo da sua dúvida: **não calcule sob demanda; calcule por gatilho após cada resultado (e no fechamento do pódio), e sirva do cache.**

---

## 2. Dados de entrada (o que o motor lê do banco)

O sistema já tem tudo isto; só precisa expor ao motor:

| Dado | Origem (lógica) | Uso |
|---|---|---|
| Jogos finalizados (placar) | `matches` (status FINISHED) | Calibrar o modelo de gols + pontuação base |
| Jogos a disputar (confrontos já definidos) | `matches` (status SCHEDULED) | Simular e pontuar |
| Estrutura do chaveamento | `matches` + metadados de fase/posição na chave | Simular avanço até o pódio |
| Palpites de regulamento (placar 90 min) | `predictions` (pred_home, pred_away) | Bloco 1 |
| Palpites de prorrogação (A/empate/B) | novo campo em `predictions` | Bloco 2 |
| Palpites de pênaltis (placar do shootout) | novo campo em `predictions` | Bloco 3 |
| Palpites de pódio (campeão/vice/3º) | nova tabela (ex.: `palpites_podio`) | Camada de pódio |
| Pontuação atual de cada jogador | `tournament_rankings` (total_points, exact_matches) | Base do total |

**Importante (cruzamento de palpites):** o motor lê os palpites de **todos os jogadores de uma vez** e cruza com o **mesmo desfecho sorteado** de cada jogo. Nem todos terão palpitado em todos os jogos — quem não palpitou um jogo simplesmente recebe 0 ali. O prazo é por jogo, então o conjunto de palpites cresce a cada rodada; a projeção só pontua o que já está palpitado.

---

## 3. As três camadas de pontuação (regras formalizadas)

### Camada A — Regulamento (placar dos 90 min) — SEMPRE conta

Compara o palpite de 90 min com o placar real de 90 min:

| Situação | Pontos |
|---|---|
| Placar exato | **30** |
| Acertou resultado **e** saldo de gols (sem cravar o placar) | **15** |
| Acertou resultado **e** o placar exato **do vencedor** | **17** |
| Acertou resultado **e** o placar exato **do perdedor** | **12** |
| **Empate seco** — cravou que seria empate, errou o placar | **15** *(antes 12)* |
| **Vitória seca** — acertou só quem venceu | **10** *(antes 9)* |
| Errou o vencedor, mas acertou um dos dois placares | **3** |
| Nada | **0** |

Lógica de desempate entre as faixas (ordem de avaliação):
1. Se palpite == placar real → 30.
2. Se o jogo foi empate: se o palpite também era empate → 15; senão (errou o resultado) → 3 se acertou um dos placares, senão 0.
3. Se o jogo não foi empate e acertou o vencedor: se acertou o saldo → 15; senão, se cravou o placar do vencedor → 17, se cravou o do perdedor → 12, senão → 10.
4. Se errou o vencedor → 3 se acertou um dos placares, senão 0.

### Camada B — Prorrogação — só conta se os 90 min terminaram empatados

O palpite é o **resultado da prorrogação**: *Time A avança / empate (vai a pênaltis) / Time B avança*.
- **+5** se o resultado previsto da prorrogação bater com o que aconteceu na prorrogação.
- Se os 90 min **não** empataram → palpite ignorado (0, nunca negativo).

### Camada C — Pênaltis — só conta se a prorrogação também terminou empatada

O palpite é o **placar da disputa de pênaltis**.
- **+10** se cravou o placar do shootout;
- senão **+5** se acertou só quem venceu nos pênaltis;
- senão 0.
- Se não houve pênaltis → ignorado.

> **Pendência a confirmar nas regras** (parametrize, não chumbe):
> - `penaltis_excludente` = true → 10 OU 5 (como acima). Se as regras quiserem somar (5 do vencedor + 10 do placar = 15), vire o parâmetro.
> - Assumi que **B e C somam** com A (um jogo cravado de ponta a ponta = 30 + 5 + 10 = **45**). Confirmar.

### Camada D — Pódio (uma vez por torneio, travada no 1º jogo)

O jogador escala 3 times: 🏆 campeão (40) · 🥈 vice (20) · 🥉 terceiro (25).

Para cada time escalado, olhando o pódio **real** do cenário:
- terminou **exatamente** na posição apostada → vale o cheio da posição (40 / 20 / 25);
- terminou **no pódio, mas em outra posição** → **+10** de consolação (uma vez por time);
- ficou fora do pódio → 0.

Máximos: 85 (três exatos); 30 (os três no pódio, todos em posição trocada).

---

## 4. Modelo de gols (calibração)

Mesma base usada na fase de grupos: **Dixon-Coles (Poisson bivariado)**.
- Para cada time, estima-se uma **força de ataque** e uma **força de defesa**; há um termo `rho` que corrige a frequência de placares baixos (0-0, 1-0, 1-1).
- **Calibrar com todos os jogos já finalizados do torneio** (grupos + mata-mata já ocorrido). Recalibrar a cada novo resultado.
- Use **regularização** (encolhimento para a média) porque o nº de jogos por time é pequeno — senão um 7-1 distorce tudo.
- **Mando de campo = neutro** (gamma ≈ 0). Em Copa os jogos são em sede neutra; o "mando" do banco é só a orientação da fixture e não deve virar vantagem.

Saída por confronto: `λ_A` (gols esperados do mandante) e `λ_B` (do visitante), a partir de `λ = exp(μ + ataque_time − defesa_adversário)`.

---

## 5. Resolução de UM confronto de mata-mata (a árvore)

Esta é a peça central. Cada confronto é resolvido assim, **em cada cenário**:

```
1) Sorteia o placar dos 90 min a partir de (λ_A, λ_B) com a correção Dixon-Coles.

2) Se NÃO empatou:
      → jogo decidido nos 90. Não há prorrogação nem pênaltis.

3) Se empatou nos 90:
      Sorteia a prorrogação (30 min):
        λ_prorrogação = λ × (30/90) × fator_cautela   (fator ~0,9: prorrogação é mais travada)
        Sorteia gols dos dois times nesses 30 min.
        3a) Se a prorrogação teve vencedor → decidido na prorrogação.
        3b) Se a prorrogação empatou → vai a pênaltis (passo 4).

4) Pênaltis (simulação real do shootout):
      - 5 cobranças alternadas por time, cada uma converte com prob. = taxa_conversao (~0,75).
      - Parar assim que estiver matematicamente decidido (placar parcial impossível de alcançar).
      - Se empatar após as 5, entra em morte súbita (pares de cobranças) até sair vencedor.
      - Resultado: placar final do shootout (ex.: 4-3, 5-4, 3-2 na súbita) e o vencedor.
```

**De onde saem as probabilidades dos regimes** (não são chute — vêm do próprio modelo):
- `P(decide nos 90)` = 1 − `P(empate nos 90)`;
- `P(decide na prorrogação)` = `P(empate nos 90)` × `P(prorrogação ter vencedor)`;
- `P(vai a pênaltis)` = `P(empate nos 90)` × `P(prorrogação empatar)`.

Como cada confronto é **simulado caminho a caminho**, esses pesos aparecem automaticamente na média — é isso que "joga tudo para a probabilidade".

**O que o confronto resolvido devolve** (e que é usado para pontuar todos os jogadores):
- placar dos 90 min;
- houve prorrogação? qual resultado (A / empate / B)?
- houve pênaltis? qual placar e vencedor?
- **quem avançou** (para empurrar no chaveamento).

---

## 6. Simulação do chaveamento (para o pódio e rodadas futuras)

O pódio (Camada D) não depende de jogo nenhum específico — depende de **quem termina em 1º, 2º e 3º**. Para saber isso, é preciso **simular o chaveamento inteiro até o fim** em cada cenário:

- O chaveamento é uma árvore. Cada confronto, quando os dois times estão definidos, é resolvido pela árvore da Seção 5; o **vencedor sobe** para o próximo confronto.
- Propaga rodada a rodada: oitavas → quartas → semis → **final** (campeão e vice) e **disputa de 3º lugar** (entre os dois perdedores das semis) → terceiro.
- **Resultados de mata-mata já ocorridos ficam fixos**; só se simula o que falta.

**Ponto-chave de consistência:** o **mesmo** desfecho sorteado de um confronto serve para **duas coisas ao mesmo tempo**:
1. pontuar os palpites daquele jogo (se já existirem); e
2. empurrar o vencedor no chaveamento (para o pódio).

Assim não há contradição (não pode "Brasil avançar para o pódio" e "Brasil perder" no mesmo cenário).

**Rodadas futuras ainda não palpitadas:** como o prazo é por jogo e os confrontos futuros só existem quando a rodada anterior fecha, em geral **ninguém tem palpite para a rodada seguinte ainda**. Nesses confrontos o motor **resolve o jogo (para avançar o chaveamento) mas não pontua ninguém** — só passa a pontuar quando aqueles jogos existirem e tiverem palpites. A projeção, portanto, sempre reflete "pontuação atual + jogos já palpitados resolvidos no sorteio + pódio". Conforme as rodadas são palpitadas, a projeção afina sozinha.

---

## 7. O laço Monte Carlo (juntando tudo, com cruzamento de palpites)

Repetir **N cenários** (sugestão: 100k–300k; 300k dá estabilidade boa):

Para cada cenário:
```
total[jogador] = pontuacao_atual[jogador]            # base, vinda do ranking

# 1) percorre o chaveamento do ponto atual até a final + 3º lugar
para cada confronto ainda não decidido (na ordem das rodadas):
    desfecho = resolve_confronto(λ_A, λ_B)           # Seção 5 (mesmo sorteio p/ todos)
    para cada jogador que TEM palpite nesse jogo:
        total[jogador] += pontos_regulamento(palpite_90, desfecho.placar90)   # Camada A
        se desfecho.teve_prorrogacao:
            total[jogador] += 5 se palpite_prorrog == desfecho.result_prorrog  # Camada B
        se desfecho.teve_penaltis:
            total[jogador] += pontos_penaltis(palpite_pen, desfecho.placar_pen) # Camada C
    avanca_vencedor_no_chaveamento(desfecho)

# 2) pódio do cenário
podio = {1º: campeao, 2º: vice, 3º: terceiro}        # da simulação do chaveamento
para cada jogador:
    total[jogador] += pontos_podio(palpite_podio[jogador], podio)             # Camada D

# 3) ranqueia os jogadores DENTRO deste cenário
ordena por (total desc, exatos desc)                 # mesmo desempate de hoje
registra posição de cada jogador
```

**Por que cruzar os palpites importa:** todos os jogadores são pontuados **contra a mesma realidade sorteada** em cada cenário. Isso preserva a **correlação** entre eles (se um jogo foi a pênaltis, foi para todo mundo). Sem isso, a chance de título/Z4 sai errada — não dá para somar probabilidades individuais; tem que ser no mesmo sorteio.

**Otimização (cruzamento eficiente):** para os confrontos da **rodada atual** (já definidos e palpitados), vale pré-calcular uma **tabela de pontos por desfecho × jogador** e, no laço, só sortear o desfecho e distribuir os pontos para os 25 de uma vez (vetorizado). Para rodadas futuras (confrontos variáveis), resolve direto. Isso reduz muito o custo.

**Agregação ao fim dos N cenários**, por jogador:
- `chance_de_titulo` = fração de cenários em 1º;
- `chance_top3` = fração em 1º–3º;
- `chance_Z4` = fração nas 4 últimas posições;
- `chance_lanterna` = fração em último;
- `pontuacao_projetada` = média do total;
- (úteis) média de pontos vindos do pódio, e projeção de pontos das partidas pendentes.

---

## 8. Garantia matemática (à parte do Monte Carlo)

Independente das probabilidades, dá para detectar **garantia matemática** (campeão/top-3/lanterna/Z4 já assegurados ou impossíveis) com limites de pior/melhor caso:
- **Máximo restante** de um jogador = soma, sobre os jogos que ele ainda pode pontuar, do **teto** de cada jogo (regulamento 30 + prorrogação 5 + pênaltis 10 = **45** por jogo de mata-mata que ele palpitou; + o que ainda falta do pódio se aplicável) — usado como teto.
- **Mínimo restante** = 0 por jogo.
- Campeão garantido: piso do jogador ≥ teto de todos os outros. Lanterna garantida: teto do jogador < piso de todos os outros. Top-3 garantido: no máximo 2 jogadores podem superar o piso dele. Z4 garantido: ≥ 21 jogadores têm piso acima do teto dele.
- Reportar "garantido/eliminado" só quando esses limites fecharem (condição suficiente e conservadora).

---

## 9. Saídas (o que gravar no cache)

Tabela `simulacao_resultado` (uma linha por jogador por execução, ou um JSON por execução), contendo:
`jogador`, `chance_titulo`, `chance_top3`, `chance_Z4`, `chance_lanterna`, `pontuacao_projetada`, `proj_pontos_podio`, `garantias[]`, além de metadados: `gerado_em`, `referencia` (até qual jogo/rodada), `n_cenarios`, `seed`.

A tela lê essa tabela direto.

---

## 10. Parâmetros a calibrar (poucos, e só do mata-mata)

| Parâmetro | Sugestão inicial | Observação |
|---|---|---|
| `fator_cautela_prorrogacao` | 0,90 | quão mais travada é a prorrogação vs. o ritmo dos 90 |
| `taxa_conversao_penalti` | 0,75 | prob. de converter cada cobrança no shootout |
| `n_cenarios` | 300.000 | trade-off precisão × tempo (100k já é estável) |
| `regularizacao_modelo` | ~1,2 | encolhimento das forças de ataque/defesa |
| `gamma_mando` | 0 | mando neutro em Copa |
| `penaltis_excludente` | true | 10 OU 5 (ver Seção 3) |
| `prorrogacao_soma_regulamento` | true | +5 soma com a Camada A |

---

## 11. Casos de borda e regras finas

- **Prazo por jogo:** só leia/pontue palpites de jogos cujo confronto exista; jogos não palpitados por um jogador valem 0 para ele.
- **Palpite faltando:** trate como ausência (0), nunca como 0-0.
- **Empate nos 90 num jogo eliminatório:** sempre dispara as Camadas B/C; num jogo **de grupo** não há prorrogação/pênaltis (as camadas B/C não se aplicam — o tipo do jogo decide).
- **Pódio travado:** congele os palpites de pódio no apito do 1º jogo do torneio; depois disso eles entram fixos em todo cenário.
- **Consolação uma vez por time:** não acumula; um time escalado rende, no máximo, ou o cheio da posição (se exato) ou +10 (se pódio em posição trocada).
- **Disputa de 3º lugar:** o terceiro do pódio é o **vencedor** do jogo entre os perdedores das semifinais — simule esse jogo também.
- **Desempate do ranking:** total de pontos, depois nº de placares exatos (igual hoje); inclua os exatos ganhos no cenário.
- **Reprodutibilidade:** fixe uma `seed` por execução e grave-a, para o resultado ser auditável.
- **Determinismo do tempo:** todos os horários/travas em **horário de Brasília**, como nas regras.

---

## 12. Recomendação concreta de implementação (para o Claude Code)

1. **Tabela de cache** `simulacao_resultado` + (opcional) `simulacao_execucao` (log de execuções).
2. **Webhook/trigger** no Postgres: ao `UPDATE matches SET status='FINISHED'`, enfileira um job (com debounce de ~30–60s).
3. **Worker** (Cloud Run ou equivalente, numérico vetorizado):
   - lê jogos finalizados → **recalibra** Dixon-Coles;
   - lê confrontos pendentes + chaveamento + todos os palpites + pódio + ranking;
   - monta a **tabela de pontos por desfecho** dos confrontos da rodada atual;
   - roda o **Monte Carlo** (Seções 5–7) simulando chaveamento + pontuando + pódio;
   - calcula **garantias matemáticas** (Seção 8);
   - **grava** no cache com metadados.
4. **Gatilhos extras:** fechamento do pódio (1º jogo do torneio) e ~5 min antes de cada kickoff (agendado).
5. **Endpoint manual** de recálculo (idempotente).
6. **Frontend** lê só o cache → instantâneo.

### Em uma frase para o programador
> "Crie um job, disparado por gatilho após cada resultado salvo (e no fechamento do pódio), que recalibra o modelo de gols, simula 300k vezes o restante do chaveamento resolvendo cada confronto pela árvore 90 min → prorrogação → pênaltis, pontua os palpites de todos os jogadores contra o mesmo desfecho sorteado em cada cenário (regulamento + prorrogação eventual + pênaltis eventual + pódio), ranqueia, agrega as probabilidades de título/top-3/Z4/lanterna e a pontuação projetada, detecta garantias matemáticas, e grava num cache que a tela lê direto."