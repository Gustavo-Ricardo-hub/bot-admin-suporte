const mysql = require('mysql2/promise');
const { google } = require('googleapis');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

const SPREADSHEET_ID = '18N3FMJ6wtH1HHGpOB7YSvtevXutCcvWK3H4DZuBIFXo';

const auth = new google.auth.GoogleAuth({
    keyFile: 'bot-visualizar-eb624aabca80.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

async function migrar() {

    console.log('🔄 Iniciando migração...');

    const [chamados] = await db.query(
        'SELECT * FROM chamados ORDER BY id ASC'
    );

    if (chamados.length === 0) {
        console.log('📭 Nenhum chamado encontrado no banco.');
        process.exit(0);
    }

    console.log(`📋 ${chamados.length} chamados encontrados.`);

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Limpa dados mantendo cabeçalho
    await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet2!A2:I'
    });

    console.log('🧹 Planilha limpa. Inserindo dados...');

    const linhas = chamados.map(c => {

        const dataAbertura = c.data_abertura
            ? new Date(c.data_abertura).toLocaleString('pt-BR')
            : '';

        const dataFechamento = c.data_fechamento
            ? new Date(c.data_fechamento).toLocaleString('pt-BR')
            : '';

        return [
            c.numero               || '',
            c.nome                 || '',
            c.rf                   || '',
            c.setor                || '',
            c.problema             || '',
            c.status               || '',
            c.tecnico_responsavel  || '',
            dataAbertura,
            dataFechamento
        ];
    });

    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet2!A2:I',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: linhas }
    });

    console.log(`✅ ${linhas.length} chamados migrados com sucesso!`);

    process.exit(0);
}

migrar().catch(err => {
    console.error('❌ Erro na migração:', err.message);
    process.exit(1);
});