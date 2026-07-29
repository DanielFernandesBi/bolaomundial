# Redesign visual — o que já foi e o que falta

Branch: `redesign/visual-mobile` · Base: `2cc6e45` (main)
Este arquivo é o registro vivo do redesign. Atualizar a cada fase.

## Fases

| Fase | Estado | Commit |
| --- | --- | --- |
| 0 — Fontes DM Sans / DM Mono | ✅ | `19ae8e3` |
| 1 — Tokens de tema | ✅ | `b233b81` |
| 2 — Varredura de classes | ✅ | `b7ecdaf` |
| 3 — Pontuação em 3 níveis | ✅ | `3f336c6` |
| 4 — Navegação inferior + admin no mobile | ✅ | `51791fb` |
| 5 — Tema claro/escuro | ✅ | este commit |
| 6 — Layout por tela | 🔄 **em andamento, por blocos** | ver abaixo |

### Fase 6 — blocos

| Bloco | Estado | Commit |
| --- | --- | --- |
| 1 — Toast único no rodapé | ✅ | `a2ac0aa` |
| 2 — Card de partida (stepper 44px, pílula de estado, rodapé de estado) | ✅ | `a3735b8` |
| 3 — Partidas + banner de prazo + pódio | ✅ | `64e25ce` |
| 4a — Ranking Geral (lista única, currentUserId) | ✅ | `1219a59` |
| 4b — Ranking do torneio: lista única | ✅ | `e9cab18` |
| 4c — Aba Projeção + escopo "Todos os bolões" + barra "Você" | ⬜ | — |
| 5 — Desempenho + Perfil (+ perfil de terceiro) | ⬜ | — |
| 6 — Home/folha + Login + Hall + detalhe da partida | ⬜ | — |
| 7 — Cards de compartilhamento + share sob demanda | ⬜ | — |

---

## Decisões tomadas (para não relitigar)

- **Marca**: o app já usa "Arena de Bolões". Os cards de compartilhamento ainda
  dizem "Bolão Mundial" → trocar na Fase 6. **O domínio NÃO muda** (nada de
  `arena-de-boloes.app`): manter o que já está nos cards.
- **Simulador**: vira a aba "Projeção" do Ranking. A rota `/[tournament]/simulador`
  continua existindo.
- **Escopo do ranking**: "Todos os bolões" **renderiza na própria tela** do
  ranking (não navega para `/ranking-geral`). A rota continua respondendo.
- **Admin no mobile**: entra, como engrenagem na barra inferior (feito na Fase 4).
- **`app/page.tsx`: N queries → 1 agregada**: ❌ **não fazer.** Ganho irrelevante
  (6 torneios) e mexe na query que decide o status do torneio na home.
- **`--radius`**: aplicado 0.75rem (era 0.5rem). Reverter é uma linha.
- **Tema claro**: tokens prontos desde a Fase 1; alternador na Fase 5. Validar o
  layout no escuro primeiro — o claro dobra a matriz de QA.

---

## Fase 6 — pendências, por origem

### Vindas da Fase 2 (classes que sobraram de propósito)

Trocar agora mudaria a aparência, e a Fase 2 tinha de sair visualmente idêntica.

- [x] **Toasts locais** → `components/toast.tsx` (bloco 1, `a2ac0aa`).
      Sem provider: cada tela mantém o próprio estado; só a apresentação mudou.
- [ ] Remover o 🎉 e demais emoji das mensagens de toast (ficou para o bloco
      da tela correspondente).
- [x] **Botão Salvar** em `match-card.tsx` (bloco 2) e `podium-card.tsx`
      (bloco 3) → `bg-primary`.
- [ ] **Botões de excluir** `bg-red-600/700` → `destructive`.
- [ ] **Medalhas do Hall** (prata/bronze: `border-slate-400`, `amber-700`) →
      2º e 3º viram linhas discretas; lanterna vira nota tracejada.
- [ ] **Barras do simulador** `bg-green-500` → todas em âmbar; a métrica
      selecionada é identificada pelo botão, não pela cor.
- [ ] **`prediction-summary.tsx`**: o desfecho que aconteceu vai a `bg-primary`
      com "· aconteceu"; os outros a `bg-[hsl(var(--score-none))]`.
- [x] **`match-card.tsx`**: botões do wizard (bloco 2). Nenhuma classe de cor
      fixa restante no arquivo.
- [ ] **`app/page.tsx`**: `bg-slate-600/20` do badge de status.
- [x] **`ranking-content.tsx`**: `text-amber-200/60` → `text-primary/70` (4b).
- [ ] **Classes com `!important`** ainda presentes fora do login (o login já
      não tinha nenhuma).

### Vindas da Fase 3 (escala antiga ainda viva)

- [ ] **Distribuição de pontos do perfil** (7 categorias coloridas) → 3 níveis.
      `app/profile/page.tsx`, `app/profile/[userId]/page.tsx`
      (roxo/ciano/amarelo restantes).
- [ ] **`admin/admin-matches-table.tsx`**: `indigo-300/500` restantes.

### Restante do bloco 4 → passa a ser o 4c

- [ ] **Aba "Projeção"** no Ranking recebendo o `simulador-content.tsx`
      (304 linhas). A rota `/[tournament]/simulador` continua existindo; hoje
      ela é a única forma de chegar lá, já que o Simulador saiu da nav na F4.
- [ ] **Seletor de escopo** "{Torneio}" ⇄ "Todos os bolões" renderizando na
      própria tela (decisão do Daniel: renderiza, não navega).
- [ ] **Barra fixa "Você"** com IntersectionObserver na linha do próprio
      usuário — some quando ela está visível, sem duplicar.
- [ ] **Abas de ordenação** (Pontos · Cravadas · Prêmios no geral; a do torneio
      já tem Pontos/Cravadas/Hoje). Depende de decidir quem ordena: hoje o
      ranking geral chega pronto do servidor.
- [ ] **`podium-transparency.tsx`**: destaque âmbar na linha do usuário. Exige
      receber `currentUserId` — prop nova, e a página que o renderiza precisa
      buscar o usuário.

### Vindas do bloco 4a (ranking geral)

- [ ] **Abas Pontos · Cravadas · Prêmios** no Ranking Geral: NÃO feitas. Hoje a
      tela não tem abas e a lista chega pronta do servidor, ordenada por pontos.
      Criar as abas exige ordenação no cliente — estado novo e uma decisão sobre
      quem ordena. Fica para o 4b, junto com as abas do ranking do torneio.
- [ ] **Destaque âmbar na linha do usuário** em `podium-transparency.tsx`
      (herdado do bloco 3): precisa receber `currentUserId`, o que muda a
      `interface Props`. Resolver junto do 4b.

### Vindas do bloco 3 (partidas / pódio)

### Vindas do bloco 2 (card de partida)

- [x] **"Ver os palpites"** resolvido no bloco 3: virou um `<span>` estilizado
      DENTRO do `<Link>` que já embrulha o card. Sem link aninhado, sem mudar a
      Props do MatchCard. Ficou sem o número N — a contagem de palpites não
      chega nessa tela e buscá-la exigiria mexer numa action.
- [ ] **Contagem regressiva fina na pílula** ("Fecha em 3h 12m"): a pílula
      mostra só Aberto/Apostas fechadas/Encerrada/Data a definir, sem relógio
      próprio, para não criar setInterval nem divergência de hidratação dentro
      do card. O banner de prazo (bloco 3) já tem essa maquinaria — avaliar se
      vale reaproveitar aqui.

### Vindas da Fase 4 (lacunas abertas de propósito)

- [ ] **Aba "Projeção"** no Ranking, recebendo o simulador (hoje o Simulador
      saiu da nav e só é alcançável por URL).
- [ ] **Folha (sheet) de troca de campeonato**, acionada pelo nome do torneio no
      `mobile-header.tsx` (hoje o nome leva à home).

### Vindas da Fase 5

- [ ] **Botão de tema no desktop**: hoje só o `mobile-header` e o Perfil têm.
      A `navbar.tsx` não pode ser editada, então o desktop chega pelo Perfil —
      se quiser no topo do desktop, é preciso liberar a navbar.
- [ ] **Scrollbar no tema claro**: já usa tokens, mas conferir na prática.
- [ ] **QA do tema claro** em todos os estados (ver checklist do handoff).

### Item 7 aprovado pelo Daniel (comportamento), ainda a fazer

- [ ] **Barra fixa "Você"** no ranking quando a linha sai da viewport
      (IntersectionObserver na própria linha; sumir quando visível).
- [x] **`currentUserId` usado no Ranking Geral** (bloco 4a) para destacar a
      sua linha.
- [ ] **Cards `share-*` sob demanda** — hoje os 28 são montados em toda visita.
      Fazer **por último** e validar a geração dos 4 PNGs depois.
- [ ] **Blindar bandeira sem ISO** — resolver **no componente** (tile com a
      sigla). `lib/utils/flags.ts` permanece intocado.
- [ ] **Marca nos cards de compartilhamento**: "Bolão Mundial" → "Arena de
      Bolões", mantendo o domínio atual.
- [x] Liberar o zoom (viewport) — feito na Fase 5.

### Acessibilidade (do handoff)

- [ ] `aria-label` em todo botão só com ícone (compartilhar, +/− do stepper,
      fechar folha, voltar). Já feito: nav, tema, sair.
- [ ] Linha de lista clicável precisa ser `<button>`/`<a>`, não `div` com
      `onClick`.
- [ ] Foco visível nos passos do wizard e nas abas.
- [ ] Alvos ≥ 44px.
- [x] Zoom liberado.

### Correção de cópia (do handoff)

- [ ] Em `desempenho/[userId]` o histórico diz "Seu Palpite" mesmo sendo de
      outra pessoa. Em página de terceiro, usar "palpitou 2 — 1".

---

## Armadilhas técnicas já descobertas (não repetir)

1. **Opacidade só de 5 em 5.** A escala do Tailwind 3 não tem `/7`, `/9`,
   `/12`, `/14`, `/16`, `/32`, `/92`. Esses valores **não geram CSS nenhum** e
   o elemento sai sem fundo. O handoff usa vários deles na Fase 6 —
   arredondar todos para múltiplos de 5.
2. **`content` do Tailwind.** `lib/` foi adicionado na Fase 3; sem isso as
   classes declaradas em `lib/scoring-ui.ts` não geravam CSS e o **build
   passava mesmo assim**. Ao criar novos módulos com classes, conferir o CSS
   final, não só o build.
3. **`public/sw.js` é regenerado pelo `next-pwa` a cada build.** Está na lista
   de intocáveis: reverter (`git checkout -- public/sw.js`) antes de commitar.
4. **Arbitrárias com decimal são minificadas.** `tracking-[0.13em]` vira
   `letter-spacing:.13em` no CSS — procurar por "0.13em" dá falso negativo.
   O mesmo vale para grep de classes com colchetes: escapar direito ou buscar
   só o valor.
5. **Aviso de `middleware` deprecado** é anterior ao redesign e fora de escopo
   (`middleware.ts` é intocável).

---

## Blindagem — vale para todas as fases

Nunca editar: `supabase/migrations/**`, `app/**/actions.ts`, `middleware.ts`,
`lib/**` (exceto criar arquivos novos, como `lib/scoring-ui.ts`), `public/sw.js`.

Dentro dos componentes, não tocar em: `on*`, `useState`/`useEffect`/`useMemo`,
chamadas de server action, `interface Props`, geração de imagem dos cards, e as
condições de bloqueio — incluindo `isLocked`, `match.status === 'FINISHED'`,
`is_knockout`, `has_extra_time !== false`, `locked`/`pending` do pódio,
`dateTbd` e o `penalty_prediction_mode`/`penMode` (este último não estava na
lista do handoff, mas governa qual wizard aparece).

Critério de revisão: se o diff de um componente tem algo além de strings de
classe, texto e tags de layout, parar e revisar.
