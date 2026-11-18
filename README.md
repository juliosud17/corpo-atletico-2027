# Corpo Atlético 2027 — Fases 1, 2 e 3

Aplicativo pessoal, mobile-first e offline para acompanhar peso, alimentação, água, hábitos e metas de uma transformação corporal gradual.

**Privacidade:** sem login, sem servidor, sem analytics. Todos os dados ficam no IndexedDB do navegador do aparelho. **Faça backup JSON com frequência** — limpar dados do Safari, remover o app da tela inicial ou trocar de celular pode apagar tudo.

> Não é prescrição clínica. Dores, lesões ou inchaço pedem avaliação profissional antes de iniciar ou intensificar exercícios. Falta de ar, dor no peito ou desmaio: **SAMU 192**.

## Plano pessoal (fora do repositório)

Este repositório é público e **não contém dados pessoais**. O código traz apenas padrões genéricos. O plano pessoal (perfil, marcos, metas, refeições, preferências e condições de saúde) fica num arquivo JSON privado, carregado no primeiro acesso pelo botão **“Usar meu plano inicial (arquivo .json)”** — o mesmo botão restaura backups.

A pasta `private/` (no `.gitignore`) guarda esse plano, os testes da Parte G com os valores reais e o gerador do arquivo: `npx vitest run private` recria `private/plano-inicial-corpo-atletico-2027.json`.

## Stack

React 19 · TypeScript 6 · Vite 8 · Tailwind CSS 4 · Dexie 4 (IndexedDB) · Zod 4 · Recharts 3 · vite-plugin-pwa · Vitest · ESLint.
Roteamento por hash (`#/evolucao`) para funcionar em qualquer hospedagem estática, inclusive subpastas do GitHub Pages.

## Como executar

Pré-requisito: Node.js 20+ (testado com 22).

```bash
npm install
npm run dev        # desenvolvimento: http://localhost:5173
npm test           # testes das fórmulas e da persistência (Vitest)
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run build      # gera dist/ (com service worker do PWA)
npm run preview    # serve dist/ em http://localhost:4173
```

Testes de ponta a ponta (opcional, requer Python + Playwright e o `npm run preview` rodando):

```bash
pip install playwright && playwright install chromium
python3 e2e/flows.py   # Fase 1: 28 verificações em 320 px, incluindo offline (pasta local, não versionada)
python3 e2e/fase2.py   # Fase 2: 20 verificações (sessão ao vivo, reload no meio do treino, editor, histórico)
python3 e2e/receitas.py  # Refeições e receitas: 20 verificações (metas por refeição, painel da refeição, importar receita, porções, visual)
python3 e2e/alimentacao.py # Alimentação: 15 verificações (base oficial, porções, prato, “fechar o dia”, versão pessoal)
python3 e2e/fase3.py   # Fase 3: 21 verificações (fotos, comparação, relatórios, CSV/HTML, backup com fotos, offline, sem upload)
```

## Instalar no iPhone

O PWA só funciona offline e instala corretamente quando servido por **HTTPS**. Caminho mais simples:

1. Crie um repositório no GitHub e envie este projeto (`git init`, `git add .`, `git commit`, `git push`).
2. No GitHub: **Settings → Pages → Source: GitHub Actions**. O workflow `.github/workflows/deploy-pages.yml` roda lint, testes e build e publica `dist/`.
3. Abra a URL `https://<usuario>.github.io/<repositorio>/` no **Safari** do iPhone → botão Compartilhar → **Adicionar à Tela de Início**.
4. Abra pelo ícone. Depois da primeira visita, o app abre sem internet.

Alternativas: Netlify/Vercel/Cloudflare Pages (arraste a pasta `dist/`). Para testar na rede local: `npm run dev -- --host` (sem service worker, pois não é HTTPS).

## O que está pronto (Fases 1, 2 e 3)

| Área | Implementado |
|---|---|
| Onboarding | “Usar meu plano inicial (arquivo .json)” com prévia, ou “Configurar do zero” (perfil, datas, condições de saúde), escolha dos cartões do painel, alerta de segurança (sem bloquear) |
| Hoje (painel) | Peso atual × referência inicial, peso inicial → objetivo, barra de avanço limitada a 0–100% (variação real quando acima do inicial), mini-gráfico real × metas, “ainda falta registrar hoje”, 6 ações rápidas, kcal/macros registrados, água, próximo treino com status de liberação, checklist diário e semanal, aviso do dia 17, sugestão de revisão de tendência (nunca aplicada sozinha) |
| Evolução | Registro/edição/exclusão de peso (data + hora), gráfico 7/30/90 dias/tudo com linha real e linha de metas interpolada, “Sem dados registrados”, médias semanais (segunda a domingo) com contagem e “parcial”, diferença para a semana anterior ou “dados insuficientes”, IMC com ressalva, calendário de marcos (atingido/não atingido/remarcado), medidas corporais opcionais e % de gordura apenas se medido externamente (com método) |
| Visual | Tema grafite com **laranja** nos destaques, títulos condensados (Oswald, embutida — funciona offline), cartões arredondados, abas e chips; verde/azul continuam disponíveis em Perfil |
| Refeições | Alimentação em abas **Dia · Refeições · Receitas · Alimentos**, com Peso/Altura/IMC no topo; as metas do dia são **divididas entre as refeições** (padrão por tipo de refeição, ajustável em “Metas %”, sempre somando 100%); cada refeição mostra consumido × meta de kcal e proteína e abre um painel com status (abaixo/na/acima da meta, faixa ±10%), macros da refeição, itens e atalhos para Minhas receitas, Montar prato, Alimentos, Repetir ontem e Favoritas |
| Receitas | Criar ou **importar da internet**: tenta ler o link (dados schema.org, quando o site permite) ou lê a receita colada (título, rendimento, ingredientes; ignora o modo de preparo); liga cada ingrediente aos itens crus da TACO, converte só o que é exato (g/kg, volume para leite, óleos por densidade, unidades com porção salva) e marca o resto como pendente; totais da receita, **por porção** e por 100 g pronto; tabela **“quanto comer em cada refeição”** e “Comer agora”, que sugere a quantidade (múltiplos de ¼ de porção, ou gramas com peso pronto) para o que falta da meta da refeição |
| Base de alimentos | **75 alimentos com valores oficiais** por 100 g, conferidos nas publicações da **TACO (NEPA/Unicamp, 2ª ed.)** e do **IBGE (POF 2008-2009, Tabelas de Composição Nutricional)** — cada item mostra a fonte e o nome exato da tabela. Inclui as proteínas do dia a dia (filé de frango grelhado, contra-filé com e sem gordura, frango à milanesa, ovos cozido/frito/cru, carne de panela de acém, coxa e sobrecoxa assadas com pele, frango ao molho), carboidratos, laticínios, frutas, legumes e gorduras. Sem whey e sem peixes. A base é atualizada no aparelho a cada versão sem apagar favoritos, porções ou registros |
| Alimentação — rotina | Lista “Do dia a dia” (★), recentes e filtro por grupo; **porções próprias** (ex.: “1 filé = 120 g”) com atalhos 2× e 3×; **Montar prato** (vários alimentos de uma vez com total ao vivo); “**Para fechar o dia**”: o que falta de kcal e macros e quanto de cada proteína do dia a dia completaria a proteína; versão pessoal de um alimento (marca/preparo) sem alterar a base oficial |
| Alimentação | Diário por dia e refeição (horários editáveis + “Extras”), catálogo com busca, alimentos por g/ml/unidade e estado cru/cozido, correção de valores por marca/preparo com fonte, cadastro manual, kcal do rótulo preservada e kcal estimada por macros sinalizada, itens sem dados registrados sem inventar macros, copiar refeição de ontem, favoritas, água (atalhos e valor livre), últimos 7 dias com adesão sobre **dias registrados** |
| Checklist | Listas diárias, semanais e mensais; marcação só manual; dicas calculadas dos registros (ex.: “pesagens nesta semana: 2 de 3”); criar, editar, pausar e excluir |
| Treinos — segurança | Alerta com as condições informadas no perfil, “Iniciar treino físico” (confirmar liberação com data **ou** só planejamento), status “não liberado” mantido até a confirmação, confirmação obrigatória para iniciar ou registrar execução sem liberação (a sessão fica marcada), SAMU 192 em sintomas urgentes |
| Treinos — sessão ao vivo (Fase 2) | ▶ Iniciar a partir do dia planejado ou avulso; cronômetro iniciar/pausar/retomar que sobrevive a recarregar a página; séries com repetições, carga e RPE (sugestões a partir da série anterior e da última sessão), marcação “senti dor” com orientação para interromper, exercício avulso, cardio com modalidade/minutos/intensidade, desconforto e notas; finalizar como concluída ou parcial, ou descartar |
| Treinos — plano editável (Fase 2) | Criar, editar e excluir treinos (nome, dia, tipo, duração, exige liberação, aviso de segurança); adicionar, editar séries/repetições/observações, reordenar e remover exercícios, com sugestões da biblioteca |
| Treinos — evolução e agenda (Fase 2) | Biblioteca de exercícios com histórico por exercício (gráfico de carga máxima ou repetições + tabela), sugestão de progressão pela regra do briefing (duas sessões seguidas completas, RPE ≤ 8, sem dor — nunca aplicada sozinha), calendário mensal de previstos × realizados, cardio da semana rumo a 150 min, marcadores de dor dos registros “Como estou hoje”, histórico com séries e cardio; registro rápido mantido |
| Como estou hoje | Sono, energia, fome, estresse, dor por articulação e lado, inchaço no tornozelo, “procurei avaliação profissional”, notas — sem diagnóstico; alerta de emergência curto e visível |
| Perfil/Plano | Nome, idade, sexo para TMB, altura, datas, objetivo, ritmo, condições de saúde; IMC e TMB (Mifflin-St Jeor) com método; metas nutricionais com **data de vigência** e histórico (confirmação antes de alterar); edição dos marcos; refeições/horários/preferências; tema claro/escuro/automático, verde/azul, fuso horário; pausar acompanhamento |
| Backup | Exportar JSON (com `schemaVersion`), importar com validação Zod, prévia das contagens, avisos de inconsistência, modos **mesclar** (por ID, sem duplicar) ou **substituir** (exige digitar SUBSTITUIR); apagar tudo com dupla confirmação (digitar APAGAR); status do armazenamento persistente |
| PWA | Manifesto, ícones, service worker com pré-cache; abre offline após a primeira visita |
| Fotos (Fase 3) | Fotos opcionais e privadas (frente, perfil, costas, outro), reduzidas no aparelho e guardadas no IndexedDB, sem upload; tipo **obrigatório** “📷 Foto real” × “✨ Simulação” (selos com texto, ícone e estilo diferentes); galeria com filtro; comparação lado a lado por ângulo com peso e cintura registrados perto da data e aviso quando há simulação; trocar rótulo e excluir com confirmação |
| Relatórios (Fase 3) | Resumo **semanal** (média real, nº de pesagens, diferença para a semana anterior, alimentação só nos dias registrados, treinos, cardio, sono, cintura, notas) e **mensal** (marco do dia 17 × média ±3 dias, cintura vs. medida anterior, fotos reais, constância, avanços de carga); **revisão a cada 14–21 dias** com adesão de 14 dias, tendência e sugestões que nunca alteram metas, e registro das revisões |
| Exportação (Fase 3) | Relatório **HTML imprimível** autônomo (gráfico real × meta, resumos, medidas, miniaturas das fotos reais opcionais — simulações nunca entram; Imprimir → PDF) e **CSV** pt-BR (pesagens, alimentação, treinos, séries, medidas, resumo semanal), por período |
| Evolução e lembretes (Fase 3) | Linha de média semanal no gráfico, comparação de medidas entre duas datas, cartão de fotos; lembretes no app (“Para hoje”: pesagem, refeições, treino, medição do dia 17, revisão) configuráveis no Perfil; backup JSON com imagens opcional |

### Regras de honestidade aplicadas

- Nenhuma pesagem, refeição, treino ou marcação é criada automaticamente. O plano entra só como configuração editável.
- Base nutricional só com valores conferidos nas tabelas oficiais (TACO e IBGE), com a fonte visível em cada alimento; itens sem dados continuam sem macros inventados.
- Dia sem registro aparece como “Nenhum alimento registrado”/“—”, nunca como 0 kcal.
- Nenhuma meta é alterada sem confirmação explícita; sugestões de ajuste (150–200 kcal) são só texto.
- Sem % de gordura estimado, sem calorias de treino, sem notificações prometidas que não funcionariam.

## Itens futuros (não implementados)

- **Fase 4:** sincronização (ex.: Supabase com RLS), Apple Health, código de barras com base verificável, widgets.

## Testes

`npm test` — 108 testes públicos (Vitest + fake-indexeddb) com valores de exemplo, incluindo cronômetro, histórico/progressão por exercício, sessão ao vivo, editor de plano, resumos semanais/mensais, revisão, lembretes, CSV, relatório HTML, fotos e backup com/sem imagens e migração do banco v1 → v3, mais 5 privados em `private/` com os valores reais. Critérios de aceitação da Parte G:

| Parte G | Coberto por |
|---|---|
| 1. IMC | `calculations.test.ts` + privado |
| 2. kcal de macros | `calculations.test.ts` + privado |
| 3. Progresso até a meta | unit + persistência + privado + E2E |
| 4. Sem pesagem: peso inicial só como referência | persistência + E2E |
| 5. Editar/excluir recalcula sem duplicar | persistência + E2E |
| 6. “média de 2 registros” | unit + E2E |
| 7. Sem dados nutricionais, nada inventado | unit + E2E |
| 8. Dia sem registro ≠ “0 kcal” | unit + E2E |
| 9. Importar 2× não duplica | persistência + E2E |
| 10. Sem corte horizontal em 320 px | E2E (todas as telas) |
| 11. Persistência após reload | persistência + E2E |
| 12. Treino não liberado exige confirmação | E2E |
| 13. Fotos real × simulação, sem upload | `reports.test.ts` + E2E Fase 3 (selos distintos, aviso na comparação, nenhuma requisição externa) |
| 14. Data de início no dia certo em qualquer horário | `calculations.test.ts` (23h30 e 00h05 em São Paulo) |
| 15. Abre offline após primeira visita | E2E (service worker + modo offline) |
| 16. Feedback ao salvar e recuperação de erro | toasts em toda gravação; erros com “Tentar de novo” |

## Estrutura

```text
src/
  app/            App.tsx (rotas, tema, navegação), hooks.ts, sheets.tsx (formulários modais)
  components/     ui/ (Card, Button, Field, Sheet, Toast…), charts/WeightChart.tsx
  data/           db.ts (Dexie), seed.ts (plano inicial), repo.ts (gravação, backup)
  domain/         types.ts, dates.ts, calculations.ts, validations.ts (Zod)
  features/       onboarding, dashboard, progress, nutrition, habits, workouts, recovery, profile, backup
  styles/         index.css (tema claro/escuro)
  tests/          calculations.test.ts, persistence.test.ts
private/          plano pessoal + testes com valores reais (não versionado)
e2e/flows.py      fluxos ponta a ponta (Playwright, não versionado)
```

## Atualizações e dados existentes

O banco local é versionado (Dexie). A Fase 2 adicionou a versão 2 (índice de séries por exercício e campos opcionais de cronômetro/cardio) a Fase 3 a versão 3 (tabelas de fotos) e as receitas a versão 4. Os registros anteriores são preservados automaticamente na atualização, e backups antigos continuam importáveis.

**Fotos e backup:** por padrão o backup JSON leva só os dados das fotos. Marque “Incluir as imagens das fotos” para levar as imagens (arquivo maior). Ao **substituir** com um backup sem imagens, as fotos do aparelho são mantidas.

## Modelo de dados

Segue a Parte E.2 do briefing, com IDs estáveis (UUID; itens do plano inicial usam IDs fixos `seed-*` para que restaurar um backup numa instalação nova não duplique), datas de calendário `AAAA-MM-DD` separadas dos instantes ISO, e `schemaVersion` no backup. Pesagens e itens do diário guardam o **dia** separadamente, então uma ceia depois da meia-noite pode ficar no dia anterior e nenhuma data “vira” o dia seguinte por fuso.
