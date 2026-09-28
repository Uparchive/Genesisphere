# Genesisphere Core 1.0 — auditoria arquitetural final

**Branch auditada:** `main`  
**Escopo:** Missão 23 — migração de dados e limpeza do legado

## Resultado da inspeção

A inspeção cobriu os módulos `src/`, o ponto de entrada `index.html`, o Worker, os testes e as fixtures. Não foi encontrado módulo de produção sem consumidor ou responsabilidade documentada que pudesse ser removido com segurança nesta missão. As APIs de mutação de `GenesisEngine` são handlers internos chamados pelo `CommandBus`; entrada da UI e poderes chegam a elas pela fronteira de comandos.

| Caminho legado/adaptador | Evidência de uso | Decisão |
| --- | --- | --- |
| `createLegacyUniverseAdapter` em `src/core/universe-state.js` | `index.html` usa o adaptador para mostrar e alterar os controles de tempo através de comandos do Core. | Manter até a UI consumir diretamente a nova API temporal. |
| `LegacyRenderer` em `src/rendering/legacy-renderer.js` | É o renderer inicial e fallback do WebGL; o teste cobre ciclo de vida, consumo do view model e retorno ao fallback. | Manter como fallback validado. |
| `src/systems/stellar/orbital-collisions.js` | Reexporta a física no caminho de import anterior; smoke/persistência ainda verificam essa compatibilidade. | Manter o shim para preservar imports existentes. |
| Campos planos de entidades e snapshot interno `world` v1 | Stores, fixtures e migração dependem deles para reconstruir componentes derivados sem trocar IDs ou relações. | Manter como formato interno de compatibilidade. |
| `CloudflarePersistenceRepository` | `auth-gate.js` usa o adapter para sincronizar saves autenticados; Worker e testes verificam o contrato remoto. | Manter como fronteira ativa de persistência. |

Não foram removidos arquivos ou APIs: a auditoria não encontrou um candidato cuja substituição estivesse comprovada sem quebrar consumidores ou uma fronteira de compatibilidade documentada.

## Compatibilidade dos saves

O schema persistido externo continua em `schemaVersion: 1`. `migrateUniverseSnapshot` reconhece o envelope antigo sem `schemaVersion` (`version: 1`), converte entidades planas para o formato externo e conserva os IDs, relações, propriedades conhecidas e histórico. A fixture `tests/fixtures/universe-snapshot-legacy-v1.json` cobre migração, restauração no `WorldStore` e gravação novamente no contrato v1. A fixture versionada atual continua coberta por teste round-trip separado.

Não há alteração no schema nem migração remota destrutiva nesta missão. O Worker lê e grava os mesmos snapshots JSON versionados, preservando seus metadados operacionais.

## Fronteiras e dependências

O estado canônico reside em `UniverseState`/`WorldStore`; a aplicação entrega mudanças canônicas via `CommandBus`. O Renderer recebe view models/snapshots. O Core, Entity Model, sistemas de física e sistemas estelares não importam UI, Firebase, Cloudflare, armazenamento do navegador ou bibliotecas de renderização.

`npm run build` agora verifica sintaxe e rejeita imports proibidos conhecidos nos diretórios `src/core/`, `src/entities/`, `src/systems/physics/` e `src/systems/stellar/`. A regra de build percorre imports estáticos, reexports e `import()` dinâmico nessas fronteiras; a inspeção de dependências cobriu todos os módulos JavaScript de `src/`.

## Verificação

Comando agregado: `npm run check` (`npm run build` seguido de `npm test`). Não existe script de lint configurado no `package.json`. A verificação cobre a compilação estática, migração de saves legados/versionados, APIs do Core, poderes, física, persistência, renderer e fallback. A linha de base da arquitetura anterior permanece em `docs/CORE_MIGRATION_BASELINE.md`; este documento registra o estado após as missões de extração e limpeza.
