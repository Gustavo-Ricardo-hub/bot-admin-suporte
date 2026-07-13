const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mysql = require('mysql2/promise');
const { google } = require('googleapis');
require('dotenv').config();

const client = new Client();
const sessions = {};
const atendimentos = {};
const ADMIN_ID = process.env.ADMIN_ID;
const GRUPO_SUPORTE = '120363425837780456@g.us';
const BOT_TESTE = '120363409405417123@g.us';


// CONEXÃO COM MYSQL

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});


// GOOGLE SHEETS
const SPREADSHEET_ID = '1WbJ2oFZ_FVjHcEDQm-wjjU6OzhmYb3rNfTrFlNgB7-k';

const auth = new google.auth.GoogleAuth({
    keyFile: 'bot-visualizar-eb624aabca80.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

async function getSheets() {
    const authClient = await auth.getClient();
    return google.sheets({ version: 'v4', auth: authClient });
}

// Busca o índice da linha do chamado na planilha
async function sheetBuscarLinha(sheets, numero) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Bot-Chamados!A:A'
    });

    const rows = res.data.values || [];
    const rowIndex = rows.findIndex((row, i) => i > 0 && row[0] === numero);

    return rowIndex === -1 ? null : rowIndex + 1; // 1-indexed
}

// 📊 Adiciona chamado na planilha
async function sheetAdicionarChamado(numero, nome, rf, setor, problema) {
    try {
        const sheets = await getSheets();
        const agora = new Date().toLocaleString('pt-BR');

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Bot-Chamados!A:I',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    numero,
                    nome,
                    rf,
                    setor,
                    problema,
                    'aberto',
                    '',      // técnico — vazio ao abrir
                    agora,   // data abertura
                    ''       // data fechamento — vazio ao abrir
                ]]
            }
        });

        console.log(`📊 Sheets: chamado ${numero} adicionado.`);
    } catch (erro) {
        console.error('Erro ao adicionar no Sheets:', erro.message);
    }
}

// 📊 Atualiza técnico responsável na planilha
async function sheetAtualizarTecnico(numero, tecnico) {
    try {
        const sheets = await getSheets();
        const sheetRow = await sheetBuscarLinha(sheets, numero);

        if (!sheetRow) {
            console.log(`📊 Sheets: chamado ${numero} não encontrado para atualizar técnico.`);
            return;
        }

        // Coluna G = técnico
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Bot-Chamados!F${sheetRow}:G${sheetRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['em andamento', tecnico]]
            }
        });

        console.log(`📊 Sheets: técnico ${tecnico} atribuído ao chamado ${numero}.`);
    } catch (erro) {
        console.error('Erro ao atualizar técnico no Sheets:', erro.message);
    }
}

// 📊 Fecha chamado na planilha
async function sheetFecharChamado(numero, quemFechou) {
    try {
        const sheets = await getSheets();
        const sheetRow = await sheetBuscarLinha(sheets, numero);

        if (!sheetRow) {
            console.log(`📊 Sheets: chamado ${numero} não encontrado para fechar.`);
            return;
        }

        const agora = new Date().toLocaleString('pt-BR');

        // Colunas F=status, H=quemFechou não existe — usamos I=data fechamento
        // F=status, G=técnico (mantém), H=data abertura (mantém), I=data fechamento
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Bot-Chamados!F${sheetRow}:I${sheetRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['fechado', quemFechou, '', agora]]
            }
        });

        console.log(`📊 Sheets: chamado ${numero} fechado.`);
    } catch (erro) {
        console.error('Erro ao fechar no Sheets:', erro.message);
    }
}





// =============================================
// FUNÇÕES MYSQL
// =============================================

async function buscarOperador(numero) {
    const [rows] = await db.query(
        'SELECT * FROM operadores WHERE numero_whatsapp = ? AND ativo = 1',
        [numero]
    );
    return rows[0];
}

async function criarChamado(usuario, problema, rf, nome, setor) {
    const [result] = await db.query(
        'INSERT INTO chamados (usuario, rf, problema, status, data_abertura, nome, setor) VALUES (?, ?, ?, ?, NOW(), ?, ?)',
        [usuario, rf, problema, 'aberto', nome, setor]
    );

    const id = result.insertId;
    const data = new Date();

    const numero = `CH${String(data.getMonth() + 1).padStart(2, '0')}${String(data.getDate()).padStart(2, '0')}-${String(id).padStart(4, '0')}`;

    await db.query('UPDATE chamados SET numero = ? WHERE id = ?', [numero, id]);

    return numero;
}

async function buscarChamado(numero) {
    const [rows] = await db.query(
        'SELECT * FROM chamados WHERE numero = ?',
        [numero]
    );
    return rows[0];
}

async function fecharChamado(numero, quemFechouId) {
    const [result] = await db.query(
        'UPDATE chamados SET status = ?, fechado_por = ?, data_fechamento = NOW() WHERE numero = ? AND status != ?',
        ['fechado', quemFechouId, numero, 'fechado']
    );
    return result.affectedRows;
}

async function fecharTodosChamados(quemFechouId) {
    const [result] = await db.query(
        'UPDATE chamados SET status = ?, fechado_por = ?, data_fechamento = NOW() WHERE status != ?',
        ['fechado', quemFechouId, 'fechado']
    );
    return result.affectedRows;
}

async function listarChamados() {
    const [rows] = await db.query(
        'SELECT numero, status FROM chamados ORDER BY id DESC LIMIT 10'
    );
    return rows;
}

async function buscarUsuario(numero) {
    const [rows] = await db.query(
        'SELECT * FROM usuarios WHERE numero_whatsapp = ?',
        [numero]
    );
    return rows[0];
}

async function salvarUsuario(numero, rf, nome, setor) {
    await db.query(
        'INSERT INTO usuarios (numero_whatsapp, rf, nome, setor) VALUES (?, ?, ?, ?)',
        [numero, rf, nome, setor]
    );
}

// =============================================
// 📱 QR CODE
// =============================================
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// =============================================
// ✅ READY
// =============================================
client.on('ready', async () => {
    console.log('Bot conectado!');

    const chats = await client.getChats();

    chats.forEach(chat => {
        if (chat.isGroup) {
            console.log('GRUPO:', chat.name);
            console.log('ID:', chat.id._serialized);
        }
    });
});

// =============================================
// 💬 MENSAGENS
// =============================================
client.on('message_create', async message => {

    if (message.fromMe) {
        const textoLower = (message.body || '').toLowerCase().trim();
        const ehComando =
            textoLower === 'eu quero' ||
            textoLower === 'lista' ||
            textoLower.startsWith('status') ||
            textoLower.startsWith('fechar') ||
            textoLower.startsWith('atribuir') ||
            textoLower.startsWith('transferir');
            //NOVOS COMANDOS PODEM SER ADICIONADOS AQUI

        if (!ehComando) return;
    }

    if (!message.body) return;

    const msg = message.body || '';
    const msgLower = msg.toLowerCase().trim();

    const contact = await message.getContact();
    const numeroUser = contact.number;

    const operador = await buscarOperador(numeroUser);
    const isAdmin = numeroUser === ADMIN_ID;
    const isOperador = !!operador || isAdmin;

    const quemFechouId = operador ? operador.id : null;

    console.log('USER:', numeroUser);
    console.log('IS ADMIN:', isAdmin);
    console.log('IS OPERADOR:', isOperador);
    console.log('MSG:', msgLower);

    if (!sessions[numeroUser]) {
        sessions[numeroUser] = { etapa: 'inicio', dados: {} };
    }

    const session = sessions[numeroUser];


    // =============================================
    // 🔎 STATUS — Admin e Operador
    // =============================================
    if (msgLower.startsWith('status')) {

        if (!isOperador) return;

        const numero = msg.trim().split(/\s+/)[1]?.toUpperCase();

        if (!numero) return message.reply('❌ Use: status CHxxxx');

        const chamado = await buscarChamado(numero);

        if (!chamado) return message.reply('❌ Chamado não encontrado.');

        return message.reply(
            `📌 ${chamado.numero}\n` +
            `🛠 ${chamado.problema}\n` +
            `📊 ${chamado.status}\n` +
            `🪪 RF: ${chamado.rf}\n` +
            `👤 ${chamado.nome} (${chamado.setor})`
        );
    }


    // =============================================
    // 🔒 FECHAR CHAMADO — Admin e Operador
    // =============================================
    if (msgLower.startsWith('fechar')) {

        if (!isOperador) return;

        const numero = msg.trim().split(/\s+/)[1]?.toUpperCase();

        // 🔥 FECHAR TODOS — Somente admin
        if (numero === 'TODOS') {

            if (!isAdmin) {
                return message.reply(
                    '❌ Apenas o administrador pode fechar todos os chamados.'
                );
            }

            const [chamadosAbertos] = await db.query(
                'SELECT * FROM chamados WHERE status != ?',
                ['fechado']
            );

            const fechados = await fecharTodosChamados(quemFechouId);

            for (const chamado of chamadosAbertos) {
                try {
                    // 📊 Sheets
                    await sheetFecharChamado(chamado.numero, contact.pushname);

                    await client.sendMessage(
                        `${chamado.usuario}@c.us`,
                        `✅ Seu chamado foi fechado!\n\n` +
                        `📌 Número: ${chamado.numero}\n` +
                        `🔒 Fechado por: ${contact.pushname}`
                    );

                    const tecnicoNumero = atendimentos[chamado.usuario]?.tecnico;
                    delete atendimentos[chamado.usuario];
                    if (tecnicoNumero) delete atendimentos[tecnicoNumero];

                } catch (erro) {
                    console.log(`Erro ao avisar ${chamado.usuario}:`, erro);
                }
            }

            return message.reply(
                `✅ ${fechados} chamados foram fechados por ${contact.pushname}!`
            );
        }

        // 🔒 FECHAR UM CHAMADO
        if (!numero) return message.reply('❌ Use: fechar CHxxxx');

        const chamado = await buscarChamado(numero);

        if (!chamado) return message.reply('❌ Chamado não encontrado.');

        const atualizado = await fecharChamado(numero, quemFechouId);

        if (atualizado === 0) return message.reply('❌ Chamado já está fechado.');

        // 📊 Sheets
        await sheetFecharChamado(numero, contact.pushname);

        await client.sendMessage(
            BOT_TESTE,
            `📢 CHAMADO FECHADO\n\n` +
            `📌 Número: ${numero}\n` +
            `👤 Nome: ${chamado.nome}\n` +
            `🪪 RF: ${chamado.rf}\n` +
            `🏢 Setor: ${chamado.setor}\n` +
            `🛠 Problema: ${chamado.problema}\n` +
            `🔒 Fechado por: ${contact.pushname}`
        );

        await client.sendMessage(
            `${chamado.usuario}@c.us`,
            `✅ Seu chamado foi fechado!\n\n` +
            `📌 Número: ${numero}\n` +
            `🔒 Fechado por: ${contact.pushname}`
        );

        if (sessions[chamado.usuario]) {
            sessions[chamado.usuario].etapa = 'fim';
        }

        const tecnicoAtivo = atendimentos[chamado.usuario]?.tecnico;

        delete atendimentos[chamado.usuario];

        if (tecnicoAtivo) {
            delete atendimentos[tecnicoAtivo];

            await client.sendMessage(
                `${tecnicoAtivo}@c.us`,
                `🔴 Atendimento finalizado.\n\n` +
                `✅ Chamado ${numero} fechado por ${contact.pushname}!`
            );
        }

        return;
    }


    // =============================================
    // 📋 LISTA — Admin e Operador
    // =============================================
    if (msgLower === 'lista') {

        if (!isOperador) return;

        const chamados = await listarChamados();

        if (chamados.length === 0) {
            return message.reply('📭 Nenhum chamado encontrado.');
        }

        let resposta = '📋 Últimos chamados:\n\n';
        chamados.forEach(c => { resposta += `${c.numero} - ${c.status}\n`; });

        return message.reply(resposta);
    }


    // =============================================
    // 📋 ATRIBUIR CHAMADO — Somente admin
    // =============================================
    if (msgLower.startsWith('atribuir')) {

        if (!isAdmin) return message.reply("❌ Acesso negado ");

        const partes = msg.trim().split(/\s+/);
        const numeroChamado = partes[1]?.toUpperCase();
        const rfOperador = partes[2];

        if (!numeroChamado || !rfOperador) {
            return message.reply('❌ Use: atribuir CHxxxx RF');
        }

        const chamado = await buscarChamado(numeroChamado);

        if (!chamado) return message.reply('❌ Chamado não encontrado.');

        if (chamado.status !== 'aberto') {
            return message.reply('⚠️ Esse chamado não está aberto.');
        }

        const [rows] = await db.query(
            'SELECT * FROM operadores WHERE rf = ? AND ativo = 1',
            [rfOperador]
        );

        const operadorAlvo = rows[0];

        if (!operadorAlvo) {
            return message.reply(`❌ Operador com RF ${rfOperador} não encontrado.`);
        }

        await db.query(
            'UPDATE chamados SET status = ?, tecnico_responsavel = ? WHERE numero = ?',
            ['em andamento', operadorAlvo.nome, numeroChamado]
        );

        // 📊 Sheets
        await sheetAtualizarTecnico(numeroChamado, operadorAlvo.nome);

        atendimentos[operadorAlvo.numero_whatsapp] = {
            cliente: chamado.usuario,
            nomeTecnico: operadorAlvo.nome
        };

        atendimentos[chamado.usuario] = {
            tecnico: operadorAlvo.numero_whatsapp,
            nomeTecnico: operadorAlvo.nome
        };

        await client.sendMessage(
            BOT_TESTE,
            `📋 CHAMADO ATRIBUÍDO\n\n` +
            `📌 Número: ${numeroChamado}\n` +
            `👤 Cliente: ${chamado.nome}\n` +
            `🛠 Problema: ${chamado.problema}\n` +
            `👨‍💻 Atribuído para: ${operadorAlvo.nome} (RF: ${rfOperador})`
        );

        await client.sendMessage(
            `${operadorAlvo.numero_whatsapp}@c.us`,
            `📋 Chamado atribuído a você!\n\n` +
            `📌 Número: ${numeroChamado}\n` +
            `👤 Cliente: ${chamado.nome}\n` +
            `🏢 Setor: ${chamado.setor}\n` +
            `🛠 Problema: ${chamado.problema}\n\n` +
            `💬 A partir de agora, tudo que você escrever aqui será enviado diretamente para o cliente.`
        );

        return message.reply(`✅ Chamado ${numeroChamado} atribuído para ${operadorAlvo.nome}!`);
    }


    // =============================================
    // 🔄 TRANSFERIR CHAMADO — Somente admin
    // =============================================
    if (msgLower.startsWith('transferir')) {

        if (!isAdmin) {
            return message.reply('❌ Apenas o administrador pode transferir chamados.');
        }

        const partes = msg.trim().split(/\s+/);
        const numeroChamado = partes[1]?.toUpperCase();
        const rfNovoOperador = partes[2];

        if (!numeroChamado || !rfNovoOperador) {
            return message.reply('❌ Use: transferir CHxxxx RF');
        }

        const chamado = await buscarChamado(numeroChamado);

        if (!chamado) return message.reply('❌ Chamado não encontrado.');

        if (chamado.status !== 'em andamento') {
            return message.reply('⚠️ Esse chamado não está em andamento (só é possível transferir chamados já atribuídos).');
        }

        const [rows] = await db.query(
            'SELECT * FROM operadores WHERE rf = ? AND ativo = 1',
            [rfNovoOperador]
        );

        const novoOperador = rows[0];

        if (!novoOperador) {
            return message.reply(`❌ Operador com RF ${rfNovoOperador} não encontrado.`);
        }

        // Técnico antigo (se estiver com atendimento ativo)
        const tecnicoAntigoNumero = atendimentos[chamado.usuario]?.tecnico;
        const tecnicoAntigoNome = atendimentos[chamado.usuario]?.nomeTecnico || chamado.tecnico_responsavel;

        if (novoOperador.numero_whatsapp === tecnicoAntigoNumero) {
            return message.reply('⚠️ Esse chamado já está com esse operador.');
        }

        // Atualiza banco
        await db.query(
            'UPDATE chamados SET tecnico_responsavel = ? WHERE numero = ?',
            [novoOperador.nome, numeroChamado]
        );

        // 📊 Sheets
        await sheetAtualizarTecnico(numeroChamado, novoOperador.nome);

        // Remove vínculos antigos
        if (tecnicoAntigoNumero) delete atendimentos[tecnicoAntigoNumero];
        delete atendimentos[chamado.usuario];

        // Cria novos vínculos
        atendimentos[novoOperador.numero_whatsapp] = {
            cliente: chamado.usuario,
            nomeTecnico: novoOperador.nome
        };

        atendimentos[chamado.usuario] = {
            tecnico: novoOperador.numero_whatsapp,
            nomeTecnico: novoOperador.nome
        };

        // Avisa grupo
        await client.sendMessage(
            BOT_TESTE,
            `🔄 CHAMADO TRANSFERIDO\n\n` +
            `📌 Número: ${numeroChamado}\n` +
            `👤 Cliente: ${chamado.nome}\n` +
            `🛠 Problema: ${chamado.problema}\n` +
            `👨‍💻 De: ${tecnicoAntigoNome || 'desconhecido'}\n` +
            `👨‍💻 Para: ${novoOperador.nome} (RF: ${rfNovoOperador})`
        );

        // Avisa técnico antigo
        if (tecnicoAntigoNumero) {
            await client.sendMessage(
                `${tecnicoAntigoNumero}@c.us`,
                `🔄 O chamado ${numeroChamado} foi transferido para outro operador.\n\n` +
                `✅ Você não precisa mais atender esse cliente.`
            );
        }

        // Avisa novo técnico
        await client.sendMessage(
            `${novoOperador.numero_whatsapp}@c.us`,
            `🔄 Chamado transferido para você!\n\n` +
            `📌 Número: ${numeroChamado}\n` +
            `👤 Cliente: ${chamado.nome}\n` +
            `🏢 Setor: ${chamado.setor}\n` +
            `🛠 Problema: ${chamado.problema}\n\n` +
            `💬 A partir de agora, tudo que você escrever aqui será enviado diretamente para o cliente.`
        );

        // Avisa cliente
        await client.sendMessage(
            `${chamado.usuario}@c.us`,
            `🔄 Seu atendimento foi transferido.\n\n` +
            `👨‍💻 Agora *${novoOperador.nome}* está cuidando do seu chamado.`
        );

        return message.reply(`✅ Chamado ${numeroChamado} transferido de ${tecnicoAntigoNome || 'ninguém'} para ${novoOperador.nome}!`);
    }



    // =============================================
    // 👨‍💻 EU QUERO (PEGAR CHAMADO) — Admin e Operador
    // =============================================
    if (msgLower === 'eu quero') {

        if (!isOperador) return;

        if (!message.hasQuotedMsg) {
            return message.reply('❌ Responda a mensagem do chamado.');
        }

        const quotedMsg = await message.getQuotedMessage();
        const idMensagem = quotedMsg.id._serialized;

        const [rows] = await db.query(
            'SELECT * FROM chamados WHERE mensagem_grupo_id = ?',
            [idMensagem]
        );

        const chamado = rows[0];

        if (!chamado) return message.reply('❌ Chamado não encontrado.');

        if (chamado.status !== 'aberto') {
            return message.reply('⚠️ Esse chamado já está em andamento.');
        }

        const tecnico = contact.pushname;

        atendimentos[numeroUser] = {
            cliente: chamado.usuario,
            nomeTecnico: tecnico
        };

        atendimentos[chamado.usuario] = {
            tecnico: numeroUser,
            nomeTecnico: tecnico
        };

        await db.query(
            'UPDATE chamados SET status = ?, tecnico_responsavel = ? WHERE id = ?',
            ['em andamento', tecnico, chamado.id]
        );

        // 📊 Sheets
        await sheetAtualizarTecnico(chamado.numero, tecnico);

        await client.sendMessage(
            `${numeroUser}@c.us`,
            `🟢 Atendimento iniciado!\n\n` +
            `📋 Chamado: ${chamado.numero}\n` +
            `👤 Cliente: ${chamado.nome}\n\n` +
            `💬 A partir de agora, tudo que você escrever aqui será enviado diretamente para o cliente.`
        );

        await client.sendMessage(
            `${chamado.usuario}@c.us`,
            `👨‍💻 *${tecnico}* está cuidando do seu chamado.`
        );

        return;
    }


    // =============================================
    // 👨‍💻 TÉCNICO RESPONDENDO CLIENTE
    // =============================================
    if (atendimentos[numeroUser]?.cliente) {

        const cliente = atendimentos[numeroUser].cliente;
        const nomeTecnico = atendimentos[numeroUser].nomeTecnico;

        await client.sendMessage(
            `${cliente}@c.us`,
            `👨‍💻 ${nomeTecnico}:\n\n${msg}`
        );

        return;
    }


    // =============================================
    // 👤 CLIENTE RESPONDENDO TÉCNICO
    // =============================================
    if (atendimentos[numeroUser]?.tecnico) {

        const tecnico = atendimentos[numeroUser].tecnico;

        if (tecnico === ADMIN_ID) {
            console.log(`👤 ${contact.pushname}: ${msg}`);
            return;
        }

        await client.sendMessage(
            `${tecnico}@c.us`,
            `👤 ${contact.pushname}:\n\n${msg}`
        );

        return;
    }


    // =============================================
    // 🚀 INÍCIO — Saudação
    // =============================================
    if (
        msgLower === 'oi' ||
        msgLower === 'olá' ||
        msgLower === 'ola' ||
        msgLower === 'bom dia' ||
        msgLower === 'boa tarde' ||
        msgLower === 'boa noite'
    ) {

        const usuarioSalvo = await buscarUsuario(numeroUser);

        if (usuarioSalvo) {
            session.dados.nome = usuarioSalvo.nome;
            session.dados.setor = usuarioSalvo.setor;
            session.dados.rf = usuarioSalvo.rf;
            session.etapa = 'suporte';

            return message.reply(
                `Olá novamente ${usuarioSalvo.nome} 👋\n\nComo posso te ajudar hoje?`
            );
        }

        session.etapa = 'rf';
        return message.reply('Olá! 👋\n\nDigite seu RF:');
    }


    // =============================================
    // 🪪 RF
    // =============================================
    if (session.etapa === 'rf') {
        session.dados.rf = msg;
        session.etapa = 'nome';
        return message.reply('Digite seu nome:');
    }


    // =============================================
    // 👤 NOME
    // =============================================
    if (session.etapa === 'nome') {
        session.dados.nome = msg;
        session.etapa = 'setor';
        return message.reply('Digite seu setor:');
    }


    // =============================================
    // 🏢 SETOR
    // =============================================
    if (session.etapa === 'setor') {

        session.dados.setor = msg;

        await salvarUsuario(
            numeroUser,
            session.dados.rf,
            session.dados.nome,
            session.dados.setor
        );

        session.etapa = 'suporte';

        return message.reply(
            `Perfeito ${session.dados.nome} (${session.dados.setor}) 👋\n\nComo posso te ajudar hoje?`
        );
    }


    // =============================================
    // 🛠 SUPORTE — Abertura de chamado
    // =============================================
    if (
        session.etapa === 'suporte' &&
        !msgLower.startsWith('status') &&
        !msgLower.startsWith('fechar') &&
        !msgLower.startsWith('atribuir') &&
        msgLower !== 'lista' &&
        msgLower !== 'eu quero'
    ) {

        session.dados.problema = msg;

        const usuarioSalvo = await buscarUsuario(numeroUser);

        if (usuarioSalvo) {

            const numero = await criarChamado(
                numeroUser,
                session.dados.problema,
                session.dados.rf,
                session.dados.nome,
                session.dados.setor
            );

            // 📊 Sheets
            await sheetAdicionarChamado(
                numero,
                session.dados.nome,
                session.dados.rf,
                session.dados.setor,
                session.dados.problema
            );

            const mensagemGrupo = await client.sendMessage(
                BOT_TESTE,
                `📢 NOVO CHAMADO\n\n` +
                `📌 Número: ${numero}\n` +
                `👤 Nome: ${session.dados.nome}\n` +
                `🪪 RF: ${session.dados.rf}\n` +
                `🏢 Setor: ${session.dados.setor}\n` +
                `🛠 Problema: ${session.dados.problema}`
            );

            await db.query(
                'UPDATE chamados SET mensagem_grupo_id = ? WHERE numero = ?',
                [mensagemGrupo.id._serialized, numero]
            );

            session.etapa = 'fim';

            return message.reply(`✅ Chamado aberto!\n📌 ${numero}\n🗣️ Aguardando atendimento...`);
        }
    }


    // =============================================
    // 🏁 FIM
    // =============================================
    if (session.etapa === 'fim') {
        return;
    }

});

client.initialize();