import { NOMBRE_LANCE } from '../engine/mesa'
import type { VistaMesa } from '../engine/sala'

/** Título del panel de acciones según la fase de la mano. */
export function tituloFase(v: VistaMesa): string {
  const m = v.mano
  if (!m) return 'Mesa'
  if (m.fase === 'mus') return m.ronda === 0 ? '¿Mus?' : `¿Mus? (tras ${m.ronda} descarte${m.ronda > 1 ? 's' : ''})`
  if (m.fase === 'descarte') return 'Descarte'
  if (m.fase === 'envites' && m.lance) return NOMBRE_LANCE[m.lance]
  return 'Fin de la mano'
}
