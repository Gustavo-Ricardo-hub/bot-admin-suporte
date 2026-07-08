# 🛠 Bot de Suporte WhatsApp — ADMIN Bot

Bot de suporte técnico via WhatsApp, feito com **Node.js**, **whatsapp-web.js** e **MySQL**, com espelhamento automático dos chamados em uma planilha do **Google Sheets**.

Desenvolvido como projeto de TCC na **ETEC Zona Leste** — Curso de Desenvolvimento de Sistemas.

O cliente abre o chamado direto pelo WhatsApp, o bot registra tudo no banco, notifica o grupo de suporte, e o técnico assume o atendimento sem sair da conversa — o cliente e o técnico nunca trocam contato diretamente, tudo passa pelo bot.

---

## 📑 Índice

- [Visão geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Arquitetura e fluxo](#-arquitetura-e-fluxo)
- [Stack utilizada](#-stack-utilizada)
- [Estrutura do projeto](#-estrutura-do-projeto)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação](#-instalação)
- [Configuração do `.env`](#-configuração-do-env)
- [Configuração do Google Sheets](#-configuração-do-google-sheets)
- [Banco de dados](#-banco-de-dados)
- [Comandos disponíveis](#-comandos-disponíveis)
- [Tabela de permissões](#-tabela-de-permissões)
- [Formato do número de chamado](#-formato-do-número-de-chamado)
- [Fluxo de estados da sessão](#-fluxo-de-estados-da-sessão)
- [Scripts auxiliares](#-scripts-auxiliares)
- [Segurança](#-segurança)
- [Problemas comuns (troubleshooting)](#-problemas-comuns-troubleshooting)
- [Limitações conhecidas](#-limitações-conhecidas)
- [Roadmap / próximos passos](#-roadmap--próximos-passos)
- [Autor](#-autor)

---

## 🔍 Visão geral

O sistema conecta três perfis de usuário — **cliente**, **operador (técnico)** e **admin** — através de uma única sessão de WhatsApp controlada pelo bot (`whatsapp-web.js`). Não existe painel web: toda a operação, do abrir ao fechar um chamado, acontece por mensagens de texto no WhatsApp.

Cada chamado passa pelo ciclo: **aberto → em andamento → fechado**, com o número do chamado, técnico responsável e datas sendo persistidos tanto no MySQL quanto em uma planilha do Google Sheets (que funciona como um espelho de leitura fácil para relatórios e follow-up gerencial).

---

## ✨ Funcionalidades

- Cadastro automático do cliente no primeiro contato (RF, nome, setor) — não precisa se cadastrar de novo nas próximas vezes
- Abertura de chamado por conversa natural, sem formulários
- Encaminhamento automático do chamado para o grupo de suporte
- Atribuição de chamado a um técnico por dois caminhos: o técnico "pega" (`eu quero`) ou o admin atribui manualmente (`atribuir CHxxxx RF`)
- Transferência de um chamado já em andamento para outro operador (`transferir CHxxxx RF`), restrito ao admin
- Ponte de mensagens bidirecional entre técnico e cliente sem expor o número de nenhum dos dois
- Encerramento individual (`fechar CHxxxx`) ou em massa (`fechar TODOS`, restrito ao admin)
- Consulta de status e listagem dos últimos chamados
- Espelhamento em tempo real de cada chamado (abertura, atribuição, transferência, fechamento) para o Google Sheets
- Script de migração para popular a planilha a partir do histórico já existente no banco
- Log no console de todo grupo do WhatsApp com seu ID, útil para configurar `GRUPO_SUPORTE` / `BOT_TESTE`

---

## 🧭 Arquitetura e fluxo

```
Cliente (WhatsApp)                Bot (Node.js)                 Grupo de Suporte
      |                                |                               |
      |-- "oi" ---------------------->|                               |
      |<-- pede RF / nome / setor ----|                               |
      |-- descreve o problema ------->|                               |
      |                                |-- INSERT chamados (MySQL) -->|
      |                                |-- append Sheets ------------>|
      |                                |-- notifica chamado --------->|
      |<-- "Chamado aberto CHxxxx" ---|                               |
      |                                |                     Técnico responde
      |                                |                     "eu quero" (reply)
      |                                |<-- UPDATE status = em andamento
      |                                |<-- vincula atendimentos[] --|
      |<== mensagens intermediadas ==>|<== mensagens intermediadas ==>|
      |                                |
      |                          admin: "transferir CHxxxx RF"
      |                                |<-- UPDATE tecnico_responsavel
      |                                |<-- revincula atendimentos[] --|
      |<== mensagens com novo técnico =>|
      |                                |
      |                          "fechar CHxxxx"
      |<-- chamado encerrado ---------|-- UPDATE status = fechado -->|
```

O roteamento de "quem fala com quem" é resolvido em memória pelo objeto `atendimentos`, indexado pelo número de telefone. Isso significa que a sessão de atendimento (ligação técnico↔cliente) **não sobrevive a um restart** do processo, mesmo que os dados do chamado continuem salvos no banco.

---

## 🧱 Stack utilizada

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js |
| Mensageria | [`whatsapp-web.js`](https://wwebjs.dev/) (usa uma sessão real do WhatsApp Web via Puppeteer) |
| Banco de dados | MySQL (via `mysql2/promise`) |
| Planilha | Google Sheets API (`googleapis`, autenticação via conta de serviço) |
| Configuração | `dotenv` |
| QR Code de login | `qrcode-terminal` |

---

## 📂 Estrutura do projeto

```
BOT-ADMIN/
├── index.js                          # Lógica principal do bot (handlers de mensagem)
├── migrar-sheets.js                  # Script para popular o Sheets a partir do MySQL
├── ADMIN_bot.sql                     # Schema completo do banco (6 tabelas)
├── package.json
├── .env                              # Credenciais (NÃO versionar)
├── bot-visualizar-XXXXXXXXXXXX.json  # Chave da conta de serviço do Google (NÃO versionar)
├── .gitignore
└── README.md
```

---

## ✅ Pré-requisitos

- Node.js instalado (recomendado LTS mais recente)
- MySQL (local ou remoto) com acesso para criar banco/tabelas
- Uma conta de serviço do Google Cloud com a API do Google Sheets habilitada
- Um número de WhatsApp disponível para ser o número do bot (recomenda-se não ser seu número pessoal principal)
- WhatsApp instalado no celular para escanear o QR Code de conexão

---

## 🚀 Instalação

```bash
git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
cd BOT-ADMIN
npm install
```

Crie o arquivo `.env` na raiz do projeto (veja a seção [Configuração do `.env`](#-configuração-do-env)).

Importe o schema no MySQL:

```bash
mysql -u root -p < ADMIN_bot.sql
```
> ou, via phpMyAdmin: **Importar → ADMIN_bot.sql**

Coloque o arquivo de credenciais do Google (`bot-visualizar-*.json`) na raiz do projeto — veja [Configuração do Google Sheets](#-configuração-do-google-sheets).

Rode o bot:

```bash
node index.js
```

Na primeira execução vai aparecer um **QR Code** no terminal. Escaneie pelo WhatsApp em **Configurações → Aparelhos conectados → Conectar aparelho**.

---

## ⚙️ Configuração do `.env`

| Variável | Descrição |
|---|---|
| `DB_HOST` | Host do MySQL (ex: `localhost`) |
| `DB_USER` | Usuário do MySQL |
| `DB_PASS` | Senha do MySQL |
| `DB_NAME` | Nome do banco (`ADMIN_bot`) |
| `ADMIN_ID` | Número de WhatsApp do administrador, no formato que aparece no console (`USER: ...`) ao receber a primeira mensagem |

Exemplo:

```env
ADMIN_ID=5511999999999
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=ADMIN_bot
```

> ⚠️ O admin também precisa estar cadastrado na tabela `operadores`, senão o campo `fechado_por` não é preenchido corretamente ao fechar chamados.

> ⚠️ Se o admin usar mais de um número/aparelho de WhatsApp, apenas o número exato salvo em `ADMIN_ID` será reconhecido como administrador — comandos enviados de outro número caem no fluxo de operador comum (ou são recusados, no caso dos comandos exclusivos de admin).

---

## 📊 Configuração do Google Sheets

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/) e habilite a **Google Sheets API**.
2. Crie uma **conta de serviço** e gere uma chave em formato JSON.
3. Compartilhe a planilha de destino com o e-mail da conta de serviço (encontrado dentro do próprio JSON, campo `client_email`), dando permissão de **Editor**.
4. Salve o arquivo JSON na raiz do projeto e ajuste o nome no `keyFile` de `index.js` e `migrar-sheets.js` caso ele seja diferente.
5. Copie o **ID da planilha** (a string entre `/d/` e `/edit` na URL) e atualize a constante `SPREADSHEET_ID` em ambos os arquivos.

A planilha deve conter uma aba chamada **`Sheet2`** com as colunas, na ordem:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Número | Nome | RF | Setor | Problema | Status | Técnico | Data abertura | Data fechamento |

---

## 🗄 Banco de dados

Schema definido em `ADMIN_bot.sql`, com 6 tabelas:

| Tabela | O que armazena |
|---|---|
| `operadores` | Técnicos e admin do sistema (nome, número, RF, cargo, status ativo) |
| `usuarios` | Clientes que já abriram chamado (dados salvos no primeiro contato) |
| `chamados` | Todos os chamados, abertos e fechados, com status e responsáveis |
| `historico_status` | Histórico de alterações de status por chamado *(schema pronto, ainda não populado pelo `index.js`)* |
| `mensagens_chamado` | Mensagens trocadas em cada atendimento *(schema pronto, ainda não populado pelo `index.js`)* |
| `logs` | Ações realizadas pelos operadores *(schema pronto, ainda não populado pelo `index.js`)* |

**Relacionamentos principais (`chamados`):**
- `tecnico_id` → FK para `operadores.id` *(campo existe no schema, mas o código atual usa `tecnico_responsavel`, um varchar solto, em vez desta FK)*
- `fechado_por` → FK para `operadores.id`

---

## 💬 Comandos disponíveis

### Admin e Operador

| Comando | O que faz |
|---|---|
| `lista` | Lista os 10 últimos chamados |
| `status CHxxxx` | Mostra detalhes de um chamado |
| `fechar CHxxxx` | Fecha um chamado específico |
| `eu quero` (respondendo à mensagem do chamado no grupo) | Assume o atendimento de um chamado em aberto |

### Somente Admin

| Comando | O que faz |
|---|---|
| `atribuir CHxxxx RF` | Atribui um chamado **em aberto** a um operador pelo RF |
| `transferir CHxxxx RF` | Transfere um chamado **já em andamento** para outro operador pelo RF |
| `fechar TODOS` | Fecha todos os chamados abertos/em andamento de uma vez |

### Cliente

Não usa comandos — interage por linguagem natural (saudação → dados cadastrais → descrição do problema).

---

## 🔐 Tabela de permissões

| Ação | Comando | Admin | Operador | Cliente |
|---|---|:---:|:---:|:---:|
| Abrir chamado | *(mensagem livre)* | — | — | ✅ |
| Ver status de um chamado | `status CHxxxx` | ✅ | ✅ | — |
| Listar últimos chamados | `lista` | ✅ | ✅ | — |
| Pegar um chamado em aberto | `eu quero` *(respondendo o card)* | ✅ | ✅ | — |
| Fechar um chamado específico | `fechar CHxxxx` | ✅ | ✅ | — |
| Atribuir chamado em aberto a um operador | `atribuir CHxxxx RF` | ✅ | ❌ | — |
| Transferir chamado em andamento entre operadores | `transferir CHxxxx RF` | ✅ | ❌ | — |
| Fechar todos os chamados de uma vez | `fechar TODOS` | ✅ | ❌ | — |

> **Como a permissão é verificada:** `isAdmin` compara o número de quem enviou a mensagem com a variável `ADMIN_ID` do `.env`. `isOperador` é `true` se o número existir (e estiver ativo) na tabela `operadores`, **ou** se for o admin. Ou seja, todo admin também é operador, mas nem todo operador é admin.

---

## 🔢 Formato do número de chamado

```
CH0528-0012
  └┬─┘ └┬──┘
  mês+dia  ID sequencial do banco (4 dígitos, com zero à esquerda)
```

Gerado automaticamente na criação do chamado, combinando a data atual com o `id` autoincrementado da tabela `chamados`.

---

## 🔄 Fluxo de estados da sessão

Cada usuário tem uma sessão em memória (`sessions[numero]`) que avança pelas etapas:

```
inicio → rf → nome → setor → suporte → fim
```

- **`rf` / `nome` / `setor`**: coletados apenas no primeiro contato; em contatos seguintes o bot já reconhece o cliente pelo número e pula direto para `suporte`.
- **`suporte`**: qualquer texto enviado aqui é interpretado como a descrição do problema e vira um novo chamado — **exceto** se for um dos comandos reservados (`status`, `fechar`, `atribuir`, `transferir`, `lista`, `eu quero`).
- **`fim`**: estado terminal após a criação de um chamado; novas mensagens são ignoradas até o próximo "oi".

> Importante: por estar em memória (`sessions` e `atendimentos` são objetos JS, não persistidos), um restart do bot zera o progresso de sessões e atendimentos em andamento — os dados dos chamados no MySQL permanecem intactos, mas a "ponte" ativa entre técnico e cliente precisa ser refeita.

> Ao usar `transferir`, o vínculo antigo em `atendimentos` é removido e um novo é criado apontando pro operador de destino — o cliente não percebe diferença na forma de conversar, só passa a falar com outro técnico.

---

## 🧩 Scripts auxiliares

### `migrar-sheets.js`

Popula a planilha do zero a partir de tudo que já existe na tabela `chamados` do MySQL. Útil para:
- Primeira configuração do Sheets em uma base já com histórico
- Reconstruir a planilha caso ela seja corrompida ou apagada acidentalmente

```bash
node migrar-sheets.js
```

⚠️ O script **limpa** o intervalo `Sheet2!A2:I` antes de reinserir os dados — não use em uma planilha com dados manuais que você queira preservar.

---

## 🔐 Segurança

- **Nunca** versione `.env` nem o arquivo de credenciais do Google (`bot-visualizar-*.json`) — ambos devem constar no `.gitignore`.
- Se qualquer um desses arquivos já foi commitado em algum momento (mesmo que removido depois), considere as credenciais comprometidas: troque a senha do MySQL e gere uma nova chave de conta de serviço no Google Cloud Console.
- O `ADMIN_ID` deve ser tratado como informação sensível — quem tiver esse número pode, em tese, tentar se passar pelo admin caso a validação dependa só da comparação de string.
- Os IDs de grupo (`GRUPO_SUPORTE`, `BOT_TESTE`) estão fixos no código-fonte; ao portar o projeto para outro ambiente/grupo, é preciso atualizá-los manualmente.

---

## 🩹 Problemas comuns (troubleshooting)

| Sintoma | Causa provável / solução |
|---|---|
| QR Code não aparece | Apague a pasta `.wwebjs_auth` e reinicie o bot |
| MySQL não conecta | Confirme se o banco `ADMIN_bot` existe e se as credenciais no `.env` estão corretas |
| `IS ADMIN: false` mesmo sendo o admin | O número no `.env` está diferente do que aparece no console (`USER: ...`). Copie exatamente o número exibido no console |
| Comando enviado pelo próprio número do bot/admin não gera nenhuma resposta nem log | O comando não está incluído na lista `ehComando` dentro do bloco `if (message.fromMe)`. Todo novo comando precisa ser adicionado nessa lista, senão é descartado silenciosamente |
| Erro `Unknown column` | Alguma coluna não existe na tabela — confira se `ADMIN_bot.sql` foi importado por completo |
| Erro de chave estrangeira ao fechar chamado | O admin precisa estar cadastrado na tabela `operadores` |
| Chamado não aparece no Sheets | Verifique se a planilha foi compartilhada com o e-mail da conta de serviço e se o `SPREADSHEET_ID` está correto |
| `transferir` diz "chamado não está em andamento" | Só é possível transferir chamados que já foram atribuídos (via `atribuir` ou `eu quero`). Um chamado ainda `aberto` deve ser atribuído primeiro |

---

## ⚠️ Limitações conhecidas

- Sessões e atendimentos ativos vivem só em RAM — não sobrevivem a um restart do processo
- As tabelas `historico_status`, `mensagens_chamado` e `logs` existem no schema mas ainda não são preenchidas pelo código atual
- A FK `tecnico_id` em `chamados` não é usada; o técnico responsável é gravado apenas como texto livre em `tecnico_responsavel`
- `ADMIN_ID` aceita apenas um único número — não há suporte nativo a múltiplos administradores
- Sem autenticação/dashboard web — toda a administração é feita por comando de texto no WhatsApp
- Depende de uma sessão real do WhatsApp Web (via Puppeteer), sujeita às políticas e limites de uso do WhatsApp para automação

---

## 🗺 Roadmap / próximos passos

- [ ] Popular `historico_status` a cada mudança de status do chamado (incluindo transferências)
- [ ] Registrar as mensagens trocadas em `mensagens_chamado` (auditoria completa do atendimento)
- [ ] Persistir sessões/atendimentos fora da memória (ex: Redis ou tabela auxiliar no MySQL) para sobreviver a restarts
- [ ] Passar a usar `tecnico_id` (FK) em vez de `tecnico_responsavel` (texto livre)
- [ ] Suportar múltiplos números de admin (lista em vez de valor único)
- [ ] Mover IDs de grupo (`GRUPO_SUPORTE`, `BOT_TESTE`) para o `.env`
- [ ] Painel web simples para consulta de chamados e relatórios

---

## 👤 Autor

**Gustavo Henrique Ricardo**
3º ano de Desenvolvimento de Sistemas — ETEC Zona Leste