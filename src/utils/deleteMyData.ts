import { generateClient } from 'aws-amplify/data';
import { deleteUser, getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import { listAll } from './listAll';
import { setActivePatientId } from './activePatient';

const client = generateClient<Schema>();

// Models only the account itself can read. list() on these already returns
// just this account's rows.
const PRIVATE_MODELS = [
  'ChatMemory',
  'ChatMessage',
  'ChatThread',
  'MedicationLog',
  'Medication',
  'HealthEntry',
  'ExposureTest',
  'FamilyMember',
  'UserProfile',
] as const;

// Community models every signed-in user can read, so rows are filtered to the
// ones this account owns before deleting. The server would refuse the rest.
const SHARED_MODELS = ['PostLike', 'PostComment', 'CommunityPost'] as const;

type ModelName = (typeof PRIVATE_MODELS)[number] | (typeof SHARED_MODELS)[number];

// The generated client's model methods differ only in their key shapes, so
// they are driven through this narrow structural type.
interface ModelApi {
  list(opts: { nextToken?: string }): Promise<{ data: Record<string, unknown>[]; nextToken?: string | null }>;
  delete(key: Record<string, unknown>): Promise<{ errors?: unknown[] }>;
}

function api(name: ModelName): ModelApi {
  return (client.models as unknown as Record<ModelName, ModelApi>)[name];
}

function keyOf(name: ModelName, row: Record<string, unknown>) {
  if (name === 'PostLike') return { postId: row.postId, userId: row.userId };
  if (name === 'ChatMemory') return { threadId: row.threadId };
  return { id: row.id };
}

export interface DeleteProgress {
  step: string;
  deleted: number;
}

/**
 * Deletes every record this account owns: profile, family members, health
 * entries, medications, tests, chats and its community posts, comments and
 * likes. Throws if anything could not be deleted, so the caller never reports
 * success on a partial wipe; running it again picks up whatever is left.
 */
export async function deleteAllMyData(onProgress?: (p: DeleteProgress) => void): Promise<number> {
  const { userId } = await getCurrentUser();
  const mine = (owner: unknown) =>
    typeof owner === 'string' && (owner === userId || owner.startsWith(`${userId}::`));

  let deleted = 0;
  const failures: string[] = [];

  for (const name of [...SHARED_MODELS, ...PRIVATE_MODELS]) {
    onProgress?.({ step: name, deleted });
    const rows = await listAll(nextToken => api(name).list({ nextToken }));
    const targets = (SHARED_MODELS as readonly string[]).includes(name) ? rows.filter(r => mine(r.owner)) : rows;
    // Small batches: fast, without tripping AppSync's request throttling.
    for (let i = 0; i < targets.length; i += 10) {
      const results = await Promise.all(
        targets.slice(i, i + 10).map(r => api(name).delete(keyOf(name, r)).catch(e => ({ errors: [e] }))),
      );
      for (const r of results) {
        if (r.errors?.length) failures.push(name);
        else deleted++;
      }
      onProgress?.({ step: name, deleted });
    }
  }

  setActivePatientId(undefined);
  if (failures.length) {
    throw new Error(`Could not delete ${failures.length} record(s) (${[...new Set(failures)].join(', ')}). Please try again.`);
  }
  return deleted;
}

/** Deletes all data, then the login itself. Signs the user out. */
export async function deleteMyAccount(onProgress?: (p: DeleteProgress) => void): Promise<void> {
  await deleteAllMyData(onProgress);
  onProgress?.({ step: 'account', deleted: 0 });
  await deleteUser();
}
