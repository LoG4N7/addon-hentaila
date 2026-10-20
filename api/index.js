const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  getLatest,
  getTrending,
  getUncensored,
  search,
  getMeta,
  getStreams
} = require('../src/scraper');

const app = express();

// Enable CORS for all domains (essential for Stremio and Nuvio)
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

// Stremio / Nuvio Manifest Definition
const MANIFEST = {
  id: "com.hentaila.addon",
  name: "HentaiLA Addon",
  version: "1.0.0",
  description: "Addon de Nuvio para explorar, buscar y reproducir contenido de HentaiLA",
  resources: ["catalog", "meta", "stream"],
  types: ["anime"],
  idPrefixes: ["hla-"],
  catalogs: [
    {
      id: "hla-latest",
      name: "HentaiLA - Últimos Episodios",
      type: "anime",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    },
    {
      id: "hla-trending",
      name: "HentaiLA - En Tendencia / Populares",
      type: "anime",
      extra: [
        { name: "skip", isRequired: false }
      ]
    },
    {
      id: "hla-uncensored",
      name: "HentaiLA - Sin Censura",
      type: "anime",
      extra: [
        { name: "search", isRequired: false },
        { name: "skip", isRequired: false }
      ]
    }
  ],
  behaviorHints: {
    configurable: false,
    configurationRequired: false
  }
};

/**
 * Root Route: Landing Page
 */
app.get('/', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const manifestUrl = `${protocol}://${host}/manifest.json`;
  const stremioInstallUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HentaiLA Addon - Nuvio & Stremio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b0c10;
      --card-bg: #1f2833;
      --card-border: #2c3847;
      --accent-pink: #ff2a74;
      --accent-purple: #8a2be2;
      --text-main: #ffffff;
      --text-muted: #c5c6c7;
      --badge-bg: rgba(255, 42, 116, 0.15);
      --badge-color: #ff5e95;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at 50% 10%, #1a162b 0%, var(--bg-color) 70%);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .container {
      max-width: 680px;
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.6);
      text-align: center;
      backdrop-filter: blur(8px);
    }
    .badge {
      display: inline-block;
      padding: 6px 16px;
      background: var(--badge-bg);
      color: var(--badge-color);
      border: 1px solid rgba(255, 42, 116, 0.3);
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 2.6rem;
      font-weight: 800;
      background: linear-gradient(135deg, #ff2a74 0%, #ff8cb2 50%, #8a2be2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 12px;
    }
    p.desc {
      color: var(--text-muted);
      font-size: 1.05rem;
      line-height: 1.6;
      margin-bottom: 30px;
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 30px;
    }
    @media(min-width: 500px) {
      .btn-group { flex-direction: row; justify-content: center; }
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 28px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 1rem;
      text-decoration: none;
      transition: all 0.25s ease;
      cursor: pointer;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--accent-pink), var(--accent-purple));
      color: #fff;
      box-shadow: 0 6px 20px rgba(255, 42, 116, 0.4);
      border: none;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(255, 42, 116, 0.6);
    }
    .btn-secondary {
      background: #12161f;
      color: var(--text-muted);
      border: 1px solid var(--card-border);
    }
    .btn-secondary:hover {
      background: #181d29;
      color: #fff;
    }
    .info-box {
      background: #11151c;
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 18px 20px;
      text-align: left;
      font-size: 0.9rem;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: var(--text-muted); }
    .info-val { font-family: monospace; color: #66fcf1; font-weight: 600; }
    .footer {
      margin-top: 24px;
      font-size: 0.85rem;
      color: #7b8089;
    }
    .copy-alert {
      display: none;
      margin-top: 10px;
      color: #45f3a0;
      font-size: 0.85rem;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Nuvio & Stremio Compatible</div>
    <h1>HentaiLA Addon</h1>
    <p class="desc">
      Explora, busca y reproduce el catálogo completo de HentaiLA directamente en Nuvio y Stremio con streaming HLS en tiempo real y soporte sin censura.
    </p>

    <div class="btn-group">
      <a href="${stremioInstallUrl}" class="btn btn-primary">
        🚀 Instalar Addon
      </a>
      <button class="btn btn-secondary" onclick="copyManifest()">
        📋 Copiar Enlace
      </button>
    </div>
    <div id="copyAlert" class="copy-alert">✓ ¡Enlace copiado al portapapeles! Pégalo en el buscador de Nuvio o Stremio.</div>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Estado:</span>
        <span class="info-val" style="color: #45f3a0;">🟢 Activo / Online</span>
      </div>
      <div class="info-row">
        <span class="info-label">Versión:</span>
        <span class="info-val">v1.0.0</span>
      </div>
      <div class="info-row">
        <span class="info-label">Catálogos:</span>
        <span class="info-val">Últimos, En Tendencia, Sin Censura</span>
      </div>
      <div class="info-row">
        <span class="info-label">Manifest URL:</span>
        <span class="info-val">${manifestUrl}</span>
      </div>
    </div>

    <div class="footer">
      Desarrollado para la comunidad de Nuvio y Stremio &bull; Scraped from hentaila.tv
    </div>
  </div>

  <script>
    function copyManifest() {
      navigator.clipboard.writeText("${manifestUrl}").then(() => {
        const el = document.getElementById('copyAlert');
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 3000);
      });
    }
  </script>
</body>
</html>`);
});

/**
 * Manifest Route
 */
app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'max-age=86400, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(MANIFEST);
});

/**
 * Helper to parse catalog parameters
 */
function parseCatalogRequest(req) {
  let { type, id, extra } = req.params;

  if (id && id.endsWith('.json')) id = id.slice(0, -5);
  if (extra && extra.endsWith('.json')) extra = extra.slice(0, -5);

  let search = req.query.search || null;
  let skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;

  if (extra) {
    const parts = extra.split('&');
    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k === 'search' && v) search = decodeURIComponent(v);
      if (k === 'skip' && v) skip = parseInt(v, 10) || 0;
    }
  }

  const page = skip > 0 ? Math.floor(skip / 30) + 1 : 1;

  return { type, id, search, skip, page };
}

/**
 * Catalog Handler
 */
async function handleCatalog(req, res) {
  res.setHeader('Cache-Control', 'max-age=3600, stale-while-revalidate=1800');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const { type, id, search: query, page } = parseCatalogRequest(req);

    if (type !== 'anime') {
      return res.json({ metas: [] });
    }

    let metas = [];

    if (query) {
      metas = await search(query, page);
    } else if (id === 'hla-latest') {
      metas = await getLatest(page);
    } else if (id === 'hla-trending') {
      metas = await getTrending();
    } else if (id === 'hla-uncensored') {
      metas = await getUncensored(page);
    }

    return res.json({ metas });
  } catch (err) {
    console.error('Catalog route error:', err.message);
    return res.json({ metas: [] });
  }
}

// Catalog Routes
app.get('/catalog/:type/:id.json', handleCatalog);
app.get('/catalog/:type/:id/:extra.json', handleCatalog);
app.get('/catalog/:type/:id', handleCatalog);

/**
 * Metadata Route
 */
app.get('/meta/:type/:id.json', async (req, res) => {
  res.setHeader('Cache-Control', 'max-age=14400, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    let { type, id } = req.params;
    if (id && id.endsWith('.json')) id = id.slice(0, -5);

    if (type !== 'anime' || !id.startsWith('hla-')) {
      return res.json({ meta: null });
    }

    const result = await getMeta(id);
    return res.json(result);
  } catch (err) {
    console.error('Meta route error:', err.message);
    return res.json({ meta: null });
  }
});

/**
 * Streams Route
 */
app.get('/stream/:type/:id.json', async (req, res) => {
  res.setHeader('Cache-Control', 'max-age=1800, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    let { type, id } = req.params;
    if (id && id.endsWith('.json')) id = id.slice(0, -5);

    if (type !== 'anime' || !id.startsWith('hla-')) {
      return res.json({ streams: [] });
    }

    const result = await getStreams(id);
    return res.json(result);
  } catch (err) {
    console.error('Stream route error:', err.message);
    return res.json({ streams: [] });
  }
});

// Fallback 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Export app for Vercel Serverless Functions
module.exports = app;

// Run locally if called directly
if (require.main === module) {
  const PORT = process.env.PORT || 7000;
  app.listen(PORT, () => {
    console.log(`🚀 HentaiLA Addon listening on http://localhost:${PORT}`);
    console.log(`📋 Manifest URL: http://localhost:${PORT}/manifest.json`);
  });
}
