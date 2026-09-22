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

## Estrutura
- src/core: motor neutro e estável.
- src/modules: capacidades independentes do jogo.
- src/app.js: composição dos módulos.
- index.html: apresentação/entrada web.

## Regra para futuras interações
Antes de implementar uma criação, perguntar arquiteturalmente: isto é um novo módulo, um novo tipo, um novo evento ou apenas apresentação? Evitar colocar regra de domínio diretamente no index.html.
