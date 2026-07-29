# Redesign visual — o que já foi e o que falta

Branch: `redesign/visual-mobile` · Base: `2cc6e45` (main)
Este arquivo é o registro vivo do redesign. Atualizar a cada fase.

## Fases

| Fase | Estado | Commit |
| --- | --- | --- |
| 0 — Fontes DM Sans / DM Mono | ⏸️ **em aberto — decisão do Daniel** | — |
| 1 — Tokens de tema | ✅ | `b233b81` |
| 2 — Varredura de classes | ✅ | `b7ecdaf` |
| 3 — Pontuação em 3 níveis | ✅ | `3f336c6` |
| 4 — Navegação inferior + admin no mobile | ✅ | `51791fb` |
| 5 — Tema claro/escuro | ✅ | este commit |
| 6 — Layout por tela | ⬜ a fazer | — |

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

- [ ] **Toasts locais** `fixed top-4 right-4 bg-green-500` → toast global com
      `role="status" aria-live="polite"`, no rodapé acima da nav, 2,4s.
      Arquivos: `desempenho/history-list.tsx`, `ranking/ranking-content.tsx`,
      `ranking-geral/ranking-geral-content.tsx`, `admin/podium-entry.tsx`,
      `admin/prize-entry.tsx`, `admin/admin-matches-table.tsx`.
      Também remover o 🎉 das mensagens.
- [ ] **Botão Salvar** `bg-green-600 hover:bg-green-700` → `bg-primary` +
      `text-primary-foreground` (`match-card.tsx`, `podium-card.tsx`).
- [ ] **Botões de excluir** `bg-red-600/700` → `destructive`.
- [ ] **Medalhas do Hall** (prata/bronze: `border-slate-400`, `amber-700`) →
      2º e 3º viram linhas discretas; lanterna vira nota tracejada.
- [ ] **Barras do simulador** `bg-green-500` → todas em âmbar; a métrica
      selecionada é identificada pelo botão, não pela cor.
- [ ] **`prediction-summary.tsx`**: o desfecho que aconteceu vai a `bg-primary`
      com "· aconteceu"; os outros a `bg-[hsl(var(--score-none))]`.
- [ ] **`match-card.tsx`**: `bg-green-500` (linha 418) e `bg-slate-600 /
      hover:bg-slate-500` (linha 580) — botões do wizard.
- [ ] **`app/page.tsx`**: `bg-slate-600/20` do badge de status.
- [ ] **`ranking-content.tsx`**: `text-amber-200/60`.
- [ ] **Classes com `!important`** ainda presentes fora do login (o login já
      não tinha nenhuma).

### Vindas da Fase 3 (escala antiga ainda viva)

- [ ] **Distribuição de pontos do perfil** (7 categorias coloridas) → 3 níveis.
      `app/profile/page.tsx`, `app/profile/[userId]/page.tsx`
      (roxo/ciano/amarelo restantes).
- [ ] **`admin/admin-matches-table.tsx`**: `indigo-300/500` restantes.

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
- [ ] **`currentUserId` passa a ser usado** no Ranking Geral para destacar a
      sua linha (hoje chega na tela e é ignorado).
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
4. **Aviso de `middleware` deprecado** é anterior ao redesign e fora de escopo
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
