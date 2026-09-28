# Persistência do universo

## Inventário atual

O navegador salva um JSON por UID em `localStorage`, na chave `genesisphere:universe:<uid>`, quando a sincronização Cloudflare não está configurada. Com sincronização ativa, `src/auth/auth-gate.js` usa a API `/api/v1/world`.

A API valida a identidade Firebase e seleciona o Durable Object pelo UID autenticado. O destino persistente real é SQLite do Durable Object `UniverseDO`, na tabela `universe_state`, linha `id = 1`; a coluna `snapshot` contém o JSON do universo. `simulation_time`, `processed_wall_ms` e `active_until_ms` são metadados de execução offline. Não há Firebase/Firestore para o estado do universo.

O formato anterior ao schema explícito usava `version: 1` e armazenava relógio, `world` (`entities` e histórico de eventos) e checkpoint de física (`gravity`). Essa forma é reconhecida pela migração legada.

## Contrato externo v1

`schemaVersion: 1` identifica o contrato persistido, separado das versões internas de entidade e dos formatos internos de `WorldStore` e física. O snapshot contém:

- `simulationTime`, `timeScale` e `paused`;
- `world.version`, entidades serializadas e até 500 eventos recentes;
- `gravity.version`, estados integrados, trilhas limitadas a 180 pontos e estado de habitabilidade.

Entidades são serializadas por `src/core/persistence.js` como identidade, propriedades e componentes adicionais. Componentes derivados (`identity`, `transform`, `physical`, `relations` e `orbit`) são reconstruídos pelo Entity Model durante o load. Os IDs fornecidos no save são mantidos literalmente; relações continuam expressas pelas propriedades de domínio, como `universeId`, `systemId`, `parentStarId` e `orbitId`.

O caminho de leitura é migração → validação → desserialização → aplicação. Saves legados são convertidos para o contrato v1 antes de aplicar. Versões futuras desconhecidas, IDs duplicados, campos inválidos e checkpoints malformados são rejeitados antes da mutação do Core. O Worker aplica a mesma validação e mantém os dados em formato externo v1 no SQLite; para a simulação offline, decodifica para o modelo interno e serializa de volta.

Para adicionar uma versão, implemente a migração explícita da versão anterior em `migrateUniverseSnapshot`, acrescente fixture versionada em `tests/fixtures/` e teste migração e round-trip antes de mudar a gravação padrão.
