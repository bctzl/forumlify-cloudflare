import pool from './db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_NUMBER_RE = /^[1-9]\d*$/;
const MAX_POST_NUMBER = 9223372036854775807n;

let migrationPromise = null;

async function migratePostNumbers() {
  // Neon HTTP 驱动不支持事务和咨询锁，逐条执行即可（所有语句都是幂等的）
  await pool.query('CREATE SEQUENCE IF NOT EXISTS posts_post_number_seq START WITH 1');
  await pool.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_number BIGINT');
  await pool.query(`
    WITH current_max AS (
      SELECT COALESCE(MAX(post_number), 0) AS value FROM posts
    ), numbered AS (
      SELECT id, (SELECT value FROM current_max) + ROW_NUMBER() OVER (
        ORDER BY created_at ASC, id ASC
      ) AS value
      FROM posts
      WHERE post_number IS NULL
    )
    UPDATE posts
    SET post_number = numbered.value
    FROM numbered
    WHERE posts.id = numbered.id
  `);
  await pool.query(`
    SELECT setval(
      'posts_post_number_seq',
      GREATEST(
        COALESCE((SELECT MAX(post_number) FROM posts), 0) + 1,
        CASE WHEN is_called THEN last_value + 1 ELSE last_value END
      ),
      false
    )
    FROM posts_post_number_seq
  `);
  await pool.query("ALTER TABLE posts ALTER COLUMN post_number SET DEFAULT nextval('posts_post_number_seq')");
  await pool.query('ALTER SEQUENCE posts_post_number_seq OWNED BY posts.post_number');
  await pool.query('ALTER TABLE posts ALTER COLUMN post_number SET NOT NULL');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS posts_post_number_key ON posts(post_number)');
}

export function ensurePostNumberSchema() {
  if (!migrationPromise) {
    migrationPromise = migratePostNumbers().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

export function isPostReference(value) {
  const reference = String(value || '');
  if (UUID_RE.test(reference)) return true;
  if (!POST_NUMBER_RE.test(reference)) return false;
  try {
    return BigInt(reference) <= MAX_POST_NUMBER;
  } catch {
    return false;
  }
}

export async function resolvePostReference(value, client = pool) {
  await ensurePostNumberSchema();
  const reference = String(value || '');
  if (!isPostReference(reference)) return null;

  const result = UUID_RE.test(reference)
    ? await client.query('SELECT id, post_number FROM posts WHERE id = $1', [reference])
    : await client.query('SELECT id, post_number FROM posts WHERE post_number = $1::bigint', [reference]);
  return result.rows[0] || null;
}