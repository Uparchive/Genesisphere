# Genesisphere Core 1.0 — certificação

**Missão:** 24 — Certificação Genesisphere Core 1.0  
**Branch revisada:** `main`  
**Resultado:** aprovado no código e nos testes automatizados; validação operacional da API Cloudflare permanece pendente.

## Verificações executadas

| Área | Verificação | Resultado |
| --- | --- | --- |
| Build e fronteiras | `npm run build`: sintaxe de 45 módulos JavaScript e módulo inline; bloqueio de imports proibidos e mutações conhecidas de `WorldStore` fora do Core. | Passou. |
| Testes | `npm test` dentro de `npm run check`. | 112 passaram; 0 falharam. |
| Lint | Inspeção de scripts em `package.json`. | Não há comando de lint configurado. |
| Core headless | Inicialização sem renderer, comandos, entidades, poderes, tempo, física, snapshots e eventos. | Coberto pela suíte. |
| Mechanics SDK | Testes registram uma mecânica de teste, validam antes de mutar e verificam que todos os poderes do jogador usam o caminho SDK/Commands. | Passou. |
| Persistência | Round-trip de fixture atual e migração/restore/resave da fixture antiga; revisão concorrente, repetição idempotente, snapshot anterior recuperável e falha de persistência. | Passou nos adapters e harnesses locais. |
| Evolução offline | Relógio fake, estágios limitados, pausa, rejeição de dados inválidos, cursor idempotente e alarmes simulados do Durable Object. | Passou. |
| Renderer | View model destacado, Core sem renderer, lifecycle do Canvas 2D e prova WebGL baseada em snapshots. | Passou; fallback legado permanece disponível. |
| Carga sintética | Criação por comando de 1.003 entidades; consulta/snapshot e restauração mantiveram os 1.000 planetas e suas relações. Uma execução mediu 17,5 ms para criar, 0,2 ms para consultar/snapshot e 26,3 ms para restaurar neste ambiente. | Passou; indicativo, não benchmark de GPU nem limite de escala. |
| Site publicado | GitHub Pages abriu com os controles do jogo, ambos os canvases inicializados, controles da conta visíveis e tela de login fechada na sessão já ativa. | Inicialização observada. Não foi solicitado novo login. |

## Auditoria arquitetural

- O estado persistente permanece em `UniverseState`/`WorldStore`; a UI não grava entidades diretamente. Restore de snapshot e eventos de histórico passam por `RestoreWorldSnapshot` e `RecordWorldEvent` no `CommandBus`.
- Physics cria, atualiza e remove entidades por comandos. A física continua headless e sem import de renderer ou serviços de armazenamento.
- Renderer e persistência permanecem atrás de adapters; snapshots servem de contrato entre estado e apresentação/armazenamento.
- Os poderes existentes seguem o Mechanics SDK e comandos do Core. Não foram adicionadas mecânicas de jogo.
- Schema externo continua v1; saves antigos sem `schemaVersion` são migrados sem trocar IDs nem relações.
- Adaptador temporal da UI, renderer 2D, shim de import da física e fallback WebGL permanecem porque têm consumidores ou protegem compatibilidade validada.

## Validação operacional pendente

A sessão publicada já estava autenticada, então não houve novo envio de credenciais. Também não executei criação de corpos nem gravação/reload na conta real, para manter o universo persistido do usuário intacto. O Worker Cloudflare foi consultado sem credenciais pelo navegador, mas este bloqueou a navegação com `net::ERR_BLOCKED_BY_CLIENT`; esse resultado não permite concluir se a API está publicada ou indisponível.

Os testes automatizados exercitam o adapter HTTP com fetch simulado e o Durable Object com armazenamento de teste. Eles demonstram o comportamento do código, mas não comprovam o estado atual de produção, a autenticação Firebase real ou a persistência SQLite remota. Por isso, a confirmação operacional do fluxo login → carregar → salvar → recarregar continua necessária antes de declarar a implantação ponta a ponta verificada.

## Conclusão

Os critérios arquiteturais do Core 1.0 e os gates automatizados passaram. A fundação está pronta para receber conteúdo e mecânicas via SDK sem reconstrução do núcleo. A certificação de código está aprovada; o estado do Worker publicado e o fluxo remoto real permanecem fora do que foi possível comprovar neste ambiente.
