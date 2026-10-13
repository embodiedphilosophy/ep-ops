// The one place the dashboard gets tasks from. With DATABASE_URL set (Neon, through the Vercel Marketplace)
// the dashboard's own database is the source of truth; without it, Motion still is. That lets this ship
// before the database exists, and lets Motion come back by removing one variable.
//
// Set TASKS_BACKEND=motion to force Motion even when a database is connected (e.g. while checking the import).
import * as motion from './motion';
import * as db from './taskdb';

export const taskBackend = () =>
  (process.env.DATABASE_URL || process.env.POSTGRES_URL) && process.env.TASKS_BACKEND !== 'motion' ? 'database' : 'motion';
const impl = () => (taskBackend() === 'database' ? db : motion);

export const listTasks = (...a) => impl().listTasks(...a);
export const createTask = (...a) => impl().createTask(...a);
export const completeTask = (...a) => impl().completeTask(...a);
export const reopenTask = (...a) => impl().reopenTask(...a);
export const updateTask = (...a) => impl().updateTask(...a);
export const retireTask = (...a) => impl().retireTask(...a);
export const addComment = (...a) => impl().addComment(...a);
export const listComments = (...a) => impl().listComments(...a);
