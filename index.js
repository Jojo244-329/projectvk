const express = require('express');
const cors = require('cors');
const axios = require('axios');
const serverless = require('serverless-http');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 Chaves fixas (usa dotenv se quiser esconder)
const SK = 'sk_aaoqHMfn_-OgE3YAnvfYRNMd8B7Xvro1QZ-srW01iQaUy5bW';
const PK = 'pk_Pm6JkrynSf5RbMo1BxVQZqdRkgpENANFzxOr3PbhVPbncLtV';
const AUTH_HEADER = {
  'Authorization': `Basic ${Buffer.from(`${SK}:${PK}`).toString('base64')}`,
  'Content-Type': 'application/json'
};

// 📌 Geração do Pix (HydraHub)
app.post('/api/gerar-pix', async (req, res) => {
  try {
    const { nome, cpf, email, telefone, amount } = req.body;

    if (!nome || !cpf || !email || !telefone || !amount) {
      console.log('❌ Dados incompletos:', req.body);
      return res.status(400).json({ error: 'Dados incompletos ou valor ausente' });
    }

    const parsedAmount = parseInt(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const payload = {
      paymentMethod: 'pix',
      ip: '127.0.0.1',
      pix: { expiresInDays: 1 },
      items: [{
        title: `Doação ${nome}`,
        unitPrice: parsedAmount,
        quantity: 1,
        tangible: false
      }],
      amount: parsedAmount,
      externalRef: `pedido-${uuidv4()}`,
      customer: {
        name: nome,
        email,
        phone: telefone,
        document: {
          type: 'cpf',
          number: cpf
        }
      },
      postbackUrl: 'http://vakinhaa.online',
      traceable: true,
      metadata: JSON.stringify({ origem: 'site oficial', campanha: 'cnu2025' })
    };

    console.log('📡 Enviando transação para HydraHub:\n', JSON.stringify(payload, null, 2));

    const response = await axios.post(
      'https://api.versopayments.com/api/v1/transactions',
      payload,
      { headers: AUTH_HEADER }
    );

    console.log('✅ Resposta completa HydraHub:\n', JSON.stringify(response.data, null, 2));

    const qrcodeText = response.data?.data?.pix?.qrcode;
    if (!qrcodeText) {
      console.log('❌ QR code text ausente!');
      return res.status(500).json({ error: 'QR Code texto ausente' });
    }

    const qrcodeBase64 = await QRCode.toDataURL(qrcodeText);

    const retorno = {
      nome,
      email,
      telefone,
      qrcode: qrcodeBase64,
      qrcodeText,
      amount: parsedAmount
    };

    console.log('📦 Retorno ao front:\n', JSON.stringify(retorno, null, 2));
    res.status(200).json(retorno);

  } catch (err) {
    console.error('🔥 ERRO AO GERAR PIX:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'Erro na transação HydraHub' });
  }
});

// 📩 Webhook Pix
app.post('/api/webhook-pix', (req, res) => {
  console.log('📩 Webhook recebido:', JSON.stringify(req.body, null, 2));

  const status = req.body.data?.status;
  const transactionId = req.body.objectId;

  if (status === 'paid') {
    console.log(`💰 Pagamento CONFIRMADO! Transação ID: ${transactionId}`);
    // Aqui você salva no banco, envia e-mail, ativa curso, etc.
  }

  res.sendStatus(200);
});

// ⚠️ Para server local (dev)
// app.listen(3333, () => console.log("🔥 Rodando local em http://localhost:3333"));

// 👇 Para Vercel ou ambientes serverless
module.exports = app;
module.exports.handler = serverless(app);
