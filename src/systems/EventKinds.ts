import type { EventKind } from './EventSystem';

/** Every kind of event (#218), for the medals that count them; kept apart from EventSystem's data imports. */
export const EVENT_KINDS: EventKind[] = ['double', 'steel', 'training', 'repair', 'fuel', 'ammo', 'bauxite', 'superweapon'];
