// POST /api/auth/phone-otp/send — Envía código SMS de 6 dígitos por Twilio.
// Body: { phone }. Formato E.164 (^\+[1-9]\d{7,14}$).
// Sin enumeración de cuentas: responde ok:true aunque el número no esté registrado,
// generando código y enviando SMS solo cuando pertenece a una cuenta existente.
const crypto = require('crypto');
const { hasDb, query } = require('../../_db');
const {
  handleCors,
  normalizePhone,
  scryptHash,
  readBody,
  ipHash,
  checkRateLimit,
  noDb
} = require('../../_auth');

const PHONE_OTP_TTL_MIN = 10;
const SEND_COOLDOWN_SEC = 45;
const MAX_SENDS_PER_HOUR = 6;

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function getTwilioConfig() {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const fromNumber = String(process.env.TWILIO_FROM_NUMBER || '').trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

async function sendTwilioSms(cfg, toPhone, bodyText) {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;
  const authHeader = 'Basic ' + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const form = new URLSearchParams();
  form.set('To', toPhone);
  form.set('From', cfg.fromNumber);
  form.set('Body', bodyText);

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    const err = new Error(`Twilio error ${resp.status}: ${errText.slice(0, 180)}`);
    err.status = resp.status;
    throw err;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (!handleCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Método no permitido, usa POST.' });
  }
  if (!hasDb()) return noDb(res);

  const twilioCfg = getTwilioConfig();
  if (!twilioCfg) {
    return res.status(503).json({
      sms: false,
      error: 'Envío de SMS no configurado en el servidor (faltan credenciales de Twilio en Vercel).'
    });
  }

  const body = readBody(req);
  const phone = normalizePhone(body.phone);
  if (!phone) {
    return res.status(400).json({
      error: 'Escribe un número de teléfono válido: 10 dígitos (por ejemplo 5512345678) o en formato internacional, por ejemplo +525512345678.'
    });
  }

  try {
    const ip = ipHash(req);

    // Enfriamiento de 45 segundos por teléfono
    const recent = await query(
      "SELECT EXTRACT(EPOCH FROM (created_at + ($2 || ' seconds')::interval - NOW()))::int AS retry_after " +
      "FROM phone_otp_codes WHERE phone = $1 AND created_at > NOW() - ($2 || ' seconds')::interval " +
      "ORDER BY created_at DESC LIMIT 1",
      [phone, String(SEND_COOLDOWN_SEC)]
    );
    if (recent.rows.length) {
      const retryAfter = Math.max(1, recent.rows[0].retry_after || SEND_COOLDOWN_SEC);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Espera ${SEND_COOLDOWN_SEC} segundos antes de pedir otro código.`
      });
    }

    // Máximo 6 envíos por hora por teléfono o IP en phone_otp_codes
    const hourly = await query(
      "SELECT COUNT(*)::int AS n FROM phone_otp_codes WHERE (phone = $1 OR ip_hash = $2) AND created_at > NOW() - INTERVAL '1 hour'",
      [phone, ip]
    );
    if ((hourly.rows[0] && hourly.rows[0].n) >= MAX_SENDS_PER_HOUR) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({
        error: 'Demasiados códigos solicitados. Inténtalo de nuevo en una hora.'
      });
    }

    // Límite global por IP en auth_rate_limits (cubre también intentos sobre números no registrados)
    const ipLimit = await checkRateLimit('phone_otp_send_ip:' + ip, MAX_SENDS_PER_HOUR * 2, 3600);
    if (!ipLimit.allowed) {
      res.setHeader('Retry-After', String(ipLimit.retryAfterSec));
      return res.status(429).json({
        error: 'Demasiados códigos solicitados desde esta conexión. Inténtalo más tarde.'
      });
    }

    // Buscar cuenta asociada sin enumerar si no existe
    const foundUser = await query(
      'SELECT id FROM users WHERE phone = $1 LIMIT 1',
      [phone]
    );

    if (foundUser.rows.length) {
      await query(
        'UPDATE phone_otp_codes SET used = TRUE WHERE phone = $1 AND used = FALSE',
        [phone]
      );

      const code = generateOtpCode();
      const id = crypto.randomUUID();
      const codeHash = scryptHash(code);
      const expires = new Date(Date.now() + PHONE_OTP_TTL_MIN * 60 * 1000);

      await query(
        'INSERT INTO phone_otp_codes (id, phone, code_hash, ip_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [id, phone, codeHash, ip, expires.toISOString()]
      );

      await sendTwilioSms(
        twilioCfg,
        phone,
        `Tu código de verificación en DMD es: ${code}. Caduca en ${PHONE_OTP_TTL_MIN} minutos.`
      );
    }

    return res.status(200).json({
      ok: true,
      sent: true,
      expiresIn: PHONE_OTP_TTL_MIN * 60
    });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    console.error('phone-otp send error:', e.message);
    return res.status(500).json({ error: 'No se pudo enviar el código por SMS en este momento.' });
  }
};
