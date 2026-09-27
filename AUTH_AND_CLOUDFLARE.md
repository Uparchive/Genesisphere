# Firebase Auth + universos na Cloudflare

## O que esta integração faz

- Cadastro por e-mail/senha e entrada por e-mail/senha ou Google no Firebase Authentication.
- O navegador recebe um Firebase ID token e o envia ao Worker. O Worker valida assinatura, emissor, projeto, validade e UID antes de encaminhar a solicitação.
- O `uid` autenticado escolhe o Durable Object; o navegador não envia um ID de proprietário. Cada pessoa recebe um universo isolado em SQLite.
- O estado serializado da engine e da física fica no Durable Object. Enquanto a sessão estiver ativa, o navegador sincroniza o estado a cada 30 segundos. Após a sessão ficar inativa, alarmes do Durable Object avançam relógio, gravidade e colisões em blocos curtos, inclusive sem uma aba aberta.
- O modo atual permanece como demonstração até `authReady` ser habilitado; não há configuração Firebase ou URL do Worker neste repositório.

Firebase é a autoridade de contas e autenticação. O SQLite do Durable Object é a autoridade do estado do jogo. Não existe cópia de credenciais ou senha no banco da Cloudflare.

## Habilitar o login

1. Crie/seleciona um projeto Firebase e adicione uma aplicação Web.
2. Em Authentication, habilite os provedores E-mail/senha e Google. Para o Google, informe o e-mail de suporte do projeto.
3. Em Authentication > Settings > Authorized domains, inclua `uparchive.github.io` e o domínio local usado no desenvolvimento.
4. Copie `apiKey`, `authDomain`, `projectId` e `appId` da configuração Web para `src/auth/config.js`; troque `enabled` para `true`.
5. Instale Wrangler, autentique a CLI Cloudflare e, na raiz do projeto, publique a API:

   ```sh
   npx wrangler login
   npx wrangler deploy
   ```

   O primeiro deploy provisiona o namespace SQLite `UniverseDO`. A variável `FIREBASE_PROJECT_ID` em `wrangler.toml` precisa ter exatamente o `projectId` Firebase. `ALLOWED_ORIGINS` aceita origens completas separadas por vírgula; preserve o domínio GitHub Pages e remova domínios que não usa.

6. Copie a URL `workers.dev` exibida pelo Wrangler para `cloudflareApiBaseUrl` em `src/auth/config.js`, sem sufixo `/api/v1/world`.
7. Publique os arquivos do site na origem atual. O domínio Firebase e a origem do Worker têm de corresponder às configurações acima.

O ID de API Firebase da aplicação Web é intencionalmente público. Não coloque service-account keys, tokens administrativos ou segredos no repositório; o Worker não precisa de uma chave privada Firebase, pois valida os tokens públicos assinados pelo Firebase.

## Modelo de execução offline

O Durable Object agenda um alarme a cada 60 segundos e processa até 60 segundos simulados por execução, usando até 4.096 passos de integração. Se a Cloudflare atrasar o objeto por mais tempo, as execuções seguintes recuperam a diferença em lotes sem dar um único passo gravitacional gigante. Uma concessão de atividade de 90 segundos evita que a simulação do servidor e a aba aberta gravem sobre o mesmo universo ao mesmo tempo. O navegador renova essa concessão ao autosalvar. Fora do navegador, a escala máxima é 1× para manter passos da física dentro do orçamento computacional; velocidades maiores escolhidas no jogo não aceleram o trabalho offline.

O custo de alarmes e CPU cresce com o número de universos ativos e com o trabalho N-body de cada um. Cada universo ativo gera até 1.440 alarmes por dia, além de consultas e gravações SQLite; a cota gratuita da Cloudflare contabiliza gravações por linha e também alarmes. Antes de abrir cadastro ao público, definir limites de corpos por universo, acompanhar consumo e calibrar intervalo/tamanho dos lotes. A escala de tempo é deliberadamente uma constante V1 simples; não implementa ainda roteiro de acontecimentos, nascimento de vida, favoritos ou múltiplos universos por conta.

## Limites conhecidos

- As chaves Firebase e o Worker são requisitos externos ainda não fornecidos; sem configurá-los, o login fica inativo e o site continua no modo atual.
- A API foi configurada como Worker independente porque GitHub Pages está hospedado em `github.io`; o `workers.dev` funciona como endpoint HTTPS separado com CORS estrito.
- Os snapshots iniciais serializam as entidades/eventos e o estado privado do integrador. A compatibilidade futura de saves precisa de migrações explícitas por versão.
- A sessão é mantida pelo Firebase no navegador; não há recuperação de senha nem verificação obrigatória de e-mail nesta primeira etapa.
