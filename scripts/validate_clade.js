const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const ndjsonPath = path.join(dataDir, 'taxonomy_nodes.ndjson');
const mediaPath = path.join(dataDir, 'media_by_taxon.json');
const speciesPath = path.join(dataDir, 'species_ids.json');
const cladePath = path.join(dataDir, 'clade.json');

let nodes = [];
let mediaByTaxon = {};
let speciesIds = [];

if (fs.existsSync(ndjsonPath) && fs.existsSync(mediaPath) && fs.existsSync(speciesPath)) {
  nodes = fs.readFileSync(ndjsonPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  mediaByTaxon = JSON.parse(fs.readFileSync(mediaPath, 'utf8'));
  speciesIds = JSON.parse(fs.readFileSync(speciesPath, 'utf8'));
} else {
  const parsed = JSON.parse(fs.readFileSync(cladePath, 'utf8'));
  nodes = parsed.nodes || [];
  for (const node of nodes) {
    mediaByTaxon[node.id] = { imageUrl: node.imageUrl || '', imageCredit: node.imageCredit || '' };
    if (node.rank === 'species') speciesIds.push(node.id);
  }
}

const errors = [];
const nodeMap = new Map();

for (const node of nodes) {
  if (!node.id) {
    errors.push('Node missing id');
    continue;
  }
  if (nodeMap.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
  nodeMap.set(node.id, node);
}

for (const node of nodeMap.values()) {
  if (node.parentId && !nodeMap.has(node.parentId)) {
    errors.push(`Node ${node.id} has missing parent ${node.parentId}`);
  }
}

const visiting = new Set();
const visited = new Set();
function dfs(nodeId) {
  if (visiting.has(nodeId)) {
    errors.push(`Cycle detected at node: ${nodeId}`);
    return;
  }
  if (visited.has(nodeId)) return;
  visiting.add(nodeId);
  const node = nodeMap.get(nodeId);
  if (node?.parentId) dfs(node.parentId);
  visiting.delete(nodeId);
  visited.add(nodeId);
}
for (const nodeId of nodeMap.keys()) dfs(nodeId);

const speciesCount = speciesIds.length || [...nodeMap.values()].filter((n) => n.rank === 'species').length;
if (speciesCount < 1000) errors.push(`Expected at least 1000 species, found ${speciesCount}`);

const withImages = speciesIds.filter((id) => (mediaByTaxon[id]?.imageUrl || '').length > 0).length;
const imageCoverage = speciesCount ? (withImages / speciesCount) * 100 : 0;
if (imageCoverage < 85) errors.push(`Expected image coverage >= 85%, found ${imageCoverage.toFixed(2)}%`);

if (errors.length) {
  console.error('Clade validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Clade validation passed (${nodeMap.size} nodes, ${speciesCount} species, ${imageCoverage.toFixed(2)}% images).`);
