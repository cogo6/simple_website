const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const dataPath = path.join(__dirname, '..', 'data', 'clade.json');
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/animals';
const INSERT_BATCH_SIZE = 500;

async function insertNodes(client, nodes) {
  for (let i = 0; i < nodes.length; i += INSERT_BATCH_SIZE) {
    const batch = nodes.slice(i, i + INSERT_BATCH_SIZE);
    const values = [];
    const placeholders = [];

    batch.forEach((node, index) => {
      const base = index * 5;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      values.push(
        node.id,
        node.parentId || null,
        node.rank || 'unknown',
        node.scientificName || '',
        node.commonName || '',
      );
    });

    await client.query(
      `
        INSERT INTO taxonomy_nodes (id, parent_id, rank, scientific_name, common_name)
        VALUES ${placeholders.join(', ')}
      `,
      values,
    );
  }
}

async function insertMedia(client, nodes) {
  for (let i = 0; i < nodes.length; i += INSERT_BATCH_SIZE) {
    const batch = nodes.slice(i, i + INSERT_BATCH_SIZE);
    const values = [];
    const placeholders = [];

    batch.forEach((node, index) => {
      const base = index * 3;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
      values.push(
        node.id,
        node.imageUrl || '',
        node.imageCredit || '',
      );
    });

    await client.query(
      `
        INSERT INTO taxon_media (taxon_id, image_url, image_credit)
        VALUES ${placeholders.join(', ')}
      `,
      values,
    );
  }
}

async function importClade() {
  const raw = fs.readFileSync(dataPath, 'utf8');
  const parsed = JSON.parse(raw);
  const nodes = parsed.nodes || [];

  if (!nodes.length) {
    throw new Error('clade.json contains no nodes');
  }

  const client = new Client({ connectionString });
  await client.connect();
  let inTransaction = false;

  try {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);

    await client.query('BEGIN');
    inTransaction = true;
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    await client.query('TRUNCATE TABLE taxon_media, taxonomy_nodes');
    await insertNodes(client, nodes);
    await insertMedia(client, nodes);

    await client.query('COMMIT');
    inTransaction = false;

    const speciesCount = nodes.filter((node) => node.rank === 'species').length;
    const imageCoverageCount = nodes.filter(
      (node) => node.rank === 'species' && (node.imageUrl || '').trim().length > 0,
    ).length;

    console.log(
      `Imported ${nodes.length} taxonomy nodes (${speciesCount} species, ${imageCoverageCount} species images) into Postgres.`,
    );
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

importClade().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
});
