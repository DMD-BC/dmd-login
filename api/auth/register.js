// POST /api/auth/register — Crea cuenta en Postgres con contraseña mínimo 6 caracteres,
// teléfono opcional E.164 (sin verificar), CORS centralizado y límite de registros por IP.
const crypto = require('crypto');
const { hasDb, query } = require('../_db');
const {
  handleCors,
  normalizePhone,
  scryptHash,
  createSession,
  setSessionCookie,
  readBody,
  quotaOf,
  ipHash,
  checkRateLimit,
  noDb
} = require('../_auth');

const REGISTER_WINDOW_SEC = 60 * 60;
const MAX_REGISTERS_PER_IP = 8;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (!handleCors(req, res, 'POST, OPTIONS')) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Método no permitido, usa POST.' });
  }
  if (!hasDb()) return noDb(res);

  const body = readBody(req);
  const name = String(body.name || '').replace(/\s+/g, ' ').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const hasPhone = body.phone !== undefined && body.phone !== null && String(body.phone).trim() !== '';
  const phone = hasPhone ? normalizePhone(body.phone) : null;

  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: 'Escribe tu nombre (entre 2 y 60 caracteres).' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180) {
    return res.status(400).json({ error: 'Ese correo no se ve válido.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña necesita al menos 6 caracteres.' });
  }
  if (hasPhone && !phone) {
    return res.status(400).json({
      error: 'Escribe un número de teléfono válido: 10 dígitos (por ejemplo 5512345678) o en formato internacional, por ejemplo +525512345678.'
    });
  }

  try {
    const ipLimit = await checkRateLimit('reg_ip:' + ipHash(req), MAX_REGISTERS_PER_IP, REGISTER_WINDOW_SEC);
    if (!ipLimit.allowed) {
      res.setHeader('Retry-After', String(ipLimit.retryAfterSec));
      return res.status(429).json({
        error: 'Demasiados intentos de registro desde esta conexión. Inténtalo más tarde.'
      });
    }

    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Ese correo ya tiene cuenta. Inicia sesión.' });
    }

    if (phone) {
      const existingPhone = await query('SELECT id FROM users WHERE phone = $1 LIMIT 1', [phone]);
      if (existingPhone.rows.length) {
        return res.status(409).json({ error: 'Ese número de teléfono ya está en uso por otra cuenta.' });
      }
    }

    const id = crypto.randomUUID();
    await query(
      'INSERT INTO users (id, name, email, pass_hash, promo, used_count, phone, phone_verified) VALUES ($1, $2, $3, $4, FALSE, 0, $5, FALSE)',
      [id, name, email, scryptHash(password), phone]
    );

    const token = await createSession(id);
    setSessionCookie(res, token, req);
    const user = { id, name, email, promo: false, used_count: 0, is_admin: false };

    return res.status(201).json({
      ok: true,
      db: true,
      user: {
        id,
        name,
        email,
        is_admin: false,
        phone: phone || null,
        phone_verified: false
      },
      quota: quotaOf(user),
      projects: []
    });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    if (e.code === '23505') {
      if (e.constraint === 'users_phone_unique') {
        return res.status(409).json({ error: 'Ese número de teléfono ya está en uso por otra cuenta.' });
      }
      return res.status(409).json({ error: 'Ese correo ya tiene cuenta. Inicia sesión.' });
    }
    console.error('register error:', e.message);
    return res.status(500).json({ error: 'No se pudo crear la cuenta, inténtalo de nuevo.' });
  }
};
