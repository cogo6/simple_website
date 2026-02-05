const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'clade.json');
const raw = fs.readFileSync(filePath, 'utf8');
const parsed = JSON.parse(raw);
const nodes = parsed.nodes || [];

const errors = [];
const nodeMap = new Map();

for (const node of nodes) {
  if (!node.id) {
    errors.push('Node missing id');
    continue;
  }
  if (nodeMap.has(node.id)) {
    errors.push(`Duplicate node id: ${node.id}`);
  }
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

const speciesCount = [...nodeMap.values()].filter((n) => n.rank === 'species').length;
if (speciesCount < 30) {
  errors.push(`Expected at least 30 species, found ${speciesCount}`);
}

if (errors.length) {
  console.error('Clade validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Clade validation passed (${nodeMap.size} nodes, ${speciesCount} species).`);
