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
    try {
        const { amount, email, name, product } = req.body;

        const body = {
            transaction_amount: Number(amount),
            description: `Produto: ${product || 'Geral'} - Cliente: ${name || 'N/A'}`,
            payment_method_id: 'pix',
            payer: {
                email: email || 'test_user_123@testuser.com',
                first_name: name || 'Cliente',
            },
            metadata: {
                product_name: product,
                customer_name: name
            }
        };

        const result = await payment.create({ body });

        res.json({
            id: result.id,
            qr_code: result.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
            status: result.status
        });
    } catch (error) {
        console.error('Erro ao criar pagamento:', error);
        res.status(500).json({ error: 'Erro ao processar pagamento' });
    }
});

// Rota Webhook para notificações
app.post('/webhook', async (req, res) => {
    const { action, data } = req.body;

    if (action === 'payment.updated' || req.query.type === 'payment') {
        const paymentId = data?.id || req.query['data.id'];

        try {
            const paymentInfo = await payment.get({ id: paymentId });

            if (paymentInfo.status === 'approved') {
                const userEmail = paymentInfo.payer.email;
                const amount = paymentInfo.transaction_amount;
                const name = paymentInfo.metadata?.customer_name || 'Cliente';
                const product = paymentInfo.metadata?.product_name || 'Produto';

                console.log(`Pagamento ${paymentId} aprovado! Enviando e-mail para ${userEmail}...`);

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
            }
        } catch (error) {
            console.error('Erro no processamento do Webhook:', error);
        }
    }

    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
