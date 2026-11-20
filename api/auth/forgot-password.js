// POST /api/auth/forgot-password — Solicita restablecimiento de contraseña por correo.
// - No enumera cuentas: siempre responde 200 con mensaje genérico si el correo tiene formato válido.
// - Token compuesto <id>.<secret> con expiración de 1 hora; <secret> se almacena hasheado con scrypt.
// - Límite de intentos por correo e IP. Sin SMTP configurado -> 503.
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { hasDb, query } = require('../_db');
const {
  handleCors,
  scryptHash,
  readBody,
  ipHash,
  checkRateLimit,
  noDb
} = require('../_auth');

const RESET_TTL_MIN = 60; // 1 hora
const COOLDOWN_SEC = 45;
const MAX_REQUESTS_PER_HOUR = 6;

function getTransporter() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === '1' || port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 180;
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

  const transporter = getTransporter();
  if (!transporter) {
    return res.status(503).json({
      reset: false,
      error: 'Recuperación de contraseña por correo no configurada (faltan SMTP_HOST, SMTP_USER o SMTP_PASS en Vercel).'
    });
  }

  const body = readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
  }

  try {
    const ip = ipHash(req);

    // Enfriamiento por correo para evitar spam
    const recent = await query(
      "SELECT created_at FROM password_resets WHERE LOWER(email) = $1 AND created_at > NOW() - ($2 || ' seconds')::interval ORDER BY created_at DESC LIMIT 1",
      [email, String(COOLDOWN_SEC)]
    );
    if (recent.rows.length) {
      return res.status(429).json({
        error: `Espera ${COOLDOWN_SEC} segundos antes de solicitar otro enlace.`
      });
    }

    // Límite por hora por IP
    const ipLimit = await checkRateLimit('forgot_ip:' + ip, MAX_REQUESTS_PER_HOUR, 3600);
    if (!ipLimit.allowed) {
      res.setHeader('Retry-After', String(ipLimit.retryAfterSec));
      return res.status(429).json({
        error: 'Demasiadas solicitudes de recuperación. Inténtalo de nuevo en una hora.'
      });
    }

    const found = await query(
      'SELECT id, name, email FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );
    const user = found.rows[0];

    if (user) {
      // Invalidar tokens previos no usados del mismo usuario
      await query(
        'UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE',
        [user.id]
      );

      const id = crypto.randomUUID();
      const secret = crypto.randomBytes(32).toString('base64url');
      const tokenHash = scryptHash(secret);
      const rawToken = `${id}.${secret}`;
      const expires = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);

      await query(
        'INSERT INTO password_resets (id, user_id, email, token_hash, ip_hash, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, user.id, email, tokenHash, ip, expires.toISOString()]
      );

      const portalBase = String(process.env.SSO_PORTAL_URL || 'https://login.dmdmx.dev').replace(/\/+$/, '');
      const resetUrl = `${portalBase}/?reset_token=${encodeURIComponent(rawToken)}`;
      const from = String(process.env.SMTP_FROM || process.env.SMTP_USER).trim();

      await transporter.sendMail({
        from: `"DMD" <${from}>`,
        to: email,
        subject: 'Restablece tu contraseña en DMD',
        text: `Hola ${user.name || ''},\n\nRecibimos una solicitud para restablecer tu contraseña en DMD.\nAbre este enlace para crear una nueva contraseña (caduca en 1 hora):\n\n${resetUrl}\n\nSi no solicitaste este cambio, ignora este mensaje.`,
        html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#111">
          <h2 style="margin:0 0 12px;font-size:18px">Restablecer contraseña — DMD</h2>
          <p style="margin:0 0 16px;font-size:14px;color:#444">Recibimos una solicitud para cambiar la contraseña de tu cuenta. El enlace caduca en <strong>1 hora</strong>.</p>
          <p style="margin:0 0 20px">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#0f5c4d;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Crear nueva contraseña</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#666">Si el botón no abre, copia y pega esta dirección en tu navegador:</p>
          <p style="margin:0 0 16px;font-size:12px;word-break:break-all;color:#0f5c4d">${resetUrl}</p>
          <p style="margin:0;font-size:12px;color:#777">Si no solicitaste este cambio, ignora este mensaje.</p>
        </div>`
      });
    }

    // Respuesta idéntica exista o no el correo (sin enumeración de cuentas)
    return res.status(200).json({
      ok: true,
      message: 'Si ese correo está registrado, recibirás instrucciones para restablecer tu contraseña.'
    });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    console.error('forgot-password error:', e.message);
    return res.status(500).json({ error: 'No se pudo procesar la recuperación de contraseña.' });
  }
};
