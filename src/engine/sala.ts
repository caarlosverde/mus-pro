import type { Rng } from './azar'
import { PERSONALIDAD_POR_ID, decidir } from './bots'
import type { Carta } from './cartas'
import { accionesLegales, type AccionEnvite } from './envites'
import type { Sena } from './informacion'
import { aplicar, type AccionMano, type EventoMano } from './mano'
import { companeroDe, type Lance, type Posicion } from './mesa'
import {
  asientoDe,
  equipoDe,
  nuevaPartida,
  posicionDe,
  siguienteMano,
  type Asiento,
  type Equipo,
  type EstadoPartida,
} from './partida'
import type { Reglas } from './reglas'

/**
 * Lógica de una mesa con asientos humanos y bots. Es la misma para la
 * partida local contra bots y para las mesas online (el servidor la ejecuta
 * y envía a cada jugador sólo su `VistaMesa`, sin las cartas ajenas).
 *
 * Funciones puras: reciben el estado y devuelven uno nuevo.
 */

export type Ocupante =
  | { tipo: 'humano'; id: string; nombre: string; conectado: boolean; desconectadoDesde: number | null; senasAuto: boolean }
  | { tipo: 'bot'; personalidad: string }

export interface MensajeChat {
  de: Asiento | null
  nombre: string
  texto: string
  t: number
}

export interface ResultadoVaca {
  ganador: Equipo
  juegos: [number, number]
  /** Ocupantes humanos de cada asiento al terminar. */
  humanos: { asiento: Asiento; id: string; nombre: string }[]
}

export interface Sala {
  codigo: string
  publica: boolean
  reglas: Reglas
  asientos: (Ocupante | null)[]
  fase: 'esperando' | 'jugando' | 'terminada'
  partida: EstadoPartida | null
  /** Humanos que han pulsado "siguiente mano" (por asiento). */
  listos: boolean[]
  /** Momento en que terminó la mano actual (para avanzar solo). */
  finManoEn: number | null
  chat: MensajeChat[]
  resultado: ResultadoVaca | null
  version: number
}

export const NOMBRES_ASIENTO_BOT = ['Bot norte', 'Bot este', 'Bot sur', 'Bot oeste']

export function nuevaSala(codigo: string, reglas: Reglas, publica: boolean): Sala {
  return {
    codigo,
    publica,
    reglas,
    asientos: [null, null, null, null],
    fase: 'esperando',
    partida: null,
    listos: [false, false, false, false],
    finManoEn: null,
    chat: [],
    resultado: null,
    version: 0,
  }
}

const tocar = (s: Sala): Sala => ({ ...s, version: s.version + 1 })

export function asientoDeUsuario(s: Sala, id: string): Asiento | null {
  const i = s.asientos.findIndex((o) => o?.tipo === 'humano' && o.id === id)
  return i < 0 ? null : (i as Asiento)
}

export function humanos(s: Sala): number {
  return s.asientos.filter((o) => o?.tipo === 'humano').length
}

/**
 * Sienta a un usuario (o lo reconecta si ya estaba). Si la partida ya ha
 * empezado, sólo puede ocupar el asiento de un bot.
 */
export function sentar(s: Sala, usuario: { id: string; nombre: string }, preferido?: Asiento): { sala: Sala; asiento: Asiento | null } {
  const ya = asientoDeUsuario(s, usuario.id)
  if (ya !== null) return { sala: reconectar(s, usuario.id, true), asiento: ya }

  const libre = (i: number) => s.asientos[i] === null || (s.fase === 'jugando' && s.asientos[i]?.tipo === 'bot')
  const orden = preferido !== undefined ? [preferido, 0, 2, 1, 3] : [0, 2, 1, 3]
  const asiento = orden.find((i) => libre(i))
  if (asiento === undefined || s.fase === 'terminada') return { sala: s, asiento: null }

  const asientos = s.asientos.slice()
  asientos[asiento] = { tipo: 'humano', id: usuario.id, nombre: usuario.nombre, conectado: true, desconectadoDesde: null, senasAuto: true }
  return { sala: tocar({ ...s, asientos }), asiento: asiento as Asiento }
}

/** Antes de empezar, un jugador puede levantarse. Durante la partida, sólo se desconecta. */
export function levantar(s: Sala, id: string): Sala {
  const a = asientoDeUsuario(s, id)
  if (a === null) return s
  if (s.fase !== 'esperando') return reconectar(s, id, false)
  const asientos = s.asientos.slice()
  asientos[a] = null
  return tocar({ ...s, asientos })
}

export function reconectar(s: Sala, id: string, conectado: boolean, ahora = Date.now()): Sala {
  const a = asientoDeUsuario(s, id)
  if (a === null) return s
  const o = s.asientos[a]
  if (o?.tipo !== 'humano' || o.conectado === conectado) return s
  const asientos = s.asientos.slice()
  asientos[a] = { ...o, conectado, desconectadoDesde: conectado ? null : ahora }
  return tocar({ ...s, asientos })
}

/** Empieza la vaca: los asientos vacíos se ocupan con bots. */
export function empezar(s: Sala, rng: Rng, personalidadBots = 'equilibrado'): Sala {
  if (s.fase !== 'esperando') return s
  const asientos = s.asientos.map((o) => o ?? ({ tipo: 'bot', personalidad: personalidadBots } as Ocupante))
  const probSenas = asientos.map((o) =>
    o!.tipo === 'humano' ? (o!.senasAuto ? 1 : 0) : (PERSONALIDAD_POR_ID[o!.personalidad]?.senas ?? 0.9),
  ) as [number, number, number, number]
  const partida = nuevaPartida(s.reglas, { probSenas, probPillar: 0.2 }, rng, Math.floor(rng() * 4) as Asiento)
  return tocar({ ...s, asientos, fase: 'jugando', partida, listos: [false, false, false, false], finManoEn: null })
}

export class ErrorSala extends Error {}

/** Aplica la acción del jugador sentado en `asiento`, validando que sea su turno y que sea legal. */
export function jugar(s: Sala, asiento: Asiento, accion: AccionMano, rng: Rng, ahora = Date.now()): Sala {
  const p = s.partida
  if (s.fase !== 'jugando' || !p) throw new ErrorSala('La partida no está en juego')
  const e = p.mano
  if (e.turno === null || asientoDe(p, e.turno) !== asiento) throw new ErrorSala('No es tu turno')
  validar(e, e.turno, accion)
  const mano = aplicar(e, accion, rng)
  return tocar({ ...s, partida: { ...p, mano }, finManoEn: mano.fase === 'fin' ? ahora : null })
}

function validar(e: EstadoPartida['mano'], pos: Posicion, a: AccionMano) {
  if (e.fase === 'mus' && (a.tipo === 'mus' || a.tipo === 'corto')) return
  if (e.fase === 'descarte' && a.tipo === 'descarte') {
    const mano = e.manos[pos]
    if (a.cartas.length >= 1 && a.cartas.length <= 4 && new Set(a.cartas).size === a.cartas.length && a.cartas.every((c) => mano.includes(c))) return
    throw new ErrorSala('Descarte no válido')
  }
  if (e.fase === 'envites' && a.tipo === 'envite' && e.envite) {
    const legales = accionesLegales(e.envite)
    if (!legales.includes(a.accion.tipo)) throw new ErrorSala('Acción no permitida ahora')
    if (a.accion.tipo === 'envido' && (!Number.isInteger(a.accion.piedras) || a.accion.piedras < 2 || a.accion.piedras > 99))
      throw new ErrorSala('Envite no válido')
    return
  }
  throw new ErrorSala('Acción no permitida ahora')
}

/** Segundos que se espera a un humano desconectado antes de que juegue un bot por él. */
export const ESPERA_DESCONECTADO_MS = 45_000
/** Tras la mano, se pasa a la siguiente aunque no todos hayan pulsado. */
export const ESPERA_SIGUIENTE_MS = 25_000

/** Asiento al que le toca y debe jugar automáticamente (bot o humano ausente), si alguno. */
export function turnoAutomatico(s: Sala, ahora = Date.now()): Asiento | null {
  const p = s.partida
  if (s.fase !== 'jugando' || !p || p.mano.turno === null) return null
  const a = asientoDe(p, p.mano.turno)
  const o = s.asientos[a]
  if (o?.tipo === 'bot') return a
  if (o?.tipo === 'humano' && !o.conectado && o.desconectadoDesde !== null && ahora - o.desconectadoDesde >= ESPERA_DESCONECTADO_MS) return a
  return null
}

/** Juega la decisión de un bot (o del bot que sustituye a un humano ausente). */
export function jugarAutomatico(s: Sala, asiento: Asiento, rng: Rng, ahora = Date.now()): Sala {
  const p = s.partida!
  const o = s.asientos[asiento]
  const per = PERSONALIDAD_POR_ID[o?.tipo === 'bot' ? o.personalidad : 'equilibrado'] ?? PERSONALIDAD_POR_ID.equilibrado
  const pos = posicionDe(p, asiento)
  return jugar(s, asiento, decidir(p.mano, pos, per, rng), rng, ahora)
}

/** Un humano está listo para la siguiente mano. */
export function marcarListo(s: Sala, asiento: Asiento): Sala {
  if (!s.partida || s.partida.mano.fase !== 'fin') return s
  const listos = s.listos.slice()
  listos[asiento] = true
  return tocar({ ...s, listos })
}

/** Si la mano terminó y todos los humanos conectados están listos (o pasó el tiempo), reparte la siguiente. */
export function avanzarSiProcede(s: Sala, rng: Rng, ahora = Date.now()): Sala {
  const p = s.partida
  if (s.fase !== 'jugando' || !p || p.mano.fase !== 'fin') return s
  const pendientes = s.asientos.some((o, i) => o?.tipo === 'humano' && o.conectado && !s.listos[i])
  const agotado = s.finManoEn !== null && ahora - s.finManoEn >= ESPERA_SIGUIENTE_MS
  if (pendientes && !agotado) return s
  const sig = siguienteMano(p, rng)
  if (sig.ganadorVaca !== null) {
    const humanosFin = s.asientos.flatMap((o, i) => (o?.tipo === 'humano' ? [{ asiento: i as Asiento, id: o.id, nombre: o.nombre }] : []))
    return tocar({ ...s, partida: sig, fase: 'terminada', resultado: { ganador: sig.ganadorVaca, juegos: sig.juegos, humanos: humanosFin } })
  }
  return tocar({ ...s, partida: sig, listos: [false, false, false, false], finManoEn: null })
}

export function decir(s: Sala, asiento: Asiento | null, nombre: string, texto: string, ahora = Date.now()): Sala {
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 140)
  if (!limpio) return s
  return tocar({ ...s, chat: [...s.chat, { de: asiento, nombre, texto: limpio, t: ahora }].slice(-60) })
}

// ---------------------------------------------------------------------------
// Vista de un jugador
// ---------------------------------------------------------------------------

export interface JugadorVista {
  asiento: Asiento
  nombre: string
  tipo: 'humano' | 'bot' | 'vacio'
  personalidad?: string
  conectado: boolean
}

export type EventoVista =
  | { tipo: 'reparto'; ronda: number }
  | { tipo: 'mus'; asiento: Asiento; corta: boolean }
  | { tipo: 'descarte'; asiento: Asiento; cartas: number }
  | { tipo: 'declaracion'; lance: 'pares' | 'juego'; asiento: Asiento; tiene: boolean }
  | { tipo: 'envite'; lance: Lance; asiento: Asiento; texto: string }
  | { tipo: 'cierre'; lance: Lance; texto: string }

export interface SenaVista {
  de: Asiento
  sena: Sena
  /** propia: la que tú has pasado; companero: la que te pasa; pillada: la que has visto a un rival. */
  como: 'propia' | 'companero' | 'pillada'
}

export interface ManoVista {
  fase: EstadoPartida['mano']['fase']
  turno: Asiento | null
  lance: Lance | null
  ronda: number
  /** Cartas por asiento; `null` si no las puedes ver. */
  cartas: (Carta[] | null)[]
  envite: { fase: 'apertura' | 'respuesta' | 'cerrado'; apostado: number; porqueNo: number; ordago: boolean; legales: AccionEnvite['tipo'][] } | null
  eventos: EventoVista[]
  senas: SenaVista[]
  /** Piedras de cada equipo incluyendo los "porque no" ya cobrados en esta mano. */
  tantos: [number, number]
  recuento: { motivo: string; equipo: Equipo; piedras: number }[] | null
  ganadorJuego: Equipo | null
}

export interface VistaMesa {
  codigo: string
  publica: boolean
  fase: Sala['fase']
  reglas: Reglas
  miAsiento: Asiento | null
  jugadores: JugadorVista[]
  asientoMano: Asiento | null
  juegos: [number, number]
  mano: ManoVista | null
  listos: boolean[]
  chat: MensajeChat[]
  resultado: { ganador: Equipo; juegos: [number, number] } | null
  version: number
}

export function vistaPara(s: Sala, miAsiento: Asiento | null): VistaMesa {
  const jugadores: JugadorVista[] = s.asientos.map((o, i) => {
    const asiento = i as Asiento
    if (!o) return { asiento, nombre: 'Libre', tipo: 'vacio', conectado: false }
    if (o.tipo === 'bot') {
      const per = PERSONALIDAD_POR_ID[o.personalidad]
      return { asiento, nombre: per?.nombre ?? 'Bot', tipo: 'bot', personalidad: o.personalidad, conectado: true }
    }
    return { asiento, nombre: o.nombre, tipo: 'humano', conectado: o.conectado }
  })
  const p = s.partida
  return {
    codigo: s.codigo,
    publica: s.publica,
    fase: s.fase,
    reglas: s.reglas,
    miAsiento,
    jugadores,
    asientoMano: p ? p.asientoMano : null,
    juegos: p ? p.juegos : [0, 0],
    mano: p ? vistaMano(p, miAsiento) : null,
    listos: s.listos,
    chat: s.chat,
    resultado: s.resultado ? { ganador: s.resultado.ganador, juegos: s.resultado.juegos } : null,
    version: s.version,
  }
}

function vistaMano(p: EstadoPartida, miAsiento: Asiento | null): ManoVista {
  const e = p.mano
  const aAsiento = (pos: Posicion) => asientoDe(p, pos)
  const fin = e.fase === 'fin'
  const miPos = miAsiento === null ? null : posicionDe(p, miAsiento)
  const eqMano = equipoDe(p.asientoMano)
  const equipoDePareja = (pareja: 'mano' | 'postre'): Equipo => (pareja === 'mano' ? eqMano : ((1 - eqMano) as Equipo))

  const cartas = ([0, 1, 2, 3] as Asiento[]).map((a) => {
    const pos = posicionDe(p, a)
    return fin || pos === miPos ? e.manos[pos] : null
  })

  const senas: SenaVista[] = []
  if (miPos !== null) {
    for (const sena of e.senas) {
      if (sena.de === miPos) senas.push({ de: aAsiento(sena.de), sena: sena.sena, como: 'propia' })
      else if (sena.de === companeroDe(miPos)) senas.push({ de: aAsiento(sena.de), sena: sena.sena, como: 'companero' })
      else if (sena.pillada.includes(miPos)) senas.push({ de: aAsiento(sena.de), sena: sena.sena, como: 'pillada' })
    }
  }

  const tantos: [number, number] = [0, 0]
  tantos[eqMano] = e.marcador.mano + e.cobrado.mano
  tantos[1 - eqMano] = e.marcador.postre + e.cobrado.postre
  if (fin && e.resultado) {
    tantos[eqMano] = e.resultado.marcador.mano
    tantos[1 - eqMano] = e.resultado.marcador.postre
  }

  return {
    fase: e.fase,
    turno: e.turno === null ? null : aAsiento(e.turno),
    lance: e.lance,
    ronda: e.ronda,
    cartas,
    envite: e.envite
      ? { fase: e.envite.fase, apostado: e.envite.apostado, porqueNo: e.envite.porqueNo, ordago: e.envite.ordago, legales: accionesLegales(e.envite) }
      : null,
    eventos: e.eventos.map((ev) => eventoVista(ev, aAsiento)),
    senas,
    tantos,
    recuento: fin && e.resultado ? e.resultado.eventos.map((r) => ({ motivo: r.motivo, equipo: equipoDePareja(r.pareja), piedras: r.piedras })) : null,
    ganadorJuego: fin && e.resultado?.ganadorJuego ? equipoDePareja(e.resultado.ganadorJuego) : null,
  }
}

function eventoVista(ev: EventoMano, aAsiento: (p: Posicion) => Asiento): EventoVista {
  switch (ev.tipo) {
    case 'reparto':
      return ev
    case 'mus':
      return { tipo: 'mus', asiento: aAsiento(ev.pos), corta: ev.corta }
    case 'descarte':
      return { tipo: 'descarte', asiento: aAsiento(ev.pos), cartas: ev.cartas }
    case 'declaracion':
      return { tipo: 'declaracion', lance: ev.lance, asiento: aAsiento(ev.pos), tiene: ev.tiene }
    case 'envite':
      return { tipo: 'envite', lance: ev.lance, asiento: aAsiento(ev.pos), texto: ev.texto }
    case 'cierre':
      return { tipo: 'cierre', lance: ev.lance, texto: ev.texto }
  }
}

