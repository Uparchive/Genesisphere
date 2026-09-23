# Genesisphere — Constituição Arquitetural

## Princípio central
Genesisphere cresce por adição, não por reescrita. Uma criação nova não deve alterar retroativamente o significado de uma criação anterior.

## Leis
1. **Compatibilidade histórica:** dados já criados permanecem válidos.
2. **Imutabilidade:** entidades persistidas não são editadas silenciosamente; mudanças futuras serão novos eventos/versões.
3. **Módulos independentes:** planeta, estrela, lua, vida, civilização, cultura etc. entram como módulos separados.
4. **Registro de tipos:** módulos adicionam tipos ao Registry; não sobrescrevem tipos existentes.
5. **Schema versionado:** cada tipo possui schemaVersion para migrações explícitas no futuro.
6. **Eventos em vez de acoplamento:** módulos conversam pelo EventBus sempre que possível.
7. **Estado separado da apresentação:** o universo lógico não depende do Canvas/DOM.
8. **Extensão antes de modificação:** novas leis acrescentam comportamento; qualquer mudança incompatível exige nova versão.
9. **IDs estáveis:** toda criação recebe identidade própria.
10. **História auditável:** ações importantes devem poder ser representadas como eventos.
11. **Isolamento de entidades concretas:** Características exclusivas de uma entidade concreta devem permanecer isoladas no módulo dessa entidade e não podem contaminar entidades futuras.

## Estrutura
- src/core: motor neutro e estável.
- src/templates: receitas versionadas para novos corpos; um template nunca é uma entidade do universo.
- src/powers: ações validáveis do jogador, registradas modularmente e executadas pelo motor.
- src/systems: consequências derivadas (órbita, estrelas, clima, habitabilidade e vida), sem UI.
- src/modules: capacidades independentes do jogo.
- src/entities/astra-1/atlas: geografia canônica exclusiva do Astra-1, independente da apresentação.
- src/app.js: composição dos módulos.
- index.html: apresentação/entrada web.

## Regra para futuras interações
Antes de implementar uma criação, perguntar arquiteturalmente: isto é um novo módulo, um novo tipo, um novo evento ou apenas apresentação? Evitar colocar regra de domínio diretamente no index.html.

## Motor de criação cósmica

- **Template ≠ Entity:** `planet.terrestrial` é uma receita. Cada planeta criado dela recebe ID próprio, estado próprio e pode ter uma história diferente. Astra-1 é uma entidade concreta, não um template; seu atlas permanece exclusivo em `src/entities/astra-1/`.
- **Power ≠ Physics:** um poder valida e registra uma intenção do jogador (`CREATE_SYSTEM`, `CREATE_STAR`, `CREATE_PLANET`). Leis e consequências futuras pertencem a `src/systems/`.
- **Physics ≠ Renderer:** renderizadores somente apresentam estado. Posição de órbita, energia e habitabilidade não podem depender de pixels, Canvas, câmera ou HTML.
- **Hierarquia explícita:** `UNIVERSE → STAR_SYSTEM → STAR → ORBIT → PLANET`. As relações estão nos IDs de domínio (`systemId`, `parentStarId`, `orbitId`) e parâmetros orbitais são dados canônicos.
- **Extensão modular:** novos templates entram no `TemplateRegistry`; novos poderes entram no `PowerRegistry`; nenhum deles exige editar `GenesisEngine`.
