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
| 2 — Card de partida (stepper 44px, pílula de estado, rodapé de estado) | ✅ | `79c820f` |
| 3 — Partidas + banner de prazo + pódio | ✅ | `8f0b593` |
| 4a — Ranking Geral (lista única, currentUserId) | ✅ | `e7bffdd` |
| 4b — Ranking do torneio: lista única | ✅ | `37d0fdd` |
| 4c — Aba Projeção + barra "Você" | ✅ | `30d4c64` |
| 4d — Abas de ordenação no Ranking Geral | ✅ | `f56622d` |
| 4e — Escopo "Todos os bolões" renderizado na tela | ✅ | `c6c122f` |
| Recuperação de senha (funcional, fora do redesign) | ✅ | `c80c958` |
| 5a — Perfil: escala em 3 níveis + correção de cópia | ✅ | `80534fa` |
| 5b — Desempenho: hero, métricas, últimos jogos, legenda recolhível | ✅ | `7559221` |
| 6a — Hall, Login, detalhe, simulador: fim das cores fixas | ✅ | `c0bfa43` |
| 6b — Folha de troca de campeonato | ✅ | `ffaf5bb` |
| 6c — Layout do Login e do Perfil | ✅ | `3fcf871` |
| 7 — Cards de compartilhamento: marca + share sob demanda | ✅ | `898b5f8`, `a3f7473` |
| 8 — Redesenho visual dos cards (§16) | ✅ | `fead8e3` |
| 9 — Admin tokenizado, destaque no pódio, marca na folha nativa | ✅ | `afc6306` |
| 10 — Contagem regressiva, tema no desktop, QA do claro | ✅ | `2a77db1` |
| 11 — Filtro por competição nas Partidas | ✅ | `eaa6b9b`, `ec33dc8` |
| 12 — Correções da auditoria externa (6 achados) | ✅ | `fd857e7` |
| 13 — "Sem palpite" detalhado por competição | ✅ | este commit |

---

## Decisões tomadas (para não relitigar)

- **Marca**: o app já usa "Arena de Bolões". Os cards de compartilhamento ainda
  dizem "Bolão Mundial" → trocar na Fase 6. **O domínio NÃO muda** (nada de
  `arena-de-boloes.app`): manter o que já está nos cards.
- **Simulador**: vira a aba "Projeção" do Ranking. A rota `/[tournament]/simulador`
  continua existindo.
- **Escopo do ranking**: "Todos os bolões" **renderiza na própria tela** do
  ranking (não navega para `/ranking-geral`). A rota continua respondendo.
- **Competições nas Partidas** (bloco 11): as três dividem a tela e cada uma tem
  seu calendário, então um jogo mais próximo podia aparecer mais abaixo. Duas
  medidas: botões de filtro no topo de cada aba (escolha compartilhada entre as
  abas) e, na aba "Próximas", os grupos passam a vir na ordem do calendário —
  quem joga antes aparece primeiro — em vez da ordem fixa de `COMPETITIONS`.
  Em torneio de competição única nada disso é renderizado.
- **"Sem palpite" por competição** (bloco 13): a etiqueta única dizia "36 sem
  palpite" sem dizer DE QUAL competição — que é justamente a informação que faz o
  jogador agir. No bolão unificado virou uma faixa de 4 células (Total + as três),
  com o pendente em `state-missing` e o zerado calmo. O predicado do "falta
  palpitar" foi EXTRAÍDO para uma função só (`semPalpite`), usada pelo total e
  pelo detalhamento: duas contas escritas em separado divergiriam um dia e a
  etiqueta passaria a mentir. Em torneio de competição única a prop chega vazia e
  a etiqueta única de antes é mantida, sem nenhuma mudança.
- **Escudos das competições**: não existem no banco (`logo_url` é do torneio, e
  as três vivem dentro de um), então as URLs ficam no mapa `ESCUDOS` em
  `components/competition-filter.tsx`. O Daniel mandou as três.
  ⚠️ **Duas são miniaturas do cache do Google Imagens** (`encrypted-tbn0.gstatic.com`)
  — esse tipo de link EXPIRA, não é endereço permanente de arquivo. O botão cai
  sozinho para o ícone do lucide quando a imagem falha (`onError`), então a tela
  nunca mostra imagem quebrada, mas o certo é hospedar os três PNGs em `public/`.
  Não deu para baixá-los aqui: o proxy do ambiente bloqueia os dois hosts (403).
- **Admin no mobile**: entra, como engrenagem na barra inferior (feito na Fase 4).
- **`app/page.tsx`: N queries → 1 agregada**: ❌ **não fazer.** Ganho irrelevante
  (6 torneios) e mexe na query que decide o status do torneio na home.
- **`--radius`**: aplicado 0.75rem (era 0.5rem). Reverter é uma linha.
- **Tema claro**: tokens prontos desde a Fase 1; alternador na Fase 5. Validar o
  layout no escuro primeiro — o claro dobra a matriz de QA.

---

## Auditoria externa do branch — os 6 achados (bloco 12)

Todos verificados no código e todos procedentes. Nenhum foi descartado.

1. **Aba "Projeção" em torneio sem simulador** (bloqueador, correto).
   `ranking/page.tsx` buscava só `id, name, slug`, e a aba era criada sempre —
   carregando o `SimuladorContent`, que fala de ranking FIFA, seleções, fase de
   grupos e 3º lugar. A navbar já acertava, com `has_simulator`. Agora a página
   traz a coluna e a aba só existe quando `hasSimulator`. A prop tem default
   `false`: quem não passar não ganha a aba.
2. **Callback não entregava os cookies da sessão** (bloqueador, correto).
   O `setAll` gravava apenas em `request.cookies` e a rota devolvia um
   `NextResponse.redirect()` novo. Num Route Handler, mexer nos cookies da
   REQUISIÇÃO não manda nada ao navegador. A troca funcionava no servidor e
   morria ali. **O arquivo é pré-existente e idêntico à `main`** — o bug não
   nasceu no redesign; passou a importar quando a recuperação de senha começou a
   depender dele. Agora a resposta é montada antes da troca e os cookies são
   gravados nela (e também em `request.cookies`, para leituras na mesma
   requisição).
3. **Compartilhamento com o array errado** (correto, e só no Ranking Geral).
   `ranking-geral-content.tsx` usava `profiles` nos cards ocultos enquanto a
   lista visível usava `sortedProfiles`: quem era 1º em Cravadas compartilhava
   uma imagem dizendo 7º. Corrigido nos dois cards. O ranking do TORNEIO já
   usava `sortedProfiles` — ali não havia bug.
   No modo Prêmios havia o segundo problema apontado: `ShareFullRankingCard` não
   tinha modalidade de prêmio. Em vez de esconder o compartilhamento, foi
   implementado `showPrizes` (valor em destaque = dinheiro, em `SHARE.money`), e
   o título da arte agora diz o critério ("· por prêmios" / "· por cravadas").
4. **Erro saindo com aparência de sucesso** (correto). O `Toast` tem
   `tone = 'success'` por padrão e as telas do jogador não informavam o tom, então
   "não foi possível salvar seu palpite" saía na pílula verde. Cada tela ganhou um
   estado `toastTone` setado na própria ramificação que já definia a mensagem —
   nenhum handler de salvamento teve a lógica alterada. Hoje **todos** os
   `<Toast>` do projeto informam o tom.
5. **Folha de troca chamando torneio pendente de "Encerrado"** (correto, e mais
   grave do que parece). Dividir em `active` / `!active` não só rotulava errado:
   dava link para `/matches` de torneio pendente, que a home BLOQUEIA de
   propósito — a folha era um desvio em volta do bloqueio. Agora são três grupos,
   espelhando a home: Em disputa → `/matches`, Encerrados → `/ranking` (o mesmo
   destino da home), Em breve → linha com cadeado, sem link. A separação usa UMA
   consulta a `matches` com `.in(tournament_id)`, não uma por torneio.
6. **Barra "Você" presa após alternar escopo** (correto). O observer não tinha
   `escopo` nas dependências; ao ir para "Todos os bolões" a lista do torneio
   desmontava e o observer seguia preso ao nó antigo, já fora do DOM. Ao voltar,
   a barra ficava acesa para sempre. `escopo` entrou nas dependências e o efeito só
   observa quando `escopo === 'torneio'`.

Sobre o baseline citado na auditoria: conferido, **251 erros de TypeScript na
`main` e 251 no branch** — o redesign não adicionou nenhum. E a avaliação do
bloco 11 (filtro por competição) como sem bug bate com o que eu havia verificado.

---

## Fase 6 — pendências, por origem

### Aba "Hoje" → "Últimos 5" (forma recente)

A aba do ranking diário foi substituída por **forma recente**: os N últimos jogos
FINALIZADOS do bolão, os mesmos para todo mundo, misturando as três competições.
Cada jogador vê a pontuação em cada jogo e o total.

Motivo: a pergunta real é "estou indo bem nos últimos jogos?", que é forma, não
calendário. E o recorte temporal tinha três defeitos, todos confirmados:

1. 🔴 **"31/12" em produção.** `new Date(m.match_date)` com data NULA não dá erro
   em JS: dá 1970-01-01, que em Brasília é 31/12/1969. Como todos os jogos com
   data estavam no futuro, esse dia fantasma virava o "dia alvo" e a aba exibia
   `Hoje (31/12)` com 6 jogadores empatados em 0 ponto (80 palpites da Sula, que
   não tem data).
2. **Rótulo duplicado.** A aba montava `Hoje ({rótulo})` e o rótulo já vinha com
   "Hoje" — em dia de jogo leria `Hoje (Hoje (01/08))`.
3. **O dia virava à meia-noite.** Com dias consecutivos (Copa joga 01–06/08), o
   ranking de um jogo das 21h existia só entre o lançamento do placar e as 23:59,
   e sumia para sempre se o placar entrasse depois da meia-noite.

O novo recorte não interpreta data nenhuma — filtra por `status = 'FINISHED'` —,
então o bug do 31/12 não tem como voltar. `nullsFirst: false` na ordenação impede
que um jogo finalizado sem data seja tomado como o mais recente.

Casa vazia (`—`) para quem não palpitou naquele jogo, distinta do `0` de quem
palpitou e não pontuou. Não é preciosismo: nos dados reais do Paulistão o líder
dos últimos 5 tinha palpitado em só 4 deles.

### ⚠️ Erro cometido: telas `[userId]` esquecidas (corrigido depois)

O redesign tratou as telas do PRÓPRIO usuário e deixou para trás as telas
equivalentes de OUTRO jogador, que são arquivos separados com layout duplicado:

| Tela própria | Tela de terceiro | Redesenhada em | Esquecida até |
| --- | --- | --- | --- |
| `app/profile/page.tsx` | `app/profile/[userId]/page.tsx` | 6c | correção pós-produção |
| `app/[tournament]/desempenho/page.tsx` | `.../desempenho/[userId]/page.tsx` | 5b | correção pós-produção |

Resultado: quem abria o perfil de um colega via o app ANTIGO, inclusive com o
valor em dinheiro estourando o card (`text-3xl` num card estreito). O Daniel
encontrou em produção.

Por que passou: o bloco 5a mexeu nas duas telas (só cores) e os blocos de LAYOUT
(5b, 6c) mexeram só na própria. A varredura de "cores fixas" cobria os dois
arquivos; a de layout, não.

**Lição para o futuro**: no app existem pares próprio/terceiro. Toda mudança de
layout em `profile/` ou `desempenho/` precisa ser aplicada nos dois arquivos.
Conferido que só existem esses dois pares (`find app -name page.tsx -path "*[userId]*"`)
e que `simulador/page.tsx` é invólucro de 30 linhas, sem layout próprio.

### Vindas da Fase 2 (classes que sobraram de propósito)

Trocar agora mudaria a aparência, e a Fase 2 tinha de sair visualmente idêntica.

- [x] **Toasts locais** → `components/toast.tsx` (bloco 1, `a2ac0aa`).
      Sem provider: cada tela mantém o próprio estado; só a apresentação mudou.
- [x] Emoji removidos das 5 mensagens de toast (bloco 5a).
- [x] **Botão Salvar** em `match-card.tsx` (bloco 2) e `podium-card.tsx`
      (bloco 3) → `bg-primary`.
- [x] **Botões de excluir** `bg-red-600/700` → `destructive` (bloco 9). Os que já
      tinham `variant="destructive"` estavam com a cor sobrescrita pela classe;
      bastou tirar o override. Os `AlertDialogAction` ganharam o token na mão.
      Os confirmar em verde do admin (`bg-green-600`) viraram `bg-success`.
- [x] **Medalhas do Hall** (bloco 6a): 2º e 3º viraram linhas discretas e a
      lanterna virou nota tracejada, sem card vermelho neon.
- [x] **Barras do simulador** todas em âmbar (bloco 6a).
- [x] **`prediction-summary.tsx`** (bloco 6a): props opcionais `actual` e
      `title`. O desfecho que aconteceu fica âmbar com "· aconteceu"; sem
      `actual` (jogo em andamento) nenhuma barra é destacada e o título vira
      "O que a galera espera".
- [x] **`match-card.tsx`**: botões do wizard (bloco 2). Nenhuma classe de cor
      fixa restante no arquivo.
- [x] **`app/page.tsx`**: badge de status tokenizado (bloco 6a).
- [x] **`ranking-content.tsx`**: `text-amber-200/60` → `text-primary/70` (4b).
- [x] **`!important`**: o login tinha voltado a ter alguns (`!bg-primary`,
      `hover:!bg-amber-400`). Removidos no 6a — zero `!` no app do jogador.

### Vindas da Fase 3 (escala antiga ainda viva)

- [x] **Distribuição de pontos do perfil** → 3 níveis (bloco 5a). As duas telas
      de perfil não têm mais NENHUMA classe de cor fixa. Com isso a escala de 8
      cores está extinta do app — só resta `indigo` no admin.
- [x] **`admin/admin-matches-table.tsx`**: o indigo saiu (bloco 9). Era o
      agrupamento do mata-mata — uma subseção de formulário, não um estado, então
      virou `border-hairline bg-surface-sunken`. **Com isso não resta NENHUMA
      classe de cor fixa em `app/` nem em `components/`**, fora os cards de
      compartilhamento, que são fixos de propósito (imagem exportada).

### Restante do bloco 6 → 6b

- [x] **Folha de troca de campeonato** feita no 6b: `components/tournament-sheet.tsx`,
      aberta pelo nome do torneio no cabeçalho. Consulta a lista com o cliente de
      browser e SÓ ao abrir — nenhuma action criada, `lib/` não tocado.
- [x] **Login (layout)** feito no 6c: segmentado "Entrar · Criar conta" no topo
      do cartão (era link de texto no rodapé), rótulos visíveis acima dos campos,
      ícones de dentro dos campos removidos e erro inline com `role="alert"`.
      As duas actions e os `name` dos campos são os mesmos.
- [x] **Perfil (layout)** feito no 6c: cabeçalho centralizado com avatar de 76px,
      dois cards-herói (Pontos totais / Dinheiro ganho em `text-money`), duas
      faixas de 4 métricas e "Bolões que você jogou" como linha por torneio.
      Nenhuma métrica foi retirada — só hierarquizada.

### Restante do bloco 5 → 5b

- [x] **Desempenho** feito no 5b: hero de dois cards, faixa de 4 métricas com
      divisórias, últimos 8 jogos e legenda recolhível.
- [x] **Perfil (layout)** — feito no 6c (ver acima).

### Restante do bloco 4 → passa a ser o 4c

- [x] **Aba "Projeção"** feita no 4c: o `SimuladorContent` é montado dentro do
      Ranking. O Radix só o monta quando a aba abre, e ele carrega os próprios
      dados — não precisou de plumbing. A rota antiga segue funcionando.
- [x] **Seletor de escopo** feito no 4e: renderiza na própria tela. O laço N+1
      foi EXTRAÍDO para `app/ranking-geral/load.ts` (movido sem alteração) e é
      chamado pelas duas páginas. `RankingGeralContent` ganhou a prop opcional
      `embedded`, que esconde título e botão de topo quando embutido.
      ~~Pendência anterior:~~
      (decisão do Daniel: renderiza, não navega). Custo real: o ranking geral é
      montado em `app/ranking-geral/page.tsx` com um laço N+1 (uma consulta de
      `tournament_rankings` por usuário). Para renderizar na tela do torneio é
      preciso extrair esse carregamento para um módulo compartilhado e chamá-lo
      também em `app/[tournament]/ranking/page.tsx` — senão seria duplicar a
      consulta. É a única pendência do redesign que mexe em busca de dados.
- [x] **Barra fixa "Você"** feita no 4c, com IntersectionObserver na própria
      linha e `rootMargin` descontando a barra de navegação.
- [x] **Abas de ordenação** feitas no 4d. Não era decisão de arquitetura: o
      ranking do torneio JÁ ordenava no cliente com useMemo. A aba só reordena
      o array que veio do servidor — nada é recalculado.
- [x] **`podium-transparency.tsx`**: destaque âmbar na própria linha, feito no
      bloco 9. A prop `currentUserId` é opcional — sem ela nada muda. A lista
      continua mostrando todo mundo, que é o ponto da transparência.

### Vindas do bloco 4a (ranking geral)

- [x] **Abas Pontos · Cravadas · Prêmios** no Ranking Geral (bloco 4d).
- [x] **Destaque âmbar na linha do usuário** em `podium-transparency.tsx` (bloco 9).

### Vindas do bloco 3 (partidas / pódio)

### Vindas do bloco 2 (card de partida)

- [x] **"Ver os palpites"** resolvido no bloco 3: virou um `<span>` estilizado
      DENTRO do `<Link>` que já embrulha o card. Sem link aninhado, sem mudar a
      Props do MatchCard. Ficou sem o número N — a contagem de palpites não
      chega nessa tela e buscá-la exigiria mexer numa action.
- [x] **Contagem regressiva fina na pílula** feita no bloco 10. O relógio só
      começa DEPOIS da montagem (`useEffect`), então o primeiro render do cliente
      é idêntico ao do servidor e a hidratação não diverge. Passo de 30s, porque
      a pílula não mostra segundos. Só aparece na última véspera: acima de 24h
      "faltam 6 dias" não é acionável e deixaria a tela piscando números.
      Abaixo de 1h a pílula vai para `state-urgent`.

### Vindas da Fase 4 (lacunas abertas de propósito)

- [ ] **Aba "Projeção"** no Ranking, recebendo o simulador (hoje o Simulador
      saiu da nav e só é alcançável por URL).
- [x] **Folha de troca de campeonato** (bloco 6b).

### Vindas do bloco 7 (cards de compartilhamento)

- [x] **Marca** trocada para "Arena de Bolões" nos quatro cards, e geração da
      imagem passou a ser sob demanda (antes montava todos os cards ocultos).
- [x] **Redesenho visual dos cards (§16)** feito no bloco 8: barra âmbar no topo,
      fundo `#0a0e15`, zero emoji, fim de "Folha 1 / Folha 2". Paleta comum em
      `components/share-chrome.tsx` — **fixa em hexadecimal de propósito**: a
      imagem exportada não pode depender do tema de quem gerou, senão o mesmo
      ranking sai claro para uns e escuro para outros no mesmo grupo.
- [x] **`lib/shareUtils.ts`**: marca corrigida na folha de compartilhamento
      nativa (bloco 9, com liberação explícita do Daniel para este arquivo).
      Aproveitei para trocar o `backgroundColor` do PNG de `#ffffff` para
      `#0a0e15` — com card escuro, o branco aparecia em qualquer região
      transparente.
- [ ] **`share-extra-ranking-card.tsx` é código morto**: ninguém o importa, nem
      antes do redesign (conferido contra `main`). Foi redesenhado junto para não
      deixar duas linguagens visuais no repositório, mas pode ser apagado.
- [ ] **Canto arredondado** foi removido do elemento exportado dos quatro cards:
      o `shareUtils` pinta o fundo do PNG de branco e o canto transparente sairia
      como orelha branca sobre o fundo escuro. Se um dia `lib/` for liberado,
      trocar o `backgroundColor` para `#0a0e15` e o raio pode voltar.

### Vindas da Fase 5

- [x] **Botão de tema no desktop** feito no bloco 10. A `navbar.tsx` nunca
      esteve na lista de arquivos proibidos (essa era `supabase/`, `lib/`,
      `middleware.ts` e os `actions.ts`) — foi cautela minha. A barra só existe
      acima de `md`, então a inserção não toca o mobile.
- [x] **Scrollbar no tema claro**: usa `bg-surface-sunken`/`bg-border`, ambos
      redefinidos em `html.light`. Nada a fazer no código.
- [~] **QA do tema claro**: varredura estática feita no bloco 10 e achou um bug
      real — `--primary-text` (#8a4708) foi definido na Fase 1 e **nunca era
      consumido**, então todo `text-primary` da tela clara saía no âmbar de
      botão (#f59e0b) sobre o creme do fundo. Corrigido com uma regra
      `html.light .text-primary` em globals.css. O `bg-white` do thumb do slider
      (recorte de avatar) virou `bg-foreground`. Falta o QA com olho humano —
      varredura estática não vê contraste.

### Item 7 aprovado pelo Daniel (comportamento), ainda a fazer

- [x] **Barra fixa "Você"** no ranking (bloco 4c).
- [x] **`currentUserId` usado no Ranking Geral** (bloco 4a) para destacar a
      sua linha.
- [x] **Cards `share-*` sob demanda** (bloco 7): só o card que está sendo
      exportado é montado. Seguro porque os handlers já definiam o id e
      esperavam 100ms antes de gerar a imagem. FALTA VALIDAR os 4 PNGs no
      preview — é a única verificação que depende de uso real.
- [ ] **Blindar bandeira sem ISO** — resolver **no componente** (tile com a
      sigla). `lib/utils/flags.ts` permanece intocado.
- [x] **Marca nos cards** (bloco 7): "Bolão Mundial" → "Arena de Bolões".
      Domínio mantido, conforme decisão. MAS: os cards assinam
      `bolao-mundial.com`, e o endereço real é `bolao-mundial.vercel.app` —
      quem recebe a imagem e digitar o domínio não acha o app. Decisão do Daniel.
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

- [x] Corrigido no bloco 5a: `HistoryList` ganhou a prop opcional `isOwn`
      (default `true`, então quem já usava não muda) e a página de terceiro
      passa `isOwn={false}` — o rótulo vira "Palpitou".

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
4. **`<form action={logoutAction}>` tem erro de tipo por desenho.** A action
   devolve `{error}` em caso de falha, e o tipo de form action espera `void`.
   `navbar.tsx:212` e `mobile-header.tsx:52` acusam o MESMO erro — é o padrão
   da casa e funciona (o Next descarta o retorno). Não "corrigir" sem mexer em
   `actions.ts`, que é intocável.
5. **`ignoreBuildErrors: true` — o `next build` NÃO valida tipos.** Um import
   faltando (`TrendingUp`) passou pelo build e só apareceu no `npx tsc
   --noEmit`. O projeto tem 252 erros de tipo pré-existentes (tipagem do
   Supabase nas actions), então o filtro útil é procurar as classes
   TS2304/TS2552/TS2686 — "nome não encontrado" —, que denunciam componente
   usado sem import. Rodar isso a cada bloco.
6. **Arbitrárias com decimal são minificadas.** `tracking-[0.13em]` vira
   `letter-spacing:.13em` no CSS — procurar por "0.13em" dá falso negativo.
   O mesmo vale para grep de classes com colchetes: escapar direito ou buscar
   só o valor.
7. **Aviso de `middleware` deprecado** é anterior ao redesign e fora de escopo
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
