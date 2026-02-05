const express = require('express');
const path = require('path');
const { PhyloStore } = require('./src/phylo');

const app = express();
const port = process.env.PORT || 3000;
const phylo = PhyloStore.fromDataDir(path.join(__dirname, 'data'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index', { title: 'Species Relatedness Quiz' });
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
  res.json({ ok: true, speciesCount: phylo.speciesIds.length });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
