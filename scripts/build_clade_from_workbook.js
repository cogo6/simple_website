const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const inputPath = path.join(__dirname, '..', 'data', 'animals_common_scientific_names_with_clade.xlsx');
const outputPath = path.join(__dirname, '..', 'data', 'clade.json');

const RANK_MAP = {
  Root: 'root',
  Kingdom: 'kingdom',
  Phylum: 'phylum',
  Class: 'class',
  Order: 'order',
  Family: 'family',
  Genus: 'genus',
  Species: 'species',
};

function normalizeRank(rank) {
  const raw = `${rank || ''}`.trim();
  if (!raw) return 'unknown';
  return RANK_MAP[raw] || raw.toLowerCase();
}

function topologicalSort(nodes, parentByChild) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map();

  for (const [childId, parentId] of parentByChild.entries()) {
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(childId);
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  }

  const roots = nodes
    .filter((node) => !node.parentId)
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  const orderedIds = [];
  const visited = new Set();
  const stack = new Set();

  function visit(nodeId) {
    if (visited.has(nodeId)) return;
    if (stack.has(nodeId)) throw new Error(`Cycle detected at ${nodeId}`);
    stack.add(nodeId);
    orderedIds.push(nodeId);

    const children = childrenByParent.get(nodeId) || [];
    for (const childId of children) {
      visit(childId);
    }

    stack.delete(nodeId);
    visited.add(nodeId);
  }

  for (const rootId of roots) {
    visit(rootId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) visit(node.id);
  }

  return orderedIds.map((id) => byId.get(id)).filter(Boolean);
}

function buildClade() {
  const workbook = xlsx.readFile(inputPath);
  const taxaRows = xlsx.utils.sheet_to_json(workbook.Sheets.Taxa, { defval: '' });
  const edgeRows = xlsx.utils.sheet_to_json(workbook.Sheets.Edges, { defval: '' });
  const metadataRows = xlsx.utils.sheet_to_json(workbook.Sheets.Metadata, { defval: '' });

  const commonByScientific = new Map();
  for (const row of metadataRows) {
    const scientific = `${row['Scientific name'] || ''}`.trim();
    const common = `${row['Common name'] || ''}`.trim();
    if (!scientific || !common) continue;
    if (!commonByScientific.has(scientific)) commonByScientific.set(scientific, common);
  }

  const parentByChild = new Map();
  for (const row of edgeRows) {
    const childId = `${row.child_id || ''}`.trim();
    const parentId = `${row.parent_id || ''}`.trim();
    if (!childId || !parentId) continue;
    parentByChild.set(childId, parentId);
  }

  const nodes = [];
  for (const row of taxaRows) {
    const id = `${row.taxon_id || ''}`.trim();
    if (!id) continue;

    const scientificName = `${row.name || ''}`.trim();
    const rank = normalizeRank(row.rank);
    const commonNameFromTaxa = `${row.common_name || ''}`.trim();
    const commonName = commonNameFromTaxa || commonByScientific.get(scientificName) || '';
    const parentId = parentByChild.get(id) || null;

    nodes.push({
      id,
      parentId,
      rank,
      scientificName,
      commonName,
    });
  }

  const orderedNodes = topologicalSort(nodes, parentByChild);
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: orderedNodes }, null, 2)}\n`);

  const speciesCount = orderedNodes.filter((node) => node.rank === 'species').length;
  console.log(`Built clade.json from workbook: ${orderedNodes.length} nodes, ${speciesCount} species.`);
}

buildClade();
