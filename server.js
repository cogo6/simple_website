const express = require('express');
const path = require('path');
const { PhyloStore } = require('./src/phylo');

const app = express();
const port = process.env.PORT || 3000;
const phylo = PhyloStore.fromDataDir(path.join(__dirname, 'data'));
const imageCache = new Map();
const IMAGE_TTL_MS = 1000 * 60 * 60 * 12;
const IMAGE_TIMEOUT_MS = 7000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

function getCachedImage(cacheKey) {
  const cached = imageCache.get(cacheKey);
  if (!cached) return null;
  if ((Date.now() - cached.createdAt) > IMAGE_TTL_MS) {
    imageCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function cacheImage(cacheKey, value) {
  imageCache.set(cacheKey, { ...value, createdAt: Date.now() });
  if (imageCache.size > 2000) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey) imageCache.delete(oldestKey);
  }
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

  const media = phylo.mediaByTaxon[node.id] || {};
  const sourceUrl = typeof media.imageUrl === 'string' ? media.imageUrl.trim() : '';
  if (!sourceUrl) {
    res.status(404).json({ error: 'No image available for this species' });
    return;
  }

  const cached = getCachedImage(sourceUrl);
  if (cached) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=21600');
    res.send(cached.buffer);
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'SpeciesRelatednessQuiz/1.0 (+https://localhost)',
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429 || response.status === 403) {
        res.redirect(302, sourceUrl);
        return;
      }
      res.status(502).json({ error: `Image fetch failed with ${response.status}` });
      return;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      res.status(502).json({ error: 'Upstream URL did not return an image' });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    cacheImage(sourceUrl, { buffer, contentType });

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=21600');
    res.send(buffer);
  } catch (error) {
    res.redirect(302, sourceUrl);
  }
});

app.get('/api/question', (req, res) => {
  const difficulty = (req.query.difficulty || 'medium').toString().toLowerCase();
  const question = phylo.generateQuestion({ difficulty });

  if (!question) {
    res.status(404).json({ error: 'No valid question could be generated.' });
    return;
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
  res.json({ ok: true, speciesCount: phylo.speciesIds.length, imageCacheSize: imageCache.size });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
