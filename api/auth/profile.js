// PUT /api/auth/profile — Actualiza perfil del usuario autenticado (name, username, bio, website, avatar).
// Requiere sesión activa (401 sin sesión).
const { hasDb, query } = require('../_db');
const {
  handleCors,
  getSessionUser,
  readBody,
  quotaOf,
  noDb
} = require('../_auth');

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function formatUserResponse(user) {
  return {
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
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (!handleCors(req, res, 'PUT, OPTIONS')) return;

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Método no permitido, usa PUT.' });
  }
  if (!hasDb()) return noDb(res);

  try {
    const currentUser = await getSessionUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Inicia sesión para actualizar tu perfil.' });
    }

    const body = readBody(req);
    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = String(body.name === null ? '' : body.name).replace(/\s+/g, ' ').trim();
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ error: 'El nombre debe tener entre 2 y 60 caracteres.' });
      }
      params.push(name);
      updates.push(`name = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'username')) {
      const rawUsername = body.username === null ? '' : String(body.username).trim();
      if (rawUsername === '') {
        params.push(null);
        updates.push(`username = $${params.length}`);
      } else {
        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(rawUsername)) {
          return res.status(400).json({
            error: 'El nombre de usuario debe tener entre 3 y 30 caracteres y solo usar letras, números, punto o guion bajo.'
          });
        }
        const conflict = await query(
          'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1',
          [rawUsername, currentUser.id]
        );
        if (conflict.rows.length) {
          return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso. Elige otro.' });
        }
        params.push(rawUsername);
        updates.push(`username = $${params.length}`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
      const bio = body.bio === null ? '' : String(body.bio).trim();
      if (bio.length > 180) {
        return res.status(400).json({ error: 'La biografía no puede superar los 180 caracteres.' });
      }
      params.push(bio === '' ? null : bio);
      updates.push(`bio = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'website')) {
      const website = body.website === null ? '' : String(body.website).trim();
      if (website === '') {
        params.push(null);
        updates.push(`website = $${params.length}`);
      } else {
        if (website.length > 200 || !isValidHttpUrl(website)) {
          return res.status(400).json({
            error: 'El sitio web debe empezar con http:// o https:// y tener máximo 200 caracteres.'
          });
        }
        params.push(website);
        updates.push(`website = $${params.length}`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'avatar')) {
      const avatar = body.avatar === null ? '' : String(body.avatar).trim();
      if (avatar.length > 200000) {
        return res.status(400).json({ error: 'La imagen de avatar no puede superar los 200000 caracteres.' });
      }
      params.push(avatar === '' ? null : avatar);
      updates.push(`avatar = $${params.length}`);
    }

    if (!updates.length) {
      return res.status(200).json({
        ok: true,
        db: true,
        user: formatUserResponse(currentUser),
        quota: quotaOf(currentUser)
      });
    }

    params.push(currentUser.id);
    const updated = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} ` +
      'RETURNING id, name, email, promo, used_count, is_admin, phone, phone_verified, username, bio, website, avatar',
      params
    );

    const updatedUser = updated.rows[0] || currentUser;

    return res.status(200).json({
      ok: true,
      db: true,
      user: formatUserResponse(updatedUser),
      quota: quotaOf(updatedUser)
    });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso. Elige otro.' });
    }
    console.error('profile update error:', e.message);
    return res.status(500).json({ error: 'No se pudo actualizar tu perfil en este momento.' });
  }
};
