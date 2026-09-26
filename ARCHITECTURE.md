# Genesisphere — Arquitetura atual e fundação Cloudflare

**Escopo:** auditoria arquitetural e proposta Cloudflare. A configuração remota continua inexistente; mudanças posteriores de gameplay estão documentadas separadamente.

## 1. Auditoria do repositório

### Aplicação e dependências

- A aplicação é um site estático servido a partir de `index.html`, com módulos JavaScript nativos carregados por `<script type="module">`.
- Não há framework, bundler, lockfile, build script ou dependências npm. O `package.json` adicionado nesta correção só declara módulos ES e `npm test`, usando o test runner nativo do Node.
- O desenho principal usa Canvas 2D; controles e HUD são elementos DOM definidos em `index.html`.
- `src/app.js` compõe `GenesisEngine`, Cosmos, templates e poderes. Sistemas e renderizadores são importados separadamente pela página.
- `wrangler.toml` é a única configuração Cloudflare preparada nesta missão. Configura somente a publicação futura dos arquivos estáticos atuais, sem Worker de API, bindings, IDs de recursos ou migrações.

### Motor, estado e persistência atuais

- `GenesisEngine` mantém registries, módulos, barramento de eventos e `WorldStore` em memória.
- `WorldStore` guarda entidades em um `Map` e eventos em um array. Criações e remoções produzem eventos, mas nada é gravado em disco ou enviado a um serviço remoto.
- Entidades recebem IDs via `crypto.randomUUID()`; o armazenamento congela superficialmente cada entidade. Não há importação/exportação, serialização, versionamento de saves nem restauração após recarregar a página.
- O relógio de simulação atual (`simulationTime`, escala e pausa) pertence à sessão aberta no navegador. O loop de animação atualiza o tempo enquanto a página roda; não há execução offline nem agenda persistente.
- As órbitas e colisões são calculadas pelos módulos estelares a partir de posições em AU e do tempo de simulação. No interior de cada sistema, estrelas, planetas e planetas orbitando estrelas diferentes são testados entre si; impactos deixam eventos no histórico em memória.
- `Math.random()` também é usado para estrelas decorativas de fundo. Isso não deve ser confundido com dados canônicos do universo.
- A geografia de Astra-1 tem um atlas determinístico separado em `src/entities/astra-1/atlas/`; na versão observada, `features` está vazio e o renderer ainda desenha sua superfície independentemente do atlas.

### Modelo atual de entidades

| Entidade | Identidade e relações | Coordenadas/propriedades observadas |
| --- | --- | --- |
| Universo/espaço | Instância `cosmic.empty-space`; não recebe atualmente um ID de proprietário | Estado inicial do jogo criado em `src/app.js` |
| Sistema estelar | `cosmic.star-system`, com `universeId` | Posição normalizada `x/y`; a câmera converte para pixels |
| Estrela | `cosmic.star`, ligada a `systemId` e template | Posição normalizada; tipo espectral, massa/raio solares e temperatura |
| Planeta | `cosmic.terrestrial-planet`, ligado a sistema, estrela-mãe, órbita e template | Órbita em AU, período em dias e excentricidade; massa/raio terrestres, atmosfera, ambiente e estado de vida |
| Órbita | `cosmic.orbit`, ligada a sistema e estrela-mãe | Semieixo maior em AU, excentricidade e período |
| Astra-1 | Módulo de entidade concreta, separado dos templates comuns | Atlas em longitude/latitude planetográficas, independente de pixels |

As posições normalizadas continuam servindo à navegação/representação do universo. Estrelas dentro de um sistema também carregam `positionAU`, que coloca seus centros no mesmo referencial orbital dos planetas. Uma futura API deve preservar essa distinção e definir explicitamente a unidade e o referencial de cada novo campo.

### Regras de colisão implementadas

- A verificação é contínua no tempo simulado e considera o caminho entre amostras, reduzindo a chance de corpos atravessarem um ao outro entre quadros.
- Estrelas do mesmo sistema têm contato sólido; duas estrelas em contato formam uma estrela remanescente, com massa combinada. Planetas da estrela absorvida passam a orbitar a remanescente.
- Um planeta é absorvido por qualquer estrela do mesmo sistema que alcançar, não apenas pela estrela que o originou.
- Planetas de estrelas diferentes no mesmo sistema também podem colidir. A colisão destrói ambos e cria oito entidades `cosmic.asteroid`, dividindo entre elas a massa combinada; os fragmentos recebem vetores de velocidade determinísticos e não ficam presos a uma órbita.
- O contato usa raios de colisão em unidades de jogo, alinhados à escala-base do renderer. Os resultados ficam no estado e no histórico do mundo; a colisão não abre mensagens de texto.
- Asteroides seguem trajetórias lineares em AU pelo referencial do sistema, sem limite de distância nem atração orbital nesta versão. Ao atingir uma estrela, são absorvidos e registrados como ingestão; ao atingir um planeta, o asteroide é destruído e sua massa é incorporada ao planeta. A colisão entre asteroides não é simulada.\n- Sistemas estelares distintos são fronteiras independentes para colisões nesta versão.


## 2. Infraestrutura Cloudflare encontrada/preparada

Antes desta missão não havia configuração Cloudflare no repositório: sem Wrangler, Workers, D1, Durable Objects, autenticação ou segredos.

Foi adicionado `wrangler.toml` para reconhecer o diretório existente como saída de assets estáticos. Ele não define `main`, binding, banco, classe de Durable Object, migration, rota, domínio ou segredo. É apenas configuração local; não cria nem publica recurso.

## 3. Arquitetura proposta para as próximas missões

### Fronteiras de execução

1. **Workers Static Assets** serve `index.html`, módulos e imagens existentes.
2. **Worker de API** será acrescentado em uma missão posterior como entry point explícito no Wrangler. Ele validará sessão, entrada e autorização; servirá também os assets por um binding `ASSETS` quando a aplicação virar full-stack.
3. **D1** será o catálogo relacional de identidade/autenticação e propriedade/listagem dos universos.
4. **Um Durable Object por universo** será o ator serializado que controla mutações, relógio, eventos e estado canônico daquele universo. Usar storage SQLite do Durable Object para entidades, eventos, checkpoints e dados do relógio.
5. O Worker resolve o usuário autenticado e verifica propriedade no catálogo D1 antes de encaminhar uma operação ao Durable Object. O cliente nunca escolhe livremente outro proprietário nem recebe acesso apenas por conhecer um ID.

D1 e Durable Object terão responsabilidades distintas: D1 responde “quem é o dono e quais universos pode listar?”; o Durable Object responde “qual é o estado e a história deste universo?”. Não manter duas cópias concorrentes da simulação como fontes de verdade.

### Modelo de dados futuro

**D1 — catálogo e identidade**

- Tabelas de usuário/sessão e tabelas auxiliares controladas pelo mecanismo de autenticação selecionado.
- `universes(id, owner_id, schema_version, created_at, updated_at)`, com índice por `owner_id`.
- Futuramente, limites de criação e estado do universo podem ser metadados de catálogo, nunca autoridade sobre a física.

**SQLite do Durable Object — estado canônico por universo**

- `entities(id, type, schema_version, data_json, created_at)`.
- `events(sequence, event_id, kind, simulation_time, payload_json, created_at)`.
- `clock_state(simulation_time, last_wall_time, rate, paused, calendar_version)`.
- Chaves de idempotência para impedir que retentativas de uma mesma solicitação criem entidades ou eventos duplicados.
- Índices para relações comuns, como `systemId`, `parentStarId` e `universeId`, definidos após medir consultas reais.

Eventos devem ser anexados em sequência monotônica; checkpoints podem reduzir o custo de reconstruir o estado. As regras de compatibilidade e `schemaVersion` já documentadas continuam valendo. Uma futura migração deverá ler dados antigos, transformar explicitamente e permitir recuperação de falha.

### Autenticação e autorização

- Ainda não há provedor nem mecanismo de autenticação escolhido ou instalado.
- Na missão de autenticação, selecionar uma solução compatível com Workers e D1, com sessões seguras, cookies `HttpOnly`/`Secure`/`SameSite`, proteção contra CSRF nas operações mutáveis e verificação de e-mail se o cadastro usar e-mail.
- Não implementar criptografia de senha própria nem aceitar `userId` enviado pelo navegador como prova de identidade.
- Validar a sessão no Worker e a associação `universe.owner_id` antes de encaminhar cada operação.
- Custos e dependências de entrega de e-mail/domínio devem ser avaliados antes de habilitá-los; esta missão não cria contas nem credenciais.

### Evolução temporal fora do navegador

A meta de produto já definida é que **1 dia de tempo real represente 1.000 anos simulados**. Com ano de 365,25 dias, isso equivale a multiplicador de referência de 365.250 para a linha do tempo persistida.

O navegador continuará sendo apenas uma visualização/controle. O modelo futuro deve gravar tempo de simulação, último instante real processado, taxa, pausa e versão do calendário. Um alarme do Durable Object acorda o universo para checkpoint e trabalho periódico; o cálculo deve avançar deterministicamente de um instante simulado a outro e recuperar o intervalo transcorrido sem depender de uma aba aberta. Não executar um loop contínuo nem criar um alarme por frame. A frequência do alarme, limites de recuperação e comportamento de pausa/retomada precisam ser definidos e testados antes de ativar evolução remota. A escala visual atual não foi modificada por esta proposta.

### API futura

Usar rotas versionadas sob `/api/v1`, por exemplo:

- `GET /api/v1/universes` — lista apenas universos do usuário da sessão.
- `POST /api/v1/universes` — cria um universo vazio e inicializa seu Durable Object.
- `GET /api/v1/universes/:id/state` — lê estado/checkpoint autorizado.
- `POST /api/v1/universes/:id/commands` — envia ações com ID de idempotência e validações de domínio.

O Worker valida JSON, tamanho e versão de contrato; o Durable Object valida invariantes e serializa comandos. A física continua em módulos sem dependência de DOM/Canvas. Uma futura integração deve adaptar o modelo atual por um limite de serialização, sem acoplar a engine ao Cloudflare.

## 4. Preparação e limites desta missão

- Configuração atual: assets estáticos somente em `wrangler.toml`.
- Nenhuma dependência externa foi adicionada ao projeto.
- Wrangler CLI será necessário para desenvolvimento/publicação Cloudflare; não está instalado ou declarado no repositório.
- Workers, D1, Durable Objects, autenticação e entrega de e-mail/domínio são serviços/integrações futuros. Nenhum foi provisionado, configurado com credenciais ou implantado nesta missão.
- Não criar um banco ou namespace antes de aprovar o plano de custos/limites e escolher ambiente de desenvolvimento.

## 5. Validação disponível

Não há comando de build nem workflow de CI. `npm test` executa os testes de regressão de colisão com o test runner nativo do Node, sem dependências de projeto. Nesta correção, os testes verificam colisões planeta-estrela não hospedeira, sobrevivência fora do raio de contato, fusão de planetas da mesma ou de diferentes estrelas, fusão de estrelas, reparentalização de planetas e isolamento entre sistemas. A configuração Wrangler/TOML também foi validada sintaticamente. Definir um comando de build junto da futura implementação do Worker.
