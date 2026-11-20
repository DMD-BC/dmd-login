// POST /api/auth/reset-password — Consume el token de restablecimiento y actualiza la contraseña.
// Body: { token, password }.
// - Verifica <id>.<secret> contra password_resets (scryptVerify, expiración 1 hora, un solo uso).
// - Actualiza users.pass_hash con scryptHash, marca el token como usado, invalida sesiones previas
//   y abre una sesión limpia en cookie httpOnly.
const { hasDb, query } = require('../_db');
const {
  handleCors,
  scryptHash,
  scryptVerify,
  createSession,
  setSessionCookie,
  readBody,
  quotaOf,
  ipHash,
  checkRateLimit,
  noDb
} = require('../_auth');

const RESET_CONSUME_WINDOW_SEC = 15 * 60;
const MAX_CONSUME_ATTEMPTS_PER_IP = 15;

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
  const rawToken = String(body.token || '').trim();
  const password = String(body.password || '');

  if (!rawToken || !rawToken.includes('.')) {
    return res.status(400).json({ error: 'El enlace de recuperación no es válido.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  const dotIdx = rawToken.indexOf('.');
  const resetId = rawToken.slice(0, dotIdx);
  const secret = rawToken.slice(dotIdx + 1);
  if (!resetId || !secret) {
    return res.status(400).json({ error: 'El enlace de recuperación no es válido.' });
  }

  try {
    const ipLimit = await checkRateLimit('reset_ip:' + ipHash(req), MAX_CONSUME_ATTEMPTS_PER_IP, RESET_CONSUME_WINDOW_SEC);
    if (!ipLimit.allowed) {
      res.setHeader('Retry-After', String(ipLimit.retryAfterSec));
      return res.status(429).json({
        error: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.'
      });
    }

    const found = await query(
      'SELECT id, user_id, token_hash, used, expires_at FROM password_resets WHERE id = $1 LIMIT 1',
      [resetId]
    );
    const row = found.rows[0];
    if (!row || row.used) {
      return res.status(400).json({ error: 'Este enlace ya fue usado o no es válido. Solicita uno nuevo.' });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await query('UPDATE password_resets SET used = TRUE WHERE id = $1', [row.id]);
      return res.status(400).json({ error: 'El enlace caducó. Solicita uno nuevo.' });
    }
    if (!scryptVerify(secret, row.token_hash)) {
      return res.status(400).json({ error: 'El enlace de recuperación no es válido.' });
    }

    const newPassHash = scryptHash(password);

    // Consumir atómicamente el token (evita condición de carrera si se envía dos veces a la vez)
    const consumed = await query(
      'UPDATE password_resets SET used = TRUE WHERE id = $1 AND used = FALSE RETURNING user_id',
      [row.id]
    );
    if (!consumed.rows.length) {
      return res.status(400).json({ error: 'Este enlace ya fue usado. Solicita uno nuevo.' });
    }

    // Actualizar contraseña e invalidar cualquier sesión anterior por seguridad
    await query('UPDATE users SET pass_hash = $1 WHERE id = $2', [newPassHash, row.user_id]);
    await query('DELETE FROM sessions WHERE user_id = $1', [row.user_id]);

    const userRes = await query(
      'SELECT id, name, email, promo, used_count, is_admin FROM users WHERE id = $1 LIMIT 1',
      [row.user_id]
    );
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'No se encontró la cuenta asociada.' });
    }

    const sessionToken = await createSession(user.id);
    setSessionCookie(res, sessionToken, req);

    return res.status(200).json({
      ok: true,
      db: true,
      user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin },
      quota: quotaOf(user)
    });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    console.error('reset-password error:', e.message);
    return res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
};
