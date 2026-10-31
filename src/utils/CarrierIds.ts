import ijn from '@/data/ships/ijn.json';
import usn from '@/data/ships/usn.json';
import km from '@/data/ships/km.json';
import rn from '@/data/ships/rn.json';
import fr from '@/data/ships/fr.json';
import su from '@/data/ships/su.json';
import rm from '@/data/ships/rm.json';

/** Every navy's carriers, by id (#385: the first one brings the first fighter); other navies' copies too (`id@nation`). */
const CARRIERS = new Set([ijn, usn, km, rn, fr, su, rm].flatMap((d) => (d.ships as Array<{ id: string; shipClass: string }>).filter((s) => s.shipClass === 'Carrier').map((s) => s.id)));

export function isCarrierId(id: string): boolean {
  return CARRIERS.has(id.split('@')[0]);
}
