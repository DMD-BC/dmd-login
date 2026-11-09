// /api/projects — SOLO LECTURA de los proyectos del usuario.
//   GET  /api/projects            -> lista MIS proyectos (orden: recientes)
//   GET  /api/projects?slug=xxx   -> un proyecto mío
// Los proyectos se CREAN y se guardan en el builder (crear.dmdmx.dev);
// este proyecto solo los lista para mostrarlos en el portal. Por eso
// POST/DELETE responden 405. Requiere sesión (cookie httpOnly de
// /api/auth/*, compartida por SSO en .dmdmx.dev). Sin sesión -> 401.
// Sin DATABASE_URL -> 503 { db:false }.
const { hasDb, query } = require('./_db');
const { getSessionUser, noDb } = require('./_auth');

function slugify(s) {
  return String(s || 'mi-app').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mi-app';
}

function publicProject(row) {
  return {
    name: row.slug,
    slug: row.slug,
    title: row.title || row.slug,
    spec: row.spec || {},
    html: row.html || '',
    files: row.files || {},
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!hasDb()) return noDb(res);
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Inicia sesión para ver tus proyectos.' });

    if (req.method === 'GET') {
      const slug = req.query && req.query.slug ? slugify(req.query.slug) : '';
      if (slug) {
        const found = await query(
          'SELECT slug, title, spec, html, files, updated_at FROM projects WHERE user_id = $1 AND slug = $2',
          [user.id, slug]
        );
        if (!found.rows.length) return res.status(404).json({ error: 'Proyecto no encontrado.' });
        return res.status(200).json({ ok: true, db: true, project: publicProject(found.rows[0]) });
      }
      const list = await query(
        'SELECT slug, title, spec, html, files, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20',
        [user.id]
      );
      return res.status(200).json({ ok: true, db: true, projects: list.rows.map(publicProject) });
    }

    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Solo lectura: los proyectos se crean en el builder (crear.dmdmx.dev).' });
  } catch (e) {
    if (e.code === 'NO_DB') return noDb(res);
    console.error('projects error:', e.message);
    return res.status(500).json({ error: 'No se pudieron leer tus proyectos.' });
  }
};
