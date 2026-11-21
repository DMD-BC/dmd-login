// POST /api/auth/phone-otp/verify — Verifica el código SMS de 6 dígitos y marca users.phone_verified = true.
// Body: { phone, code }.
const { hasDb, query } = require('../../_db');
const {
  handleCors,
  normalizePhone,
  scryptVerify,
  readBody,
  ipHash,
  bucketHash,
  checkRateLimit,
  resetRateLimit,
  noDb
} = require('../../_auth');

const MAX_VERIFY_ATTEMPTS = 5;
const VERIFY_WINDOW_SEC = 15 * 60;
const MAX_VERIFY_PER_PHONE_WINDOW = 10;
const MAX_VERIFY_PER_IP_WINDOW = 25;

const GENERIC_INVALID_MSG = 'El código no es válido o caducó. Solicita uno nuevo.';
const GENERIC_TOO_MANY_MSG = 'Demasiados intentos fallidos. Solicita un código nuevo.';

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
  const phone = normalizePhone(body.phone);
  const code = String(body.code || '').replace(/\s+/g, '');

  if (!phone) {
    return res.status(400).json({
      error: 'Escribe un número de teléfono válido: 10 dígitos (por ejemplo 5512345678) o en formato internacional, por ejemplo +525512345678.'
    });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: GENERIC_INVALID_MSG });
  }

  try {
    const ipBucket = 'phone_verify_ip:' + ipHash(req);
    const phoneBucket = bucketHash('phone_verify_num', phone);

    const ipLimit = await checkRateLimit(ipBucket, MAX_VERIFY_PER_IP_WINDOW, VERIFY_WINDOW_SEC);
    if (!ipLimit.allowed) {
      res.setHeader('Retry-After', String(ipLimit.retryAfterSec));
      return res.status(429).json({ error: GENERIC_TOO_MANY_MSG });
    }

    const phoneLimit = await checkRateLimit(phoneBucket, MAX_VERIFY_PER_PHONE_WINDOW, VERIFY_WINDOW_SEC);
    if (!phoneLimit.allowed) {
      res.setHeader('Retry-After', String(phoneLimit.retryAfterSec));
      return res.status(429).json({ error: GENERIC_TOO_MANY_MSG });
    }

    const found = await query(
      'SELECT id, code_hash, attempts, expires_at FROM phone_otp_codes WHERE phone = $1 AND used = FALSE ORDER BY created_at DESC LIMIT 1',
      [phone]
    );
    const row = found.rows[0];
    if (!row) {
      return res.status(400).json({ error: GENERIC_INVALID_MSG });
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await query('UPDATE phone_otp_codes SET used = TRUE WHERE id = $1', [row.id]);
      return res.status(400).json({ error: GENERIC_INVALID_MSG });
    }

    if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
      await query('UPDATE phone_otp_codes SET used = TRUE WHERE id = $1', [row.id]);
      return res.status(429).json({ error: GENERIC_TOO_MANY_MSG });
    }

    const valid = scryptVerify(code, row.code_hash);
    if (!valid) {
      const nextAttempts = row.attempts + 1;
      const exhausted = nextAttempts >= MAX_VERIFY_ATTEMPTS;
      await query(
        'UPDATE phone_otp_codes SET attempts = $1, used = $2 WHERE id = $3',
        [nextAttempts, exhausted, row.id]
      );
      if (exhausted) {
        return res.status(429).json({ error: GENERIC_TOO_MANY_MSG });
      }
      return res.status(400).json({ error: GENERIC_INVALID_MSG });
    }

    // Consumir atómicamente el código
    const consumed = await query(
      'UPDATE phone_otp_codes SET used = TRUE WHERE id = $1 AND used = FALSE RETURNING id',
      [row.id]
    );
    if (!consumed.rows.length) {
      return res.status(400).json({ error: GENERIC_INVALID_MSG });
    }

    await query(
      'UPDATE users SET phone_verified = TRUE WHERE phone = $1',
      [phone]
    );

    await resetRateLimit(phoneBucket);

    return res.status(200).json({
      ok: true,
      verified: true
    });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    console.error('phone-otp verify error:', e.message);
    return res.status(500).json({ error: 'No se pudo verificar el código en este momento.' });
  }
};
