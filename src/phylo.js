const fs = require('fs');
const path = require('path');

const SPECIES_RANK = 'species';

class PhyloStore {
  constructor({ nodes = [], mediaByTaxon = {}, speciesIds = null } = {}) {
    this.nodes = new Map();
    this.children = new Map();
    this.mediaByTaxon = mediaByTaxon;

    for (const node of nodes) {
      this.nodes.set(node.id, node);
      if (!this.children.has(node.id)) this.children.set(node.id, []);
    }

    for (const node of this.nodes.values()) {
      if (!node.parentId) continue;
      if (!this.children.has(node.parentId)) this.children.set(node.parentId, []);
      this.children.get(node.parentId).push(node.id);
    }

    this.speciesIds = Array.isArray(speciesIds) && speciesIds.length
      ? speciesIds
      : [...this.nodes.values()].filter((n) => n.rank === SPECIES_RANK).map((n) => n.id);

    this.lastQuestionKey = null;
  }

  static fromDataDir(dataDir) {
    const ndjsonPath = path.join(dataDir, 'taxonomy_nodes.ndjson');
    const mediaPath = path.join(dataDir, 'media_by_taxon.json');
    const speciesPath = path.join(dataDir, 'species_ids.json');
    const cladePath = path.join(dataDir, 'clade.json');

    if (fs.existsSync(ndjsonPath) && fs.existsSync(mediaPath) && fs.existsSync(speciesPath)) {
      const lines = fs.readFileSync(ndjsonPath, 'utf8').split('\n').filter(Boolean);
      const nodes = lines.map((line) => JSON.parse(line));
      const mediaByTaxon = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));
      const speciesIds = JSON.parse(fs.readFileSync(speciesPath, 'utf8'));
      return new PhyloStore({ nodes, mediaByTaxon, speciesIds });
    }

    const raw = fs.readFileSync(cladePath, 'utf8');
    const parsed = JSON.parse(raw);
    const nodes = (parsed.nodes || []).map((node) => ({
      id: node.id,
      parentId: node.parentId || null,
      rank: node.rank,
      scientificName: node.scientificName || '',
      commonName: node.commonName || '',
    }));
    const mediaByTaxon = Object.fromEntries((parsed.nodes || []).map((node) => [
      node.id,
      { imageUrl: node.imageUrl || '', imageCredit: node.imageCredit || '' },
    ]));

    return new PhyloStore({ nodes, mediaByTaxon });
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  listSpecies({ search = '', limit = 25 } = {}) {
    const term = search.trim().toLowerCase();
    return this.speciesIds
      .map((id) => this.getNode(id))
      .filter(Boolean)
      .filter((node) => !term || node.scientificName.toLowerCase().includes(term) || node.commonName.toLowerCase().includes(term))
      .slice(0, limit);
  }

  getAncestors(nodeId) {
    const ancestors = [];
    let cursor = this.getNode(nodeId);
    while (cursor) {
      ancestors.push(cursor.id);
      cursor = cursor.parentId ? this.getNode(cursor.parentId) : null;
    }
    return ancestors;
  }

  mrca(a, b) {
    const setA = new Set(this.getAncestors(a));
    return this.getAncestors(b).find((id) => setA.has(id)) || null;
  }

  distance(a, b) {
    const m = this.mrca(a, b);
    if (!m) return Number.POSITIVE_INFINITY;

    const depthTo = (from, to) => {
      let depth = 0;
      let cursor = this.getNode(from);
      while (cursor && cursor.id !== to) {
        depth += 1;
        cursor = cursor.parentId ? this.getNode(cursor.parentId) : null;
      }
      return cursor ? depth : Number.POSITIVE_INFINITY;
    };

    return depthTo(a, m) + depthTo(b, m);
  }

  pickDifficultyBucket(diff) {
    if (diff === 'easy') return (gap) => gap >= 3;
    if (diff === 'hard') return (gap) => gap === 1;
    return (gap) => gap >= 1 && gap <= 2;
  }

  buildQuestion({ difficulty = 'medium', avoidKey = null } = {}) {
    const acceptsGap = this.pickDifficultyBucket(difficulty);
    const attempts = Math.max(500, this.speciesIds.length * 4);

    for (let i = 0; i < attempts; i += 1) {
      const targetId = this.speciesIds[Math.floor(Math.random() * this.speciesIds.length)];
      const choiceAId = this.speciesIds[Math.floor(Math.random() * this.speciesIds.length)];
      const choiceBId = this.speciesIds[Math.floor(Math.random() * this.speciesIds.length)];

      if (!targetId || !choiceAId || !choiceBId) continue;
      if (targetId === choiceAId || targetId === choiceBId || choiceAId === choiceBId) continue;

      const distanceA = this.distance(targetId, choiceAId);
      const distanceB = this.distance(targetId, choiceBId);
      if (!Number.isFinite(distanceA) || !Number.isFinite(distanceB) || distanceA === distanceB) continue;

      const gap = Math.abs(distanceA - distanceB);
      if (!acceptsGap(gap)) continue;

      const correct = distanceA < distanceB ? 'A' : 'B';
      const key = `${targetId}:${choiceAId}:${choiceBId}`;
      if (avoidKey && key === avoidKey) continue;

      return {
        id: `dyn_${targetId}_${choiceAId}_${choiceBId}`,
        target: this.getNode(targetId),
        choiceA: this.getNode(choiceAId),
        choiceB: this.getNode(choiceBId),
        correct,
        metrics: { distanceA, distanceB, gap },
        key,
      };
    }

    return null;
  }

  formatTaxon(node) {
    const media = this.mediaByTaxon[node.id] || { imageUrl: '', imageCredit: '' };
    return {
      id: node.id,
      label: node.commonName || node.scientificName,
      scientific_name: node.scientificName,
      common_name: node.commonName || '',
      image_url: media.imageUrl || '',
      image_credit: media.imageCredit || '',
      rank: node.rank,
    };
  }

  generateQuestion({ difficulty = 'medium' } = {}) {
    const difficultyFallbacks = {
      easy: ['easy', 'medium', 'hard'],
      medium: ['medium', 'easy', 'hard'],
      hard: ['hard', 'medium', 'easy'],
    };

    let question = null;
    for (const mode of (difficultyFallbacks[difficulty] || difficultyFallbacks.medium)) {
      question = this.buildQuestion({ difficulty: mode, avoidKey: this.lastQuestionKey });
      if (question) break;
    }

    if (!question) return null;
    this.lastQuestionKey = question.key;

    return {
      id: question.id,
      target: this.formatTaxon(question.target),
      choiceA: this.formatTaxon(question.choiceA),
      choiceB: this.formatTaxon(question.choiceB),
      correct: question.correct,
      difficulty,
      metrics: question.metrics,
    };
  }
}

module.exports = { PhyloStore };
