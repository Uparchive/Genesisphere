# Astra-1 — Atlas canônico

Este diretório pertence **somente** à entidade concreta Astra-1.

- `atlas.js` é a fonte canônica, versionada e persistida no repositório para a geografia estrutural. A versão 1 começa com `features: []`: nenhum continente, rio, bioma ou cidade foi definido nesta missão.
- Pontos usam longitude em graus no intervalo `[-180, 180)` (a longitude dá a volta no antimeridiano) e latitude em graus no intervalo `[-90, 90]`. `(0, 0)` é a interseção entre o meridiano principal e o equador, fixada no espaço local do planeta.
- `planetPoint` valida e normaliza coordenadas; `toNormalizedCoordinates` converte-as em `u` e `v` no intervalo `[0, 1]` (com `u < 1`), sem utilizar pixels de tela.
- O atlas não depende de `Math.random()`, tempo, viewport, Canvas, DOM ou câmera. Zoom, movimento, rotação e foco são responsabilidades da apresentação; não podem alterar a geografia canônica.
- A renderização visual atual do Astra-1 permanece independente do atlas até uma missão específica de integração. Seus desenhos atuais **não** são dados geográficos canônicos.
- Futuras edições estruturais devem ser versionadas explicitamente e permanecer restritas a `src/entities/astra-1/`. Nenhum outro planeta herda este atlas por padrão.
