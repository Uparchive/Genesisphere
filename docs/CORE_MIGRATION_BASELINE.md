# Genesisphere — baseline técnico para migração do core

**Captura:** 2026-09-27 17:21 BRT  
**Repositório/branch:** `Uparchive/Genesisphere` / `main`  
**Commit inspecionado:** `1636ab067bcf5f022aca03b2c78990a6bf0a3bde` (`Add optional live coordinate shortcut`)  
**Método:** checkout limpo da branch `main`; inspeção de todos os arquivos de código, configuração e testes presentes nesse commit. Este documento descreve o código observado, não um desenho-alvo.

## 1. Resumo executivo

O Genesisphere é hoje uma aplicação web estática sem framework ou bundler. `index.html` contém a interface, estilos e o módulo principal de apresentação/controle, que importa módulos JavaScript ES nativos em `src/`. `src/app.js` constrói a engine e publica instâncias globais para a interface e autenticação. Firebase Authentication cuida da conta; o universo autenticado é carregado/salvo por `localStorage` e, quando configurado, por um Worker Cloudflare com um Durable Object SQLite por UID. A API também executa gravidade e colisões por alarmes quando a sessão deixa de estar ativa.

A separação já existente entre `src/core/`, sistemas de domínio e a interface é uma base utilizável. Porém, o estado completo do universo ainda não está isolado em um core independente da apresentação: entidades ficam em `WorldStore`, mas relógio, controles temporais e instância/estado do integrador gravitacional são criados no módulo inline de `index.html`; `auth-gate.js` reúne login, serialização, restauração, armazenamento local e sincronização remota. Esses são os acoplamentos prioritários a considerar na migração.

Nenhum arquivo de aplicação foi alterado nesta missão. A única mudança é este documento.

## 2. Mapa de módulos reais

| Área | Arquivos | Responsabilidade observada |
| --- | --- | --- |
| Entrada e composição da engine | `index.html`, `src/app.js`, `src/game-engine.js` | O HTML declara a tela e o módulo inline; `app.js` exporta `createGenesisEngine()`, cria a instância inicial e define `globalThis.Genesisphere`; `game-engine.js` registra módulos e cria o espaço vazio e a região inicial `Genesis`. |
| Core e dados do mundo | `src/core/engine.js`, `world-store.js`, `event-bus.js`, `registry.js`, `template-registry.js`, `power-registry.js` | Registro de tipos/templates/poderes, eventos, criação/remoção e snapshot/restauração de entidades. `WorldStore` mantém entidades e histórico em memória; snapshot versão 1 guarda entidades e até 500 eventos. |
| Modelo e geração cósmica | `src/modules/cosmos.js`, `src/templates/**`, `src/powers/cosmic-powers.js`, `src/systems/stellar/big-bang.js` | Esquemas de espaço, sistemas, estrelas, buracos negros, planetas, asteroides e órbitas; catálogos de templates; ações de criar/destruir; geração determinística e esparsa de sistemas dentro da região quando Big Bang está ativo. |
| Física e ambiente | `src/systems/stellar/orbital-collisions.js`, `stellar-state.js`, `habitability.js` | Integração gravitacional 2D com passos fixos, detecção/resolução de colisões, estado transitório de corpos/trilhas, atualização de habitabilidade e validação de órbita ocupada. |
| Navegação e comandos | `src/modules/infinite-space.js`, `spatial-navigation.js`, `planet-focus.js`, `cosmic-command-terminal.js` | Transformações de coordenada tela/mundo, campo estelar determinístico, navegação WASD, foco do planeta e busca da estrela mais próxima pelo comando. |
| Entidade específica | `src/entities/astra-1/**` | Renderização e atlas determinístico de Astra-1. O atlas atual está separado da apresentação principal. |
| Apresentação e interação | `index.html` (módulo inline de aproximadamente 43,7 KB), imagens em `assets/**` | Canvas 2D, desenho dos modos universo/sistema/planeta, HUD, inventário/modal, controles desktop/mobile, seleção, zoom/pan, posicionamento, poderes, teclado/toque e loop `requestAnimationFrame`. |
| Autenticação e saves do navegador | `src/auth/config.js`, `firebase-client.js`, `auth-gate.js` | SDK Firebase carregado por CDN; cadastro, login, Google, redefinição de senha e logout. `auth-gate.js` decide carregar/restaurar e serializar estado, alterna a tela de acesso e agenda salvamento/sincronização. |
| API e simulação remota | `src/cloudflare/worker.js`, `wrangler.toml` | Worker valida ID token Firebase, aplica CORS e limites do snapshot, roteia GET/PUT para `UniverseDO`; Durable Object SQLite armazena snapshot, controla concessão de atividade e agenda alarmes de simulação. |
| Verificações | `tests/*.test.mjs`, `package.json` | 7 arquivos de teste com Node test runner nativo; cobrem Big Bang, buraco negro, comando, espaço infinito, colisões/gravidade, persistência e posicionamento planetário. |

### Entry points e dependências

- Front-end: `index.html`, servido diretamente; não existe etapa de compilação. Importa módulos locais por caminhos relativos e Firebase SDK `12.11.0` dinamicamente via `https://www.gstatic.com/firebasejs/`.
- Engine: `src/app.js` → `src/game-engine.js` → módulos Cosmos, templates e poderes. `index.html` importa `genesis` e módulos de renderização/física/navegação.
- Autenticação: o segundo `<script type="module">` de `index.html` carrega `src/auth/auth-gate.js`, que exige `globalThis.Genesisphere` e `globalThis.GenesisphereRuntime` inicializados pelo primeiro módulo.
- Worker: `wrangler.toml` aponta `main = "src/cloudflare/worker.js"`; dependências de execução são APIs da plataforma Cloudflare e módulos locais. Não há dependências listadas no `package.json`.
- Assets: logo, cena de login e catálogos visuais estão em `assets/`; templates de corpos referenciam esses assets.

## 3. Fluxos críticos observados

### Entrada, carregar e autenticar

1. O navegador abre `index.html`; o módulo inline cria/acessa a engine e inicia a aplicação visual.
2. `auth-gate.js` consulta `authReady` e `cloudSyncReady` de `src/auth/config.js`. Os valores atuais habilitam Firebase e definem uma URL de Worker.
3. Com autenticação habilitada, o gate monta login/cadastro; a mudança de estado do Firebase aciona `loadForUser(user)`.
4. Com API configurada, envia `GET /api/v1/world` com Firebase ID token. Sem snapshot remoto, tenta o save local e inicializa o remoto. Sem API, carrega/cria `genesisphere:universe:<uid>` no `localStorage`.
5. A restauração aplica entidades a `engine.world`, restaura o checkpoint gravitacional e o tempo de simulação; depois libera o jogo.

### Simular e renderizar

1. O módulo inline de `index.html` possui `simulationTime`, `timeScale`, `timePaused`, `viewSystemId`, câmera, zoom, seleção e a instância `collisions` de `createGravitySystem`.
2. A cada frame, `draw()` avança o relógio (a menos que pausado), atualiza Big Bang e chama `collisions.update(simulationTime)`, navegação/interpolação da câmera e desenho no canvas; solicita o próximo `requestAnimationFrame`.
3. `orbital-collisions.js` mantém corpos dinâmicos, trilhas e caches em closures próprias. Criação/remoção e resultados de física refletem mudanças no `WorldStore`; renderização consulta entidades/posições e transforma coordenadas do mundo para tela.
4. Ações do jogador no HTML chamam `genesis.usePower(...)`; poderes validam entrada e alteram a engine. Big Bang recebe posição/região de navegação para geração procedural.

### Salvar e simular fora da sessão

1. Após carregar uma conta, `auth-gate.js` escuta `entity:created` e `entity:destroyed`, agenda save após 1,2 s e executa sincronização periódica a cada 30 s.
2. `snapshot()` reúne relógio do runtime, `engine.world.snapshot()` e `runtime.collisions.snapshot()`; o save local escreve JSON no `localStorage`; o remoto usa `PUT /api/v1/world` com token Firebase.
3. O Worker verifica assinatura e claims do token; deriva o objeto por UID autenticado; `UniverseDO` salva o snapshot inteiro numa linha SQLite, marca lease de 90 s e agenda alarme de 60 s.
4. Sem lease ativo, o alarme restaura engine e integrador do snapshot, avança a simulação em lotes limitados, atualiza SQLite e reagenda processamento. O Worker limita entrada a 2 MB e aceita origens listadas em `ALLOWED_ORIGINS`.

## 4. Acoplamentos e pontos de migração

| Prioridade | Acoplamento atual | Efeito e risco na migração |
| --- | --- | --- |
| Alta | `index.html` mistura markup, CSS, desenho, entrada do usuário, navegação, relógio e orquestração física em um único módulo inline extenso. | Mudanças no renderer podem afetar relógio, input e regras; difícil testar/instanciar UI separada. Extrair por limites comportamentais exige preservar todos os controles e gestos. |
| Alta | O relógio autoritativo da sessão e `createGravitySystem()` são inicializados no script de apresentação; a autenticação descobre-os por `globalThis.GenesisphereRuntime`. | Core/persistência dependem de objeto global criado pela UI. Migrar renderer sem transferir propriedade do clock/integrador pode perder estado ou criar simulações duplicadas. |
| Alta | Persistência está acoplada à tela de autenticação em `auth-gate.js`, que conhece engine, runtime, SDK, `localStorage`, protocolo HTTP, debounce e polling. | Provedor, armazenamento e UI não são substituíveis independentemente; chamadas concorrentes/retentativas podem sobrescrever snapshots. Persistência remota é snapshot completo, não comandos/eventos idempotentes. |
| Alta | Estado canônico é composto por entidades no `WorldStore`, tempo na interface/runtime e corpos/trilhas/cache no closure da física; `snapshot()` precisa coordenar os três. | A migração deve definir uma única fronteira de estado e manter versionamento/compatibilidade de todos esses dados, em vez de mover somente as entidades. |
| Média | `WorldStore` chama `Date.now()` e armazena eventos em memória; a própria engine publica eventos enquanto o sistema gravitacional também chama eventos/registro. | Tempo de parede e simulado estão próximos no contrato; replay e determinismo entre browser/Worker podem divergir se esses relógios forem confundidos. |
| Média | O navegador persiste saves locais por UID enquanto API remota está ativa como fallback de primeira criação, mas o save local não é tratado como sincronização contínua nessa configuração. | Falha remota e fallback podem deixar cópias divergentes; sem política de resolução ou revisão/ETag, uma escrita posterior pode substituir estado mais novo. |
| Média | O autosave baseado em eventos escuta criação/remoção de entidade e o timer de 30 s, mas não assina explicitamente eventos de mudança de clock/física. | Persistência local pode não refletir imediatamente alterações somente temporais/estado de simulação; desligamento abrupto entre intervalos pode perder progresso recente. |
| Média | Worker valida token, tamanho e envelope básico do snapshot; `UniverseDO` recebe o snapshot integral e o restaura na engine. | Não há catálogo D1, IDs de universo por conta, limite explícito de entidades nem migração de formato além de `version: 1`; validar payload por esquema e compatibilidade antes de ampliar uso. |
| Média | O Worker executa módulo de gravidade do navegador com mesmos objetos mas limite diferente de passos (`4096` contra padrão `2048`); o online usa velocidade escolhida e offline limita escala. | Resultados e custo podem diferir entre sessão ativa e inativa; manter fronteiras e constantes sincronizadas exige teste comparativo. |
| Baixa | Recursos externos do front-end incluem Firebase SDK via CDN; Wrangler não está em `devDependencies` nem há lockfile. | Build reprodutível e validação offline não estão definidos; mudanças no CDN/ambiente ou ferramenta de deploy não são travadas pelo projeto. |

## 5. Persistência, identidade, coordenadas e física

- **Identidade:** Firebase Auth fornece UID; o Worker valida token Firebase e escolhe Durable Object com `idFromName(uid)`. Não há D1 nem catálogo de múltiplos universos; há um objeto por UID.
- **Dados canônicos:** `WorldStore` contém objetos cósmicos e eventos; snapshot V1 inclui `entities`, até 500 eventos, clock e checkpoint gravitacional. `WorldStore` congela superficialmente entidades ao adicionar; `restore` clona entidades/eventos e as congela.
- **Navegação/coordenadas:** câmera e transformações de coordenadas ficam em `index.html` e helpers de `infinite-space.js`; coordenadas do universo são distintas das posições em AU internas aos sistemas. A geração do campo estelar usa células e sementes determinísticas. Astra-1 tem atlas longitude/latitude separado.
- **Tempo e física:** a simulação é planar e usa gravidade Newtoniana de corpos próximos, integrador de passo fixo e colisões/absorções/fragmentação representadas por eventos e alterações nas entidades. O tempo apresentado é mantido pelo loop do browser; fora da sessão o DO recupera tempo real em lotes com escala limitada.
- **Poderes e procedural:** `PowerRegistry` valida/executa ações registradas pelo `CosmicPowersModule`; Big Bang é um controlador de domínio separado, ativado para uma região de nível superior, que gera sistemas/objetos esparsamente e de forma determinística conforme a exploração.

## 6. Build, testes e publicação encontrados

| Ação | Comando/estado real no checkout | Resultado nesta captura |
| --- | --- | --- |
| Testes | `npm test` (`node --test`) | **Passou:** 38 testes, 0 falhas, duração aproximada de 193 ms com Node `v24.19.0`. |
| Sintaxe JavaScript | `node --check` para cada `src/**/*.js` e para o módulo inline extraído de `index.html` | **Passou** na verificação local de baseline. |
| Build do front-end | Não há script `build`, bundler, ferramenta de compilação ou artefato intermediário; o deploy do front-end serve diretamente `index.html`, `src/` e `assets/`. | **Não aplicável/não configurado.** `npm run` lista somente `test`; não se deve descrever `npm test` como build. |
| Lint | Não há script ou ferramenta de lint configurados no `package.json`. | **Não configurado.** |
| Publicação do Worker | `npx wrangler login` e depois `npx wrangler deploy`, conforme `AUTH_AND_CLOUDFLARE.md`; `wrangler.toml` aponta o entry point e configuração do DO. | Comando documentado; depende de CLI e credenciais Cloudflare. A existência de configuração local não comprova estado publicado/operacional do Worker. |
| Publicação do front-end | Os documentos referem o front-end como GitHub Pages, mas não existe workflow de deploy nem script de publicação neste checkout. O caminho configurado nas instruções é publicar arquivos estáticos na origem atual; push em `main` atualiza o repositório, mas o mecanismo externo de Pages não é versionado aqui. | **Deploy automatizado não verificável pelo código deste repositório.** |

### Verificações executadas

- `npm test` — 38 aprovados; 0 falhas.
- `node --check` em todos os módulos `.js` dentro de `src/` — passou.
- Extração do primeiro `<script type="module">` inline em arquivo temporário `.mjs` e `node --check` — passou.
- `npm run` — confirma que só há o script `test`; não há build ou lint.
- Nenhum servidor externo, credencial ou runtime autenticado foi usado para atestar disponibilidade atual de Firebase, Worker ou GitHub Pages.

## 7. Documentação existente e divergência temporal

`ARCHITECTURE.md` foi escrito antes das mudanças de autenticação/persistência e mantém texto antigo nas seções iniciais afirmando que não havia Firebase, Worker ou Durable Object; seções posteriores já descrevem a implementação posterior. Para esta baseline, os arquivos executáveis no commit indicado são a fonte da verdade. Atualizar ou consolidar `ARCHITECTURE.md` fica fora desta missão; evite usar aquelas afirmações históricas como descrição do estado atual.

## 8. Limites desta missão

Esta baseline não altera gameplay, formato de save, código de produção, dependências ou infraestrutura. Não valida comportamento visual interativo em navegador nem conectividade real com Firebase/Cloudflare. A próxima migração deve tratar os acoplamentos acima como riscos de compatibilidade e testar snapshots V1 e os fluxos de login, restauração, simulação e salvamento antes de remover qualquer implementação existente.
