// api/_auth.js — Contraseñas, sesiones, CORS centralizado, validación return_to y rate limiting.
const crypto = require('crypto');

const SESSION_COOKIE = 'dmd_session';
const SESSION_DAYS = 30;
const SSO_DOMAIN = '.dmdmx.dev';

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/dmdmx\.dev$/i,
  /^https:\/\/([a-z0-9-]+\.)+dmdmx\.dev$/i,
  /^https:\/\/dmd-rho\.vercel\.app$/i,
  /^http:\/\/localhost:3000$/i
];

function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin.trim()));
}

// Aplica encabezados CORS centralizados y responde preflight OPTIONS.
// Devuelve true si la petición puede continuar; false si ya fue respondida (403 o 204).
function handleCors(req, res, methods) {
  const allowedMethods = methods || 'GET, POST, OPTIONS';
  const origin = req.headers && req.headers.origin;

  if (origin) {
    res.setHeader('Vary', 'Origin');
    if (!isAllowedOrigin(origin)) {
      res.status(403).json({ error: 'Origen no permitido.' });
      return false;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', allowedMethods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', allowedMethods);
    res.status(204).end();
    return false;
  }

  return true;
}

// Valida return_to para Google SSO contra los orígenes permitidos (evita Open Redirect).
// Devuelve la URL normalizada válida o null si es inválida o externa.
function validateReturnTo(rawReturnTo) {
  if (!rawReturnTo || typeof rawReturnTo !== 'string') return null;
  const trimmed = rawReturnTo.trim();
  if (!trimmed || trimmed.length > 1024) return null;
  try {
    const parsed = new URL(trimmed);
    if (!isAllowedOrigin(parsed.origin)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch (e) {
    return null;
  }
}

function defaultReturnUrl() {
  return 'https://dmd.dmdmx.dev/app.html';
}

function cookieDomain(req) {
  const raw = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
  const host = String(raw).split(',')[0].trim().toLowerCase().split(':')[0];
  if (host === 'dmdmx.dev' || host.endsWith('.dmdmx.dev')) return SSO_DOMAIN;
  return '';
}

function scryptHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function scryptVerify(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const hash = crypto.scryptSync(String(password), parts[1], 64).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(parts[2], 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function parseCookies(req) {
  const out = {};
  const raw = (req.headers && req.headers.cookie) || '';
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    try {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch (e) {
      out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  });
  return out;
}

function isSecureRequest(req) {
  if (process.env.VERCEL_ENV === 'production') return true;
  return (req.headers && req.headers['x-forwarded-proto']) === 'https';
}

function setSessionCookie(res, token, req) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const secure = isSecureRequest(req) ? '; Secure' : '';
  const domain = cookieDomain(req);
  res.setHeader(
    'Set-Cookie',
    SESSION_COOKIE + '=' + encodeURIComponent(token) +
    '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge +
    (domain ? '; Domain=' + domain : '') + secure
  );
}

function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  const domain = cookieDomain(req);
  res.setHeader(
    'Set-Cookie',
    SESSION_COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' +
    (domain ? '; Domain=' + domain : '') + secure
  );
}

async function getSessionUser(req) {
  try {
    const { query } = require('./_db');
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;
    const rows = await query(
      'SELECT u.id, u.name, u.email, u.promo, u.used_count, u.is_admin, u.created_at ' +
      'FROM sessions s JOIN users u ON u.id = s.user_id ' +
      'WHERE s.token_hash = $1 AND s.expires_at > NOW()',
      [hashToken(token)]
    );
    return rows.rows[0] || null;
  } catch (e) {
    return null;
  }
}

async function createSession(userId) {
  const { query } = require('./_db');
  const token = newSessionToken();
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [id, userId, hashToken(token), expires.toISOString()]
  );
  return token;
}

async function destroySession(req) {
  try {
    const { query } = require('./_db');
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    }
  } catch (e) { /* sin sesión que borrar */ }
}

function quotaOf(user) {
  if (!user) return { used: 0, limit: 3, promo: false };
  const limit = user.promo ? 50 : 25;
  return { used: user.used_count || 0, limit, promo: !!user.promo };
}

function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function ipHash(req) {
  return crypto.createHash('sha256').update(clientIp(req)).digest('hex');
}

function bucketHash(prefix, value) {
  return prefix + ':' + crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

// Rate limiter respaldado en Postgres para funciones serverless.
// Incrementa el contador dentro de una ventana de windowSec segundos y devuelve { allowed, retryAfterSec }.
async function checkRateLimit(bucketKey, maxAttempts, windowSec) {
  const { query } = require('./_db');
  const res = await query(
    `INSERT INTO auth_rate_limits (bucket_key, attempts, window_start)
     VALUES ($1, 1, NOW())
     ON CONFLICT (bucket_key) DO UPDATE SET
       attempts = CASE
         WHEN auth_rate_limits.window_start <= NOW() - ($2 || ' seconds')::interval THEN 1
         ELSE auth_rate_limits.attempts + 1
       END,
       window_start = CASE
         WHEN auth_rate_limits.window_start <= NOW() - ($2 || ' seconds')::interval THEN NOW()
         ELSE auth_rate_limits.window_start
       END
     RETURNING attempts, EXTRACT(EPOCH FROM (window_start + ($2 || ' seconds')::interval - NOW()))::int AS retry_after`,
    [bucketKey, String(windowSec)]
  );
  const row = res.rows[0];
  const attempts = row ? row.attempts : 1;
  const retryAfterSec = Math.max(1, (row && row.retry_after) || windowSec);
  return {
    allowed: attempts <= maxAttempts,
    retryAfterSec
  };
}

async function resetRateLimit(bucketKey) {
  try {
    const { query } = require('./_db');
    await query('DELETE FROM auth_rate_limits WHERE bucket_key = $1', [bucketKey]);
  } catch (e) { /* ignorar error de limpieza */ }
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

function noDb(res) {
  return res.status(503).json({
    db: false,
    error: 'Base de datos no configurada: falta DATABASE_URL en Vercel (Supabase o Neon gratis). El builder sigue en modo anónimo con límite local de 3.'
  });
}

module.exports = {
  SESSION_COOKIE,
  SSO_DOMAIN,
  isAllowedOrigin,
  handleCors,
  validateReturnTo,
  defaultReturnUrl,
  cookieDomain,
  scryptHash,
  scryptVerify,
  newSessionToken,
  hashToken,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
  createSession,
  destroySession,
  quotaOf,
  clientIp,
  ipHash,
  bucketHash,
  checkRateLimit,
  resetRateLimit,
  readBody,
  noDb
};
