// POST /api/auth/otp — Código de acceso (OTP) por correo, REAL y del servidor.
// Body: { action: "send" | "verify", email, code? }.
// - send: genera un código de 6 dígitos, lo guarda con hash scrypt en la DB
//   (nunca en claro, nunca se devuelve al cliente) y lo manda por correo con
//   SMTP (Zoho). El código vive 10 minutos. Máx 5 envíos por hora y correo,
//   10 por hora y IP. Si el correo no es de una cuenta registrada, responde
//   igual que si lo fuera (sin enumerar cuentas) pero no manda nada.
// - verify: comprueba el código (máx 5 intentos), lo marca usado y crea la
//   sesión httpOnly igual que /api/auth/login.
// - Sin SMTP configurado (SMTP_HOST/SMTP_USER/SMTP_PASS en Vercel) -> 503
//   claro, sin crear códigos. Sin DATABASE_URL -> 503 db:false.
// El frontend lo usa dmd-auth.js (window.handleSendOtp / handleVerifyOtp
// reales). El OTP simulado de www/script.js queda solo como respaldo en
// www, donde no hay backend.
const crypto = require('crypto');
const { hasDb, query } = require('../_db');
const {
  handleCors, scryptHash, scryptVerify, createSession, setSessionCookie,
  readBody, quotaOf, ipHash, noDb
} = require('../_auth');

const CODE_TTL_SECONDS = 600; // 10 minutos
const MAX_SENDS_PER_EMAIL_HOUR = 5;
const MAX_SENDS_PER_IP_HOUR = 10;
const MAX_VERIFY_ATTEMPTS = 5;

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function mailer() {
  const nodemailer = require('nodemailer');
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function handleSend(req, res, email) {
  // Límite por correo y por IP (sin revelar cuál se alcanzó).
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const byEmail = await query(
    'SELECT COUNT(*)::int AS n FROM otp_codes WHERE LOWER(email) = $1 AND created_at > $2',
    [email, hourAgo]
  );
  const byIp = await query(
    'SELECT COUNT(*)::int AS n FROM otp_codes WHERE ip_hash = $1 AND created_at > $2',
    [ipHash(req), hourAgo]
  );
  if (byEmail.rows[0].n >= MAX_SENDS_PER_EMAIL_HOUR || byIp.rows[0].n >= MAX_SENDS_PER_IP_HOUR) {
    return res.status(429).json({ error: 'Demasiados códigos pedidos, espera un rato e inténtalo de nuevo.' });
  }
  // La cuenta debe existir; si no, respuesta genérica (sin enumerar).
  const found = await query(
    'SELECT id FROM users WHERE LOWER(email) = $1',
    [email]
  );
  if (!found.rows[0]) {
    return res.status(200).json({ ok: true, message: 'Si la cuenta existe, te llegará un código a tu correo.' });
  }
  if (!smtpConfigured()) {
    return res.status(503).json({ error: 'El envío de códigos por correo aún no está configurado en el servidor.' });
  }
  // Invalida códigos anteriores sin usar de este correo.
  await query(
    'UPDATE otp_codes SET used = TRUE WHERE LOWER(email) = $1 AND used = FALSE',
    [email]
  );
  const code = String(crypto.randomInt(100000, 1000000));
  const expires = new Date(Date.now() + CODE_TTL_SECONDS * 1000);
  await query(
    'INSERT INTO otp_codes (id, email, code_hash, ip_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [crypto.randomUUID(), email, scryptHash(code), ipHash(req), expires.toISOString()]
  );
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await mailer().sendMail({
      from: from,
      to: email,
      subject: 'Tu código de acceso DMD',
      text: 'Tu código de acceso a DMD es: ' + code + '\n\nEs válido por 10 minutos. Si tú no lo pediste, ignora este correo.',
      html: '<p>Tu código de acceso a <strong>DMD</strong> es:</p>' +
        '<p style="font-size:28px; font-weight:800; letter-spacing:6px;">' + code + '</p>' +
        '<p>Es válido por 10 minutos. Si tú no lo pediste, ignora este correo.</p>'
    });
  } catch (e) {
    console.error('otp send error:', e.message);
    return res.status(500).json({ error: 'No se pudo enviar el código, inténtalo de nuevo.' });
  }
  return res.status(200).json({ ok: true, expires_in: CODE_TTL_SECONDS });
}

async function handleVerify(req, res, email, code) {
  if (!code || !/^\d{6}$/.test(String(code))) {
    return res.status(400).json({ error: 'Escribe el código de 6 dígitos que te llegó al correo.' });
  }
  const found = await query(
    'SELECT c.id, c.code_hash, c.attempts, c.used, c.expires_at, u.id AS user_id, u.name, u.email, u.promo, u.used_count, u.is_admin ' +
    'FROM otp_codes c JOIN users u ON LOWER(u.email) = LOWER(c.email) ' +
    'WHERE LOWER(c.email) = $1 AND c.used = FALSE ORDER BY c.created_at DESC LIMIT 1',
    [email]
  );
  const row = found.rows[0];
  if (!row) {
    return res.status(401).json({ error: 'Código incorrecto o expirado, pide uno nuevo.' });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [row.id]);
    return res.status(401).json({ error: 'El código expiró, pide uno nuevo.' });
  }
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    await query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [row.id]);
    return res.status(401).json({ error: 'Demasiados intentos, pide un código nuevo.' });
  }
  if (!scryptVerify(String(code), row.code_hash)) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return res.status(401).json({ error: 'Código incorrecto, inténtalo de nuevo.' });
  }
  await query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [row.id]);
  const user = {
    id: row.user_id, name: row.name, email: row.email,
    promo: row.promo, used_count: row.used_count, is_admin: row.is_admin
  };
  const token = await createSession(user.id);
  setSessionCookie(res, token, req);
  return res.status(200).json({
    ok: true, db: true,
    user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin },
    quota: quotaOf(user)
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  // CORS centralizado (mismos orígenes permitidos que el resto de la API).
  if (!handleCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido, usa POST' });
  }
  if (!hasDb()) return noDb(res);
  const body = readBody(req);
  const action = String(body.action || '');
  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
  }
  try {
    if (action === 'send') return await handleSend(req, res, email);
    if (action === 'verify') return await handleVerify(req, res, email, body.code);
    return res.status(400).json({ error: 'Acción no válida, usa send o verify.' });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    console.error('otp error:', e.message);
    return res.status(500).json({ error: 'No se pudo procesar el código, inténtalo de nuevo.' });
  }
};
