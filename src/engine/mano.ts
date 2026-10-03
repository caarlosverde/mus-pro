import { extraer, type Rng } from './azar'
import { BARAJA, type Carta } from './cartas'
import { aplicarEnvite, decirAccion, iniciarEnvite, type AccionEnvite, type EstadoEnvite } from './envites'
import { evaluar, type Jugada } from './evaluacion'
import { SENAS, type Sena } from './informacion'
import {
  NOMBRE_LANCE,
  POSICIONES,
  companeroDe,
  parejaDe,
  participa,
  quienDeclara,
  seJuegaPunto,
  type Lance,
  type Pareja,
  type Posicion,
} from './mesa'
import { resolverMano, type Apuestas, type Marcador, type ResultadoApuesta, type ResultadoMano } from './recuento'
import type { Reglas } from './reglas'

/**
 * Motor de una mano completa de mus: reparto, mus/corte, descartes, señas,
 * los cuatro lances con sus envites y el recuento.
 *
 * El estado es inmutable: `aplicar` devuelve un estado nuevo. Así se puede
 * guardar cualquier punto de la mano y simular alternativas desde él.
 */

export type Fase = 'mus' | 'descarte' | 'envites' | 'fin'

export type AccionMano =
  | { tipo: 'mus' }
  | { tipo: 'corto' }
  | { tipo: 'descarte'; cartas: Carta[] }
  | { tipo: 'envite'; accion: AccionEnvite }

export interface SenaPasada {
  de: Posicion
  sena: Sena
  /** Rivales que la han pillado. */
  pillada: Posicion[]
}

export type EventoMano =
  | { tipo: 'reparto'; ronda: number }
  | { tipo: 'mus'; pos: Posicion; corta: boolean }
  | { tipo: 'descarte'; pos: Posicion; cartas: number }
  | { tipo: 'declaracion'; lance: 'pares' | 'juego'; pos: Posicion; tiene: boolean }
  | { tipo: 'envite'; lance: Lance; pos: Posicion; accion: AccionEnvite; texto: string }
  | { tipo: 'cierre'; lance: Lance; resultado: ResultadoApuesta; texto: string }

export interface ConfigMano {
  /** Probabilidad de que cada jugador pase sus señas al compañero tras cada reparto. */
  probSenas: [number, number, number, number]
  /** Probabilidad de que un rival pille cada seña. */
  probPillar: number
}

export const CONFIG_SIN_SENAS: ConfigMano = { probSenas: [0, 0, 0, 0], probPillar: 0 }

export interface EstadoMano {
  reglas: Reglas
  config: ConfigMano
  /** Marcador al empezar la mano. */
  marcador: Marcador
  manos: Carta[][]
  jugadas: Jugada[]
  mazo: Carta[]
  /** Descartes de rondas anteriores (se rebarajan si se acaba el mazo). */
  monton: Carta[]
  descartesRonda: (Carta[] | null)[]
  /** Rondas de descarte completadas. */
  ronda: number
  /** Cartas que conservó cada jugador en el último descarte (null si no hubo). */
  conservadas: (number | null)[]
  fase: Fase
  turno: Posicion | null
  decisionesMus: ('mus' | 'corto')[]
  cortadoPor: Posicion | null
  lance: Lance | null
  envite: EstadoEnvite | null
  apuestas: Partial<Record<'grandes' | 'chicas' | 'pares' | 'juego', ResultadoApuesta>>
  /** Piedras cobradas por "porque no" durante los envites. */
  cobrado: Marcador
  senas: SenaPasada[]
  eventos: EventoMano[]
  resultado: ResultadoMano | null
}

export function nuevaMano(reglas: Reglas, marcador: Marcador, rng: Rng, config: ConfigMano = CONFIG_SIN_SENAS): EstadoMano {
  // Baraja completa y se reparten las 16 primeras cartas.
  const mazo = extraer(BARAJA.slice(), 40, rng)
  const manos: Carta[][] = POSICIONES.map((p) => mazo.slice(p * 4, p * 4 + 4))
  mazo.splice(0, 16)
  const base: EstadoMano = {
    reglas,
    config,
    marcador,
    manos,
    jugadas: manos.map((m) => evaluar(m, reglas)),
    mazo,
    monton: [],
    descartesRonda: [null, null, null, null],
    ronda: 0,
    conservadas: [null, null, null, null],
    fase: 'mus',
    turno: 0,
    decisionesMus: [],
    cortadoPor: null,
    lance: null,
    envite: null,
    apuestas: {},
    cobrado: { mano: 0, postre: 0 },
    senas: [],
    eventos: [{ tipo: 'reparto', ronda: 0 }],
    resultado: null,
  }
  return { ...base, senas: pasarSenas(base, rng) }
}

/** Crea una mano con cartas concretas (para escenarios y simulaciones). */
export function manoDesdeCartas(
  reglas: Reglas,
  marcador: Marcador,
  manos: Carta[][],
  mazo: Carta[],
  config: ConfigMano = CONFIG_SIN_SENAS,
): EstadoMano {
  return {
    reglas,
    config,
    marcador,
    manos,
    jugadas: manos.map((m) => evaluar(m, reglas)),
    mazo,
    monton: [],
    descartesRonda: [null, null, null, null],
    ronda: 0,
    conservadas: [null, null, null, null],
    fase: 'mus',
    turno: 0,
    decisionesMus: [],
    cortadoPor: null,
    lance: null,
    envite: null,
    apuestas: {},
    cobrado: { mano: 0, postre: 0 },
    senas: [],
    eventos: [{ tipo: 'reparto', ronda: 0 }],
    resultado: null,
  }
}

/** Señas más informativas que permite una jugada (una por familia). */
export function senasPosibles(j: Jugada): Sena[] {
  const out: Sena[] = []
  if (j.reyes === 3) out.push('tresReyes')
  else if (j.reyes === 2) out.push('dosReyes')
  if (j.ases === 3) out.push('tresPitos')
  else if (j.ases === 2) out.push('dosPitos')
  if (j.pares.tipo === 'duples') out.push('duples')
  else if (j.pares.tipo === 'medias') out.push('medias')
  if (j.juego.puntos === 31) out.push('la31')
  else if (j.juego.tiene) out.push('juego')
  else if (j.juego.puntos === 30) out.push('treinta')
  if (out.length === 0 && SENAS.ciego.test(j)) out.push('ciego')
  return out
}

function pasarSenas(e: EstadoMano, rng: Rng): SenaPasada[] {
  const out: SenaPasada[] = []
  for (const p of POSICIONES) {
    if (rng() >= e.config.probSenas[p]) continue
    for (const sena of senasPosibles(e.jugadas[p])) {
      const rivales = POSICIONES.filter((r) => parejaDe(r) !== parejaDe(p))
      out.push({ de: p, sena, pillada: rivales.filter(() => rng() < e.config.probPillar) })
    }
  }
  return out
}

/** Señas que conoce `pos`: las de su compañero y las que ha pillado a los rivales. */
export function senasConocidas(e: EstadoMano, pos: Posicion): SenaPasada[] {
  return e.senas.filter((s) => s.de === companeroDe(pos) || s.pillada.includes(pos))
}

/** Acciones legales del jugador con el turno (para la interfaz). */
export function participantesLance(e: EstadoMano, lance: Lance): Posicion[] {
  return POSICIONES.filter((p) => participa(e.jugadas[p], lance))
}

export function aplicar(e: EstadoMano, accion: AccionMano, rng: Rng): EstadoMano {
  if (e.turno === null) throw new Error('La mano ha terminado')
  const pos = e.turno

  switch (e.fase) {
    case 'mus': {
      if (accion.tipo !== 'mus' && accion.tipo !== 'corto') throw new Error('Se espera mus o corto')
      const eventos: EventoMano[] = [...e.eventos, { tipo: 'mus', pos, corta: accion.tipo === 'corto' }]
      if (accion.tipo === 'corto') return empezarLances({ ...e, eventos, cortadoPor: pos, decisionesMus: [...e.decisionesMus, 'corto'] })
      if (pos < 3) return { ...e, eventos, decisionesMus: [...e.decisionesMus, 'mus'], turno: (pos + 1) as Posicion }
      return { ...e, eventos, decisionesMus: [], fase: 'descarte', turno: 0, descartesRonda: [null, null, null, null] }
    }

    case 'descarte': {
      if (accion.tipo !== 'descarte') throw new Error('Se espera un descarte')
      const mano = e.manos[pos]
      if (accion.cartas.length < 1 || accion.cartas.length > 4 || !accion.cartas.every((c) => mano.includes(c)))
        throw new Error('Descarte no válido: hay que soltar entre 1 y 4 cartas propias')
      const descartesRonda = e.descartesRonda.slice()
      descartesRonda[pos] = accion.cartas
      const eventos: EventoMano[] = [...e.eventos, { tipo: 'descarte', pos, cartas: accion.cartas.length }]
      if (pos < 3) return { ...e, eventos, descartesRonda, turno: (pos + 1) as Posicion }
      return repartirDescarte({ ...e, eventos, descartesRonda }, rng)
    }

    case 'envites': {
      if (accion.tipo !== 'envite' || !e.envite || !e.lance) throw new Error('Se espera una acción de envite')
      const faseEnvite = e.envite.fase
      const envite = aplicarEnvite(e.envite, accion.accion)
      const eventos: EventoMano[] = [
        ...e.eventos,
        { tipo: 'envite', lance: e.lance, pos, accion: accion.accion, texto: decirAccion(accion.accion, faseEnvite) },
      ]
      const s: EstadoMano = { ...e, envite, eventos, turno: envite.turno }
      return envite.fase === 'cerrado' ? cerrarLance(s, envite.resultado!) : s
    }

    case 'fin':
      throw new Error('La mano ha terminado')
  }
}

function repartirDescarte(e: EstadoMano, rng: Rng): EstadoMano {
  let mazo = e.mazo.slice()
  let monton = e.monton.slice()
  const ronda = e.descartesRonda as Carta[][]
  const necesarias = ronda.reduce((s, d) => s + d.length, 0)
  if (mazo.length < necesarias) {
    // Se rebarajan los descartes anteriores (no los de esta ronda).
    mazo = [...mazo, ...monton]
    monton = []
    for (let i = mazo.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[mazo[i], mazo[j]] = [mazo[j], mazo[i]]
    }
  }
  const manos = e.manos.map((m, p) => {
    const quedan = m.filter((c) => !ronda[p].includes(c))
    const nuevas = mazo.splice(mazo.length - ronda[p].length, ronda[p].length)
    return [...quedan, ...nuevas]
  })
  monton = [...monton, ...ronda.flat()]
  const s: EstadoMano = {
    ...e,
    manos,
    jugadas: manos.map((m) => evaluar(m, e.reglas)),
    mazo,
    monton,
    ronda: e.ronda + 1,
    conservadas: ronda.map((d) => 4 - d.length),
    descartesRonda: [null, null, null, null],
    fase: 'mus',
    turno: 0,
    decisionesMus: [],
    eventos: [...e.eventos, { tipo: 'reparto', ronda: e.ronda + 1 }],
  }
  return { ...s, senas: pasarSenas(s, rng) }
}

function empezarLances(e: EstadoMano): EstadoMano {
  return abrirLance({ ...e, fase: 'envites' }, 'grandes')
}

/** Abre un lance; si no hay disputa (pares/juego de una sola pareja) lo cierra en paso y sigue. */
function abrirLance(e: EstadoMano, lance: Lance): EstadoMano {
  let s: EstadoMano = { ...e, lance }
  if (lance === 'pares' || lance === 'juego') {
    const declaraciones: EventoMano[] = POSICIONES.map((pos) => ({
      tipo: 'declaracion' as const,
      lance,
      pos,
      tiene: participa(e.jugadas[pos], lance),
    }))
    s = { ...s, eventos: [...s.eventos, ...declaraciones] }
    if (quienDeclara(e.jugadas, lance) !== 'ambas') return cerrarLance({ ...s, envite: null }, { tipo: 'paso' }, true)
  }
  const envite = iniciarEnvite(lance, participantesLance(s, lance))
  return { ...s, envite, turno: envite.turno }
}

function siguienteLance(e: EstadoMano, actual: Lance): Lance | null {
  if (actual === 'grandes') return 'chicas'
  if (actual === 'chicas') return 'pares'
  if (actual === 'pares') return seJuegaPunto(e.jugadas) ? 'punto' : 'juego'
  return null
}

function cerrarLance(e: EstadoMano, resultado: ResultadoApuesta, sinDisputa = false): EstadoMano {
  const lance = e.lance!
  const clave = lance === 'punto' ? 'juego' : lance
  const apuestas = { ...e.apuestas, [clave]: resultado }
  const cobrado = { ...e.cobrado }
  if (resultado.tipo === 'noQuerido') cobrado[resultado.ganador] += resultado.piedras
  const eventos: EventoMano[] = sinDisputa
    ? e.eventos
    : [...e.eventos, { tipo: 'cierre', lance, resultado, texto: textoCierre(lance, resultado) }]
  let s: EstadoMano = { ...e, apuestas, cobrado, eventos, envite: null, turno: null }

  const objetivo = e.reglas.piedras
  const llega = (['mano', 'postre'] as Pareja[]).some((p) => e.marcador[p] + cobrado[p] >= objetivo)
  const sig = siguienteLance(s, lance)
  if (resultado.tipo === 'ordago' || llega || sig === null) return terminar(s)
  s = abrirLance(s, sig)
  return s
}

function terminar(e: EstadoMano): EstadoMano {
  const a: Apuestas = {
    grandes: e.apuestas.grandes ?? { tipo: 'paso' },
    chicas: e.apuestas.chicas ?? { tipo: 'paso' },
    pares: e.apuestas.pares ?? { tipo: 'paso' },
    juego: e.apuestas.juego ?? { tipo: 'paso' },
  }
  // Si la mano acabó antes (órdago querido o "porque no" que da el juego), los lances
  // no jugados quedan en paso: el recuento se detiene antes de llegar a ellos.
  const resultado = resolverMano(e.jugadas, a, e.marcador, e.reglas)
  return { ...e, fase: 'fin', turno: null, lance: null, envite: null, resultado }
}

function textoCierre(lance: Lance, r: ResultadoApuesta): string {
  const n = NOMBRE_LANCE[lance]
  switch (r.tipo) {
    case 'paso':
      return `${n}: en paso`
    case 'querido':
      return `${n}: ${r.piedras} queridas`
    case 'noQuerido':
      return `${n}: no quiero (${r.piedras} para la ${r.ganador === 'mano' ? 'pareja mano' : 'pareja postre'})`
    case 'ordago':
      return `${n}: ¡órdago querido!`
  }
}
