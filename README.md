# Corpo Atlético 2027 — Fase 1 (MVP)

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
python3 e2e/flows.py   # 28 verificações em tela de 320 px, incluindo modo offline (pasta local, não versionada)
```

## Instalar no iPhone

O PWA só funciona offline e instala corretamente quando servido por **HTTPS**. Caminho mais simples:

1. Crie um repositório no GitHub e envie este projeto (`git init`, `git add .`, `git commit`, `git push`).
2. No GitHub: **Settings → Pages → Source: GitHub Actions**. O workflow `.github/workflows/deploy-pages.yml` roda lint, testes e build e publica `dist/`.
3. Abra a URL `https://<usuario>.github.io/<repositorio>/` no **Safari** do iPhone → botão Compartilhar → **Adicionar à Tela de Início**.
4. Abra pelo ícone. Depois da primeira visita, o app abre sem internet.

Alternativas: Netlify/Vercel/Cloudflare Pages (arraste a pasta `dist/`). Para testar na rede local: `npm run dev -- --host` (sem service worker, pois não é HTTPS).

## O que está pronto (Fase 1)

| Área | Implementado |
|---|---|
| Onboarding | “Usar meu plano inicial (arquivo .json)” com prévia, ou “Configurar do zero” (perfil, datas, condições de saúde), escolha dos cartões do painel, alerta de segurança (sem bloquear) |
| Hoje (painel) | Peso atual × referência inicial, peso inicial → objetivo, barra de avanço limitada a 0–100% (variação real quando acima do inicial), mini-gráfico real × metas, “ainda falta registrar hoje”, 6 ações rápidas, kcal/macros registrados, água, próximo treino com status de liberação, checklist diário e semanal, aviso do dia 17, sugestão de revisão de tendência (nunca aplicada sozinha) |
| Evolução | Registro/edição/exclusão de peso (data + hora), gráfico 7/30/90 dias/tudo com linha real e linha de metas interpolada, “Sem dados registrados”, médias semanais (segunda a domingo) com contagem e “parcial”, diferença para a semana anterior ou “dados insuficientes”, IMC com ressalva, calendário de marcos (atingido/não atingido/remarcado), medidas corporais opcionais e % de gordura apenas se medido externamente (com método) |
| Alimentação | Diário por dia e refeição (horários editáveis + “Extras”), catálogo com busca, alimentos por g/ml/unidade e estado cru/cozido, correção de valores por marca/preparo com fonte, cadastro manual, kcal do rótulo preservada e kcal estimada por macros sinalizada, itens sem dados registrados sem inventar macros, copiar refeição de ontem, favoritas, água (atalhos e valor livre), últimos 7 dias com adesão sobre **dias registrados** |
| Checklist | Listas diárias, semanais e mensais; marcação só manual; dicas calculadas dos registros (ex.: “pesagens nesta semana: 2 de 3”); criar, editar, pausar e excluir |
| Treinos (parcial) | Alerta de segurança com as condições informadas no perfil, fluxo “Iniciar treino físico” (confirmar liberação com data **ou** registrar só o planejamento), semana atual, semana de referência A/B/C com exercícios, registro simples de sessão (concluído/parcial/adiado/cancelado/não liberado), confirmação obrigatória para registrar execução sem liberação, SAMU 192 em sintomas urgentes |
| Como estou hoje | Sono, energia, fome, estresse, dor por articulação e lado, inchaço no tornozelo, “procurei avaliação profissional”, notas — sem diagnóstico; alerta de emergência curto e visível |
| Perfil/Plano | Nome, idade, sexo para TMB, altura, datas, objetivo, ritmo, condições de saúde; IMC e TMB (Mifflin-St Jeor) com método; metas nutricionais com **data de vigência** e histórico (confirmação antes de alterar); edição dos marcos; refeições/horários/preferências; tema claro/escuro/automático, verde/azul, fuso horário; pausar acompanhamento |
| Backup | Exportar JSON (com `schemaVersion`), importar com validação Zod, prévia das contagens, avisos de inconsistência, modos **mesclar** (por ID, sem duplicar) ou **substituir** (exige digitar SUBSTITUIR); apagar tudo com dupla confirmação (digitar APAGAR); status do armazenamento persistente |
| PWA | Manifesto, ícones, service worker com pré-cache; abre offline após a primeira visita |

### Regras de honestidade aplicadas

- Nenhuma pesagem, refeição, treino ou marcação é criada automaticamente. O plano entra só como configuração editável.
- Catálogo inicial **sem valores nutricionais** (não há base validada integrada): complete pelo rótulo ou por TACO/TBCA ao registrar.
- Dia sem registro aparece como “Nenhum alimento registrado”/“—”, nunca como 0 kcal.
- Nenhuma meta é alterada sem confirmação explícita; sugestões de ajuste (150–200 kcal) são só texto.
- Sem % de gordura estimado, sem calorias de treino, sem notificações prometidas que não funcionariam.

## Itens futuros (não implementados)

- **Fase 2:** biblioteca editável de exercícios, séries/repetições/cargas/RPE por exercício, cronômetro iniciar/pausar/finalizar, histórico e gráfico de carga por exercício, agenda de treinos.
- **Fase 3:** fotos privadas (frente/perfil) com rótulos “foto real” × “simulação”, comparação lado a lado, resumos semanais/mensais e relatório CSV/HTML imprimível, lembretes mais completos.
- **Fase 4:** sincronização (ex.: Supabase com RLS), Apple Health, código de barras com base verificável, widgets.

## Testes

`npm test` — 36 testes públicos (Vitest + fake-indexeddb) com valores de exemplo, mais 5 privados em `private/` com os valores reais. Critérios de aceitação:

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
| 13. Fotos real × simulação | **Fase 3** (sem fotos nesta versão; nenhum upload existe) |
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

## Modelo de dados

Segue a Parte E.2 do briefing, com IDs estáveis (UUID; itens do plano inicial usam IDs fixos `seed-*` para que restaurar um backup numa instalação nova não duplique), datas de calendário `AAAA-MM-DD` separadas dos instantes ISO, e `schemaVersion` no backup. Pesagens e itens do diário guardam o **dia** separadamente, então uma ceia depois da meia-noite pode ficar no dia anterior e nenhuma data “vira” o dia seguinte por fuso.
