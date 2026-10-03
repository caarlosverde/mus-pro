import { parejaDe, type Lance, type Pareja, type Posicion } from './mesa'
import type { ResultadoApuesta } from './recuento'

/**
 * Acciones posibles en un lance. Según el momento significan:
 * - `paso`: en la apertura, pasar; respondiendo a un envite, "no quiero".
 * - `envido`: en la apertura, envidar `piedras`; respondiendo, revocar ("`piedras` más").
 * - `quiero`: aceptar el envite vigente.
 * - `ordago`: apostar el juego entero.
 */
export type AccionEnvite =
  | { tipo: 'paso' }
  | { tipo: 'envido'; piedras: number }
  | { tipo: 'quiero' }
  | { tipo: 'ordago' }

export interface PasoEnvite {
  pos: Posicion
  accion: AccionEnvite
}

export interface EstadoEnvite {
  lance: Lance
  /** Jugadores con voz en el lance, en orden de habla (desde la mano). */
  participantes: Posicion[]
  fase: 'apertura' | 'respuesta' | 'cerrado'
  /** A quién le toca hablar (null si está cerrado). */
  turno: Posicion | null
  /** Piedras totales que propone la pareja que apostó la última. */
  apostado: number
  /** Piedras que se cobra la pareja que apostó si no se le quiere ("porque no"). */
  porqueNo: number
  /** Pareja que hizo la última apuesta. */
  apostante: Pareja | null
  ordago: boolean
  /** Jugadores que aún pueden hablar en la ronda actual, en orden. */
  pendientes: Posicion[]
  historial: PasoEnvite[]
  resultado: ResultadoApuesta | null
}

export function iniciarEnvite(lance: Lance, participantes: Posicion[]): EstadoEnvite {
  const orden = [...participantes].sort((a, b) => a - b)
  return {
    lance,
    participantes: orden,
    fase: 'apertura',
    turno: orden[0] ?? null,
    apostado: 0,
    porqueNo: 0,
    apostante: null,
    ordago: false,
    pendientes: orden.slice(),
    historial: [],
    resultado: orden.length === 0 ? { tipo: 'paso' } : null,
  }
}

/** Acciones legales para quien tiene el turno. */
export function accionesLegales(e: EstadoEnvite): AccionEnvite['tipo'][] {
  if (e.fase === 'cerrado') return []
  if (e.fase === 'apertura') return ['paso', 'envido', 'ordago']
  if (e.ordago) return ['paso', 'quiero']
  return ['paso', 'quiero', 'envido', 'ordago']
}

/** Jugadores de `pareja` con voz, en orden de habla a partir del que va después de `desde`. */
function respondedores(e: EstadoEnvite, pareja: Pareja, desde: Posicion): Posicion[] {
  const out: Posicion[] = []
  for (let i = 1; i <= 4; i++) {
    const p = ((desde + i) % 4) as Posicion
    if (parejaDe(p) === pareja && e.participantes.includes(p)) out.push(p)
  }
  return out
}

/** Aplica una acción del jugador con el turno y devuelve el nuevo estado (no muta el anterior). */
export function aplicarEnvite(e: EstadoEnvite, accion: AccionEnvite): EstadoEnvite {
  if (e.fase === 'cerrado' || e.turno === null) throw new Error('El lance ya está cerrado')
  const pos = e.turno
  if (!accionesLegales(e).includes(accion.tipo)) throw new Error(`Acción no permitida: ${accion.tipo}`)
  if (accion.tipo === 'envido' && (!Number.isInteger(accion.piedras) || accion.piedras < 2))
    throw new Error('Un envite es de 2 piedras o más')

  const s: EstadoEnvite = { ...e, historial: [...e.historial, { pos, accion }], pendientes: e.pendientes.slice(1) }
  const miPareja = parejaDe(pos)
  const otra: Pareja = miPareja === 'mano' ? 'postre' : 'mano'

  const cerrar = (resultado: ResultadoApuesta): EstadoEnvite => ({ ...s, fase: 'cerrado', turno: null, pendientes: [], resultado })
  const apostar = (total: number, ordago: boolean): EstadoEnvite => {
    const siguientes = respondedores(s, otra, pos)
    return {
      ...s,
      fase: 'respuesta',
      porqueNo: e.fase === 'apertura' ? 1 : e.apostado,
      apostado: total,
      apostante: miPareja,
      ordago,
      pendientes: siguientes,
      turno: siguientes[0] ?? null,
    }
  }

  switch (accion.tipo) {
    case 'paso': {
      if (s.pendientes.length > 0) return { ...s, turno: s.pendientes[0] }
      if (e.fase === 'apertura') return cerrar({ tipo: 'paso' })
      return cerrar({ tipo: 'noQuerido', ganador: e.apostante!, piedras: e.porqueNo })
    }
    case 'quiero':
      return cerrar(e.ordago ? { tipo: 'ordago' } : { tipo: 'querido', piedras: e.apostado })
    case 'envido':
      return apostar((e.fase === 'apertura' ? 0 : e.apostado) + accion.piedras, false)
    case 'ordago':
      return apostar(e.apostado, true)
  }
}

/** Texto legible de una acción, como se diría en la mesa. */
export function decirAccion(accion: AccionEnvite, fase: EstadoEnvite['fase']): string {
  switch (accion.tipo) {
    case 'paso':
      return fase === 'respuesta' ? 'No quiero' : 'Paso'
    case 'quiero':
      return 'Quiero'
    case 'ordago':
      return '¡Órdago!'
    case 'envido':
      if (fase === 'respuesta') return `${accion.piedras} más`
      return accion.piedras === 2 ? 'Envido' : `Envido ${accion.piedras}`
  }
}
