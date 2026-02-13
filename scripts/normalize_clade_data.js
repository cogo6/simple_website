const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'data', 'clade.json');
const outputNodesPath = path.join(__dirname, '..', 'data', 'taxonomy_nodes.ndjson');
const outputMediaPath = path.join(__dirname, '..', 'data', 'media_by_taxon.json');
const outputSpeciesPath = path.join(__dirname, '..', 'data', 'species_ids.json');
const outputReportPath = path.join(__dirname, '..', 'data', 'dataset_report.json');

const raw = fs.readFileSync(inputPath, 'utf8');
const parsed = JSON.parse(raw);
const nodes = parsed.nodes || [];

const mediaByTaxon = {};
const speciesIds = [];
const kingdomCounts = {};
const nodeById = new Map(nodes.map((node) => [node.id, node]));

const lineBuffer = [];

function findKingdomId(nodeId) {
  let cursor = nodeById.get(nodeId) || null;
  const seen = new Set();

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.rank === 'kingdom') return cursor.id.toLowerCase();
    cursor = cursor.parentId ? nodeById.get(cursor.parentId) || null : null;
  }

  return 'unknown';
}

for (const node of nodes) {
  const normalizedNode = {
    id: node.id,
    parentId: node.parentId || null,
    rank: node.rank,
    scientificName: node.scientificName || '',
    commonName: node.commonName || '',
  };

  lineBuffer.push(JSON.stringify(normalizedNode));

  if (node.rank === 'species') {
    speciesIds.push(node.id);
    const kingdom = findKingdomId(node.id);
    kingdomCounts[kingdom] = (kingdomCounts[kingdom] || 0) + 1;
  }

  mediaByTaxon[node.id] = {
    imageUrl: node.imageUrl || '',
    imageCredit: node.imageCredit || '',
  };
}

fs.writeFileSync(outputNodesPath, `${lineBuffer.join('\n')}\n`);
fs.writeFileSync(outputMediaPath, JSON.stringify(mediaByTaxon, null, 2));
fs.writeFileSync(outputSpeciesPath, JSON.stringify(speciesIds, null, 2));

const report = {
  totalNodes: nodes.length,
  totalSpecies: speciesIds.length,
  imageCoverage: speciesIds.length
    ? Number(((speciesIds.filter((id) => (mediaByTaxon[id]?.imageUrl || '').length > 0).length / speciesIds.length) * 100).toFixed(2))
    : 0,
  kingdomCounts,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(outputReportPath, JSON.stringify(report, null, 2));

console.log(`Normalized dataset written: ${nodes.length} nodes, ${speciesIds.length} species.`);
