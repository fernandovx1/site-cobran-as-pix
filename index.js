const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { MercadoPagoConfig, Payment } = require('mercadopago');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração Mercado Pago
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const payment = new Payment(client);

// Configuração Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail', // Ou seu provedor
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Rota para criar pagamento Pix
app.post('/create-payment', async (req, res) => {
    const { amount, email, name, product, cpf } = req.body;
    console.log(`[PIX] Iniciando criação de pagamento: R$ ${amount} - Cliente: ${name} (${email || 'sem email'})`);

    try {
        const body = {
            transaction_amount: Number(amount),
            description: `Produto: ${product || 'Geral'} - Cliente: ${name || 'N/A'}`,
            payment_method_id: 'pix',
            payer: {
                email: email || 'fernandolima350@gmail.com',
                first_name: name || 'Fernando',
                identification: {
                    type: 'CPF',
                    number: cpf ? cpf.replace(/\D/g, '') : '43741961884'
                }
            },
            metadata: {
                product_name: product,
                customer_name: name
            }
        };

        const result = await payment.create({ body });
        console.log(`[PIX] Sucesso! Pagamento ID: ${result.id} - Status: ${result.status} - Detalhe: ${result.status_detail || 'n/a'}`);

        res.json({
            id: result.id,
            qr_code: result.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
            status: result.status,
            status_detail: result.status_detail
        });
    } catch (error) {
        console.error('[PIX] Erro ao criar pagamento no Mercado Pago:');
        if (error.message) console.error(`Mensagem: ${error.message}`);
        if (error.cause) console.error('Causa:', JSON.stringify(error.cause, null, 2));
        
        res.status(500).json({ error: 'Erro ao processar pagamento', details: error.message });
    }
});

// Rota para consultar status do pagamento (Polling)
app.get('/check-payment/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const paymentInfo = await payment.get({ id });
        res.json({ status: paymentInfo.status });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao consultar pagamento' });
    }
});

// Rota Webhook para notificações
app.post('/webhook', async (req, res) => {
    const { action, data } = req.body;
    const type = req.query.type;
    const paymentId = data?.id || req.query['data.id'];

    console.log(`[WEBHOOK] Notificação recebida! Ação: ${action || 'n/a'} - Tipo: ${type || 'n/a'} - ID: ${paymentId}`);

    if (action === 'payment.updated' || type === 'payment') {
        try {
            const paymentInfo = await payment.get({ id: paymentId });
            console.log(`[WEBHOOK] Status do Pagamento ${paymentId}: ${paymentInfo.status}`);

            if (paymentInfo.status === 'approved') {
                const userEmail = paymentInfo.payer.email;
                const amount = paymentInfo.transaction_amount;
                const name = paymentInfo.metadata?.customer_name || 'Cliente';
                const product = paymentInfo.metadata?.product_name || 'Produto';

                console.log(`[WEBHOOK] Pagamento APROVADO! Enviando e-mail para ${userEmail}...`);
                
                // Enviar e-mail de confirmação
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: userEmail,
                    subject: 'Confirmação de Pagamento Pix - Luana Menato',
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                            <h2 style="color: #0047FF;">Olá, ${name}!</h2>
                            <p>Seu pagamento para o produto <strong>${product}</strong> no valor de <strong>R$ ${amount.toFixed(2)}</strong> foi recebido com sucesso.</p>
                            <p>Obrigado por sua compra!</p>
                            <hr style="border: 0; border-top: 1px solid #eee;">
                            <p style="font-size: 12px; color: #888;">Este é um e-mail automático, por favor não responda.</p>
                        </div>
                    `
                };

                await transporter.sendMail(mailOptions);
                console.log(`[WEBHOOK] E-mail enviado com sucesso para ${userEmail}`);
            }
        } catch (error) {
            console.error('[WEBHOOK] Erro ao processar notificação:', error.message || error);
        }
    }

    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
