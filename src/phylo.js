const fs = require('fs');
const path = require('path');

const SPECIES_RANK = 'species';

class PhyloStore {
  constructor(cladeData) {
    this.nodes = new Map();
    this.children = new Map();

    for (const node of cladeData.nodes || []) {
      this.nodes.set(node.id, node);
      if (!this.children.has(node.id)) {
        this.children.set(node.id, []);
      }
    }

    for (const node of this.nodes.values()) {
      if (node.parentId) {
        if (!this.children.has(node.parentId)) {
          this.children.set(node.parentId, []);
        }
        this.children.get(node.parentId).push(node.id);
      }
    }

    this.speciesIds = [...this.nodes.values()]
      .filter((node) => node.rank === SPECIES_RANK)
      .map((node) => node.id);

    this.lastQuestionKey = null;
  }

  static fromFile(filePath) {
    const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
    const parsed = JSON.parse(raw);
    return new PhyloStore(parsed);
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  listSpecies({ search = '', limit = 25 } = {}) {
    const term = search.trim().toLowerCase();
    const species = this.speciesIds
      .map((id) => this.getNode(id))
      .filter(Boolean)
      .filter((node) => {
        if (!term) return true;
        return (
          node.scientificName?.toLowerCase().includes(term) ||
          node.commonName?.toLowerCase().includes(term)
        );
      })
      .slice(0, limit);

    return species;
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

  mrca(nodeAId, nodeBId) {
    const ancestorsA = new Set(this.getAncestors(nodeAId));
    const ancestorsB = this.getAncestors(nodeBId);
    return ancestorsB.find((id) => ancestorsA.has(id)) || null;
  }

  distance(nodeAId, nodeBId) {
    const mrcaId = this.mrca(nodeAId, nodeBId);
    if (!mrcaId) return Number.POSITIVE_INFINITY;

    const depthTo = (startId, endId) => {
      let depth = 0;
      let cursor = this.getNode(startId);
      while (cursor && cursor.id !== endId) {
        depth += 1;
        cursor = cursor.parentId ? this.getNode(cursor.parentId) : null;
      }
      return cursor ? depth : Number.POSITIVE_INFINITY;
    };

    return depthTo(nodeAId, mrcaId) + depthTo(nodeBId, mrcaId);
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
      const targetIdx = Math.floor(Math.random() * this.speciesIds.length);
      const choiceAIdx = Math.floor(Math.random() * this.speciesIds.length);
      const choiceBIdx = Math.floor(Math.random() * this.speciesIds.length);

      const targetId = this.speciesIds[targetIdx];
      const choiceAId = this.speciesIds[choiceAIdx];
      const choiceBId = this.speciesIds[choiceBIdx];

      if (!targetId || !choiceAId || !choiceBId) continue;
      if (targetId === choiceAId || targetId === choiceBId || choiceAId === choiceBId) continue;

      const distanceA = this.distance(targetId, choiceAId);
      const distanceB = this.distance(targetId, choiceBId);

      if (!Number.isFinite(distanceA) || !Number.isFinite(distanceB)) continue;
      if (distanceA === distanceB) continue;

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
        metrics: {
          distanceA,
          distanceB,
          gap,
        },
        key,
      };
    }

    return null;
  }

  formatTaxon(node) {
    return {
      id: node.id,
      label: node.commonName || node.scientificName,
      scientific_name: node.scientificName,
      common_name: node.commonName || '',
      image_url: node.imageUrl || '',
      image_credit: node.imageCredit || '',
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
    const modes = difficultyFallbacks[difficulty] || difficultyFallbacks.medium;
    for (const mode of modes) {
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

module.exports = {
  PhyloStore,
};
