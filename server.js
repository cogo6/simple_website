const express = require('express');
const path = require('path');
const { PhyloStore } = require('./src/phylo');

const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
let phylo = null;
let phyloSource = 'file';
const imageBinaryCache = new Map();
const imageSourceCache = new Map();
const IMAGE_BINARY_TTL_MS = 1000 * 60 * 60 * 12;
const IMAGE_SOURCE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const IMAGE_SOURCE_NEGATIVE_TTL_MS = 1000 * 60 * 60;
const IMAGE_FETCH_TIMEOUT_MS = 7000;
const IMAGE_RESOLVE_TIMEOUT_MS = 2500;
const IMAGE_BINARY_CACHE_LIMIT = 3000;
const IMAGE_SOURCE_CACHE_LIMIT = 25000;
const WIKIPEDIA_SUMMARY_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
let wikipediaBackoffUntil = 0;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

async function loadPhyloStore() {
  const configuredSource = (process.env.PHYLO_SOURCE || 'postgres').toLowerCase();
  const wantsDb = configuredSource === 'postgres' || Boolean(process.env.DATABASE_URL);
  const mustUseDb = process.env.PHYLO_REQUIRE_DB === '1';
  const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/animals';

  if (wantsDb) {
    try {
      phylo = await PhyloStore.fromPostgres({ connectionString });
      phyloSource = 'postgres';
      return;
    } catch (error) {
      if (mustUseDb) throw error;
      console.warn(`Failed to load taxonomy from Postgres, falling back to files: ${error.message}`);
    }
  }

  phylo = PhyloStore.fromDataDir(dataDir);
  phyloSource = 'file';
}

function getCachedImage(cacheKey) {
  const cached = imageBinaryCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    imageBinaryCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function cacheImage(cacheKey, value) {
  imageBinaryCache.set(cacheKey, { value, expiresAt: Date.now() + IMAGE_BINARY_TTL_MS });
  if (imageBinaryCache.size > IMAGE_BINARY_CACHE_LIMIT) {
    const oldestKey = imageBinaryCache.keys().next().value;
    if (oldestKey) imageBinaryCache.delete(oldestKey);
  }
}

function getCachedImageSource(taxonId) {
  const cached = imageSourceCache.get(taxonId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    imageSourceCache.delete(taxonId);
    return null;
  }
  return cached.value;
}

function cacheImageSource(taxonId, value, ttlMs) {
  imageSourceCache.set(taxonId, { value, expiresAt: Date.now() + ttlMs });
  if (imageSourceCache.size > IMAGE_SOURCE_CACHE_LIMIT) {
    const oldestKey = imageSourceCache.keys().next().value;
    if (oldestKey) imageSourceCache.delete(oldestKey);
  }
}

function escapeXml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeTitle(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isPlaceholderImageUrl(rawUrl) {
  try {
    const { hostname } = new URL(rawUrl);
    const host = hostname.toLowerCase();
    return host.includes('picsum.photos') || host.includes('placehold');
  } catch (error) {
    return false;
  }
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function sendFallbackSvg(res, node) {
  const title = escapeXml(node.commonName || node.scientificName || 'Unknown species');
  const subtitle = escapeXml(node.scientificName || '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" role="img" aria-label="${title}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#eef2ff"/><stop offset="100%" stop-color="#dbeafe"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><rect x="20" y="20" width="600" height="360" rx="16" fill="#ffffff" stroke="#c7d2fe"/><text x="320" y="182" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" fill="#1e293b">${title}</text><text x="320" y="220" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#475569">${subtitle}</text><text x="320" y="320" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="16" fill="#64748b">Image unavailable</text></svg>`;

  res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(svg);
}

async function resolveFromWikipedia(node) {
  if (Date.now() < wikipediaBackoffUntil) return null;

  const scientificName = typeof node.scientificName === 'string' ? node.scientificName.trim() : '';
  if (!scientificName) return null;

  const title = scientificName.replace(/\s+/g, '_');
  const url = `${WIKIPEDIA_SUMMARY_BASE}${encodeURIComponent(title)}`;

  try {
    const response = await fetchWithTimeout(url, IMAGE_RESOLVE_TIMEOUT_MS, {
      headers: {
        'User-Agent': 'SpeciesRelatednessQuiz/1.0 (+https://localhost)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) return null;

    const payload = await response.json();
    if (payload?.type === 'disambiguation') return null;

    const expectedTitle = normalizeTitle(scientificName);
    const actualTitle = normalizeTitle(payload?.title || '');
    if (actualTitle && actualTitle !== expectedTitle) return null;

    const imageUrl = payload?.originalimage?.source || payload?.thumbnail?.source || '';
    if (!imageUrl) return null;

    return {
      imageUrl,
      imageCredit: 'Wikipedia',
      imageSourceUrl: payload?.content_urls?.desktop?.page || '',
    };
  } catch (error) {
    const message = `${error?.message || ''}`;
    if (message.includes('ENOTFOUND') || message.includes('EAI_AGAIN')) {
      wikipediaBackoffUntil = Date.now() + (1000 * 60 * 10);
    }
    return null;
  }
}

async function resolveImageSource(node) {
  const cached = getCachedImageSource(node.id);
  if (cached) return cached.unavailable ? null : cached;

  const media = phylo.mediaByTaxon[node.id] || {};
  const directUrl = typeof media.imageUrl === 'string' ? media.imageUrl.trim() : '';

  if (directUrl && !isPlaceholderImageUrl(directUrl)) {
    const resolved = {
      imageUrl: directUrl,
      imageCredit: media.imageCredit || '',
      imageSourceUrl: directUrl,
    };
    cacheImageSource(node.id, resolved, IMAGE_SOURCE_TTL_MS);
    return resolved;
  }

  const wikipedia = await resolveFromWikipedia(node);
  if (wikipedia) {
    cacheImageSource(node.id, wikipedia, IMAGE_SOURCE_TTL_MS);
    return wikipedia;
  }

  cacheImageSource(node.id, { unavailable: true }, IMAGE_SOURCE_NEGATIVE_TTL_MS);
  return null;
}

async function fetchResolvedImage(source) {
  const cached = getCachedImage(source.imageUrl);
  if (cached) return cached;

  const response = await fetchWithTimeout(source.imageUrl, IMAGE_FETCH_TIMEOUT_MS, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'SpeciesRelatednessQuiz/1.0 (+https://localhost)',
      Accept: 'image/*,*/*;q=0.8',
    },
  });

  if (!response.ok) throw new Error(`Image fetch failed with status ${response.status}`);

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) throw new Error('Upstream did not return an image');

  const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > 8_000_000) {
    throw new Error('Image payload too large');
  }

  const arrayBuffer = await response.arrayBuffer();
  const image = { buffer: Buffer.from(arrayBuffer), contentType };
  cacheImage(source.imageUrl, image);
  return image;
}

function primeImage(node) {
  if (!node || node.rank !== 'species') return;
  resolveImageSource(node)
    .then((source) => (source ? fetchResolvedImage(source) : null))
    .catch(() => null);
}

app.get('/', (req, res) => {
  res.render('index', { title: 'Species Relatedness Quiz' });
});

app.get('/api/image/:id', async (req, res) => {
  const node = phylo.getNode(req.params.id);
  if (!node) {
    res.status(404).json({ error: 'Species not found' });
    return;
  }

  try {
    const source = await resolveImageSource(node);
    if (!source) {
      sendFallbackSvg(res, node);
      return;
    }

    const image = await fetchResolvedImage(source);
    if (source.imageCredit) res.set('X-Image-Credit', source.imageCredit);
    if (source.imageSourceUrl) res.set('X-Image-Source-Url', source.imageSourceUrl);

    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', 'public, max-age=21600');
    res.send(image.buffer);
  } catch (error) {
    sendFallbackSvg(res, node);
  }
});

app.get('/api/question', (req, res) => {
  const difficulty = (req.query.difficulty || 'medium').toString().toLowerCase();
  const question = phylo.generateQuestion({ difficulty });

  if (!question) {
    res.status(404).json({ error: 'No valid question could be generated.' });
    return;
  }

  for (const taxon of [question.target, question.choiceA, question.choiceB]) {
    const node = phylo.getNode(taxon.id);
    if (node) setImmediate(() => primeImage(node));
  }

  res.json(question);
});

app.get('/api/species', (req, res) => {
  const search = (req.query.search || '').toString();
  const limit = Number.parseInt(req.query.limit, 10) || 25;
  const clampedLimit = Math.max(1, Math.min(limit, 100));

  const species = phylo.listSpecies({ search, limit: clampedLimit }).map((node) => phylo.formatTaxon(node));
  res.json({ count: species.length, species });
});

app.get('/api/species/:id', (req, res) => {
  const node = phylo.getNode(req.params.id);
  if (!node) {
    res.status(404).json({ error: 'Species not found' });
    return;
  }

  res.json(phylo.formatTaxon(node));
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    speciesCount: phylo.speciesIds.length,
    imageCacheSize: imageBinaryCache.size,
    imageSourceCacheSize: imageSourceCache.size,
    wikipediaBackoffActive: Date.now() < wikipediaBackoffUntil,
    source: phyloSource,
  });
});

async function startServer() {
  await loadPhyloStore();
  app.listen(port, () => {
    console.log(`Server is running on port ${port} (taxonomy source: ${phyloSource})`);
  });
}

startServer().catch((error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});
