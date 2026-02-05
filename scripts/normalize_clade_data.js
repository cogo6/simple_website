const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'data', 'species_taxonomy.json');
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

const lineBuffer = [];

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

    let kingdom = 'unknown';
    if (node.id.includes('synthetic_species')) {
      kingdom = 'synthetic';
    } else if (node.parentId) {
      kingdom = 'animalia';
    }
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
