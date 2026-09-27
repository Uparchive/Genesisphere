# Genesisphere Core 1.0 — contrato de compatibilidade

**Estado:** contrato-alvo para a migração incremental; não altera o comportamento atual.

**Base de compatibilidade:** `main` após as Missões 01 e 02.

**Objetivo:** estabelecer fronteiras verificáveis para extrair o Core sem interromper os universos, controles e saves existentes.

## 1. Princípios e invariantes

1. **O estado canônico pertence ao Core.** Entidades, relações, coordenadas lógicas, tempo simulado e estado físico necessário para continuar a simulação existem sem DOM, Canvas ou sessão de navegador. A interface e o renderer podem manter estado transitório de apresentação, como câmera, zoom, seleção, hover e previews; esse estado não é estado do universo.
2. **O renderer é uma projeção somente de leitura.** Ele recebe snapshots/projeções e desenha-os. Não cria, remove ou atualiza entidades canônicas por conta própria; ações visuais tornam-se comandos.
3. **Persistência transporta e valida dados, não regras de jogo.** Ela serializa, grava, lê e migra snapshots/eventos versionados. Não decide colisões, geração, avanço temporal ou regras de poderes.
4. **A UI não muta o universo diretamente.** Eventos de entrada viram comandos direcionados ao Core. A UI pode atualizar seu próprio estado visual e assinar eventos/projeções.
5. **Identidade e instâncias são estáveis.** Cada espaço, sistema, estrela, planeta e demais entidades persistidas possui ID próprio. Um template fornece valores iniciais; não é a instância. Entidades não compartilham estado mutável acidentalmente.
6. **Tempo e espaço do universo não dependem da tela.** Relógio simulado e coordenadas são dados lógicos. Coordenadas de tela, pixels, câmera e frame rate são detalhes de apresentação.
7. **Compatibilidade de saves é explícita.** Saves existentes, inclusive os que contêm Genesis-1/Astra-1 e o atlas de Astra-1, devem ser carregados sem apagar ou recriar conteúdo. Conversões de formato precisam ser versionadas, determinísticas e testadas.
8. **A migração preserva o comportamento.** Extrações substituem uma responsabilidade por vez e mantêm comandos, controles, poderes e resultados observáveis equivalentes. Mudanças de gameplay exigem outra missão.

## 2. Módulos, fronteiras e contratos

Os nomes abaixo definem responsabilidades-alvo; não exigem que os diretórios atuais sejam renomeados nesta missão.

| Módulo | Entradas | Saídas | Responsabilidade e limite |
| --- | --- | --- | --- |
| **Universe Core** | Comandos tipados a validar, configuração da simulação, estado carregado e avanço de tempo | Novo estado canônico/snapshot e eventos de domínio | É o ponto de coordenação e autoridade do universo. Valida e aplica operações ao estado através das APIs do modelo, tempo, física e espaço. Não importa DOM, Canvas, Firebase, Cloudflare ou APIs de armazenamento. |
| **Entity Model** | Dados de criação validados, IDs, tipos, componentes/propriedades e relações | Entidades e coleções imutáveis ou controladas pelo Core; dados serializáveis | Define identidade, esquema e relações das entidades. Instancia templates sem compartilhamento mutável. Não desenha nem executa armazenamento/regras de UI. |
| **Time** | Estado do relógio do universo, instante/intervalo lógico e controles solicitados | Novo estado temporal e intervalo simulado a processar | Define avanço, pausa e taxa do tempo simulado de forma reproduzível. Não consulta `Date.now()` para determinar regras simuladas sem receber o instante real como entrada explícita; não usa timers da UI como relógio canônico. |
| **Physics** | Snapshot/valores físicos das entidades, parâmetros e passo de simulação | Atualizações físicas propostas, resultados e eventos físicos | Calcula movimento e interações físicas sem dependência de Canvas/DOM ou armazenamento. Entrega resultados ao Core para validação/aplicação; não grava diretamente no store nem contém apresentação. |
| **Spatial** | Coordenadas lógicas, limites/regiões e consultas espaciais | Transformações lógicas, regiões/consultas e vizinhanças | Define coordenadas do universo e consultas de localização/alcance independentes de pixels. Conversões mundo↔tela e câmera pertencem ao adaptador de apresentação. Não decide gameplay alheio à localização. |
| **Renderer** | Snapshots ou projeções somente de leitura, recursos visuais e estado transitório de apresentação | Pixels/quadro e solicitações de interação convertidas em comandos pela borda da aplicação | Desenha entidades e visualizações. Pode ter caches descartáveis para desempenho, nunca autoridade sobre existência, posição ou estado canônico. Não persiste nem aplica regras. |
| **Persistence** | Snapshot/eventos versionados fornecidos pelo Core; instruções de leitura/gravação do adaptador | Bytes/JSON armazenados ou snapshot decodificado, validado e migrado | Implementa formatos, codecs, versionamento, armazenamento e migrações. Retorna dados candidatos para restauração do Core; não instancia gameplay, escolhe poderes, avança tempo ou resolve física. Provedores são substituíveis. |
| **Commands / Events** | Ações de usuário/sistema, payloads e eventos emitidos pelo Core | Comandos tipados para o Core; eventos imutáveis de fatos já ocorridos | Commands são pedidos encaminhados ao Core para validação e aplicação; events descrevem fatos após a aplicação. Consumidores podem reagir sem se tornar fonte de verdade. A camada não altera stores ou snapshots diretamente. |
| **UI** | Entrada de teclado/toque/clique, projeções, eventos e estado da conta | Comandos, preferências transitórias e elementos de interface | Apresenta controles e estado, traduz entrada em comandos e apresenta resultados. Pode gerir login/conta na borda, sem incorporar regras do universo. Não altera entidades, relógio ou física diretamente. |

## 3. Dependências permitidas

```text
UI ──envia comandos──> Commands ──solicita operação──> Universe Core
UI <──lê eventos/projeções── Universe Core
Renderer <──lê snapshot/projeção── Universe Core
Renderer ──desenha quadro──> apresentação visual
Universe Core ──coordena──> Entity Model
Universe Core ──coordena──> Time
Universe Core ──fornece entradas / aplica resultados──> Physics
Universe Core ──consulta──> Spatial
Universe Core ──snapshot / restauração validada──> Persistence (porta)
Universe Core ──emite──> Events ──consumidos por──> UI, Renderer, Persistence (adaptadores)
```

As setas representam chamadas ou dados na direção indicada. A porta de persistência é definida no limite da aplicação/Core; implementações concretas ficam fora do Core. Eventos notificam fatos, mas não substituem a operação síncrona que mantém invariantes do estado.

### Dependências proibidas

- Core, Entity Model, Time, Physics e Spatial importarem `document`, `window`, Canvas, DOM, bibliotecas visuais ou estado de componentes.
- Universe Core, modelo ou física dependerem de Firebase, Cloudflare, Worker/Durable Object, `localStorage`, HTTP ou formato proprietário de um provedor.
- Renderer ou UI escreverem diretamente em `WorldStore`, entidades, relógio, integrador físico ou snapshots canônicos.
- Persistence importar poderes, templates para decidir regras de jogo, renderer ou componentes de UI; codecs podem conhecer schemas versionados, não suas regras de gameplay.
- Physics depender do Renderer, de coordenadas em pixels ou de frame rate para produzir resultados canônicos.
- Entity Model depender de Persistence, UI, Renderer ou serviços de rede.
- Eventos criarem ciclos de escrita em que um consumidor altere o estado e republice o mesmo fato como se fosse uma nova operação autoritativa.
- Um módulo manter cópia mutável concorrente do estado canônico fora do Core sem sincronização, ownership e política de reconciliação explícitos.

## 4. Compatibilidade e adapters durante a migração

O código atual já oferece `GenesisEngine`, `WorldStore`, `EventBus` e módulos de domínio, mas responsabilidades ainda estão distribuídas: o script de `index.html` reúne apresentação, controles, relógio e orquestração; `auth-gate.js` participa do carregamento/serialização; a física mantém estado próprio em seu integrador. A extração deve tratar essas interfaces e formatos como legado a adaptar, sem presumir que o Core-alvo já esteja implementado.

1. **Adaptador de runtime legado:** expõe as entidades de `WorldStore`, o relógio hoje mantido pelo runtime da aplicação e o checkpoint necessário do integrador físico através das portas do Core. Durante a transição, uma única instância continua sendo dona do estado; não executar dois relógios ou simuladores em paralelo.
2. **Adaptador de comandos/eventos:** converte ações atuais de poderes, navegação e controles em comandos compatíveis com a API do Core. Mantém assinaturas usadas pela interface enquanto direciona as alterações pela fronteira definida. Cancelar uma pré-visualização ou criação ainda não confirmada não deve deixar entidade nem evento persistente.
3. **Adaptador do renderer atual:** converte snapshots/projeções do Core para o Canvas 2D e converte interações em comandos. Preserva seleções, modos de visualização, navegação e controles mobile/desktop durante a extração; câmeras, previews e caches continuam transitórios.
4. **Adaptador de persistência legado:** lê e escreve os snapshots atuais (incluindo versão 1 do `WorldStore`) e mantém os caminhos já usados pelo navegador/Worker e Durable Object. Firebase continua responsável por autenticação; o adaptador recebe identidade verificada pela borda, sem mover autenticação para o Core. A implementação do armazenamento não passa a conter lógica de simulação.
5. **Migração explícita de schema:** toda mudança de snapshot tem versão, transformação de entrada para o novo modelo e teste de ida/volta ou equivalência. Saves de Genesis-1/Astra-1 e atlas são preservados; nenhum adapter pode descartar campos desconhecidos silenciosamente ou substituir o universo por um novo seed.
6. **Substituição gradual:** comparar resultados do caminho legado com o novo em testes de regressão; trocar uma fronteira por vez e remover um adapter só depois de todos os consumidores e saves relevantes usarem o contrato novo.

Esses adapters orientam as extrações incrementais. A extração inicial em `src/core/universe-state.js` agora reúne o `WorldStore` e o estado temporal canônico (`simulationTime`, `timeScale` e `paused`) sob `UniverseState`. `GenesisEngine` mantém `engine.world` como compatibilidade, enquanto a interface acessa o estado temporal pelo adapter legado. O formato persistido atual (`world` versão 1 e campos temporais existentes) permanece inalterado; o checkpoint do integrador gravitacional segue no sistema de física e é lido e gravado pelo adapter de autenticação existente.

## 5. Critérios de conformidade para extrações futuras

Uma mudança respeita este contrato quando:

- O estado restaurado continua equivalente antes/depois da extração, preservando IDs e relações.
- Uma mesma entrada de simulação controlada produz o mesmo resultado lógico, sem depender de renderização ou tempo de parede oculto.
- O renderer pode ser substituído ou recriado sem criar, remover ou alterar entidades canônicas.
- A UI só provoca mudança canônica através de comandos aceitos pelo Core.
- O formato de persistência pode ser substituído/adaptado sem importar regras ou componentes visuais.
- Testes exercitam as portas e preservam as funcionalidades legadas cobertas pelo harness da Missão 02.

Se uma limitação atual impedir um critério, registrar a limitação e resolvê-la no menor escopo da missão de extração correspondente; este documento não autoriza refatoração antecipada.
