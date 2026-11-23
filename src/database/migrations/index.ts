import { InitSchema1732406400000 } from './1732406400000-InitSchema';
import { RowLevelSecurity1732406500000 } from './1732406500000-RowLevelSecurity';

/**
 * Explicit, ordered migration list. Explicit imports (instead of a glob) keep migrations working
 * identically under ts-node, jest and the compiled dist build. Register new migrations here.
 */
export const migrations = [InitSchema1732406400000, RowLevelSecurity1732406500000];
