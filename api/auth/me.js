// GET /api/auth/me — Devuelve el usuario autenticado con su perfil, teléfono y cuota, o user:null si no hay sesión.
const { hasDb, query } = require('../_db');
const { handleCors, getSessionUser, quotaOf, ipHash } = require('../_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (!handleCors(req, res, 'GET, OPTIONS')) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Método no permitido, usa GET.' });
  }

  if (!hasDb()) {
    return res.status(200).json({ db: false, user: null, quota: { used: 0, limit: 3, promo: false } });
  }

  try {
    const user = await getSessionUser(req);
    if (user) {
      return res.status(200).json({
        db: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          is_admin: !!user.is_admin,
          username: user.username || null,
          bio: user.bio || null,
          website: user.website || null,
          avatar: user.avatar || null,
          phone: user.phone || null,
          phone_verified: !!user.phone_verified
        },
        quota: quotaOf(user)
      });
    }
    const anon = await query('SELECT count FROM anon_usage WHERE ip_hash = $1', [ipHash(req)]);
    const used = (anon.rows[0] && anon.rows[0].count) || 0;
    return res.status(200).json({ db: true, user: null, quota: { used, limit: 3, promo: false } });
  } catch (e) {
    if (e.code === 'NO_DB') {
      return res.status(200).json({ db: false, user: null, quota: { used: 0, limit: 3, promo: false } });
    }
    console.error('me error:', e.message);
    return res.status(500).json({ error: 'No se pudo leer la sesión.' });
  }
};
