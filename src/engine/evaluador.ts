import { crearRng, extraer, type Rng } from './azar'
import { BARAJA, type Carta } from './cartas'
import { PERSONALIDAD_POR_ID, politica, probAccion, type Personalidad } from './bots'
import { accionesLegales } from './envites'
import type { InfoJugador } from './informacion'
import { aplicar, manoDesdeCartas, senasConocidas, type AccionMano, type EstadoMano } from './mano'
import { POSICIONES, parejaDe, rival, type Posicion } from './mesa'
import { agenteBot, jugarHastaFin, type Agente } from './partida'
import { estimarDesdeMarcador } from './problemas'
import { crearMuestreador, type Escenario } from './simulacion'

/**
 * Evaluación de decisiones por simulación ("rollouts").
 *
 * 1. Se generan repartos de las cartas ocultas compatibles con lo que sabe el
 *    jugador (sus cartas, señas vistas, declaraciones, cartas conservadas).
 * 2. Cada reparto se pondera por la probabilidad de que los bots hubieran hecho
 *    lo que hicieron en esta ronda con esas cartas (inferencia bayesiana).
 * 3. Desde el punto de decisión se juega la mano hasta el final con cada
 *    alternativa, con los mismos repartos y la misma semilla para todas.
 *
 * Tras la decisión, el propio jugador sigue jugando con la política
 * "equilibrada": el resultado mide la decisión, no lo que hagas después.
 */

export interface ResultadoAlternativa {
  accion: AccionMano
  /** Probabilidad estimada de ganar el juego. */
  pJuego: number
  /** Piedras netas medias de la mano (tu pareja menos la rival). */
  piedras: number
}

export interface Evaluacion {
  alternativas: ResultadoAlternativa[]
  /** Tamaño efectivo de la muestra tras ponderar. */
  muestrasEfectivas: number
}

export interface OpcionesEvaluacion {
  /** Personalidad de cada posición (la del héroe se ignora). */
  personalidades: Personalidad[]
  muestras?: number
  semilla?: number
}

/** Información que el héroe tiene de cada jugador en el momento de decidir. */
function escenarioVisible(e: EstadoMano, heroe: Posicion): Escenario {
  const conocidas = senasConocidas(e, heroe)
  const declarado = (lance: 'pares' | 'juego', pos: Posicion) => {
    const ev = e.eventos.findLast((x) => x.tipo === 'declaracion' && x.lance === lance && x.pos === pos)
    return ev && ev.tipo === 'declaracion' ? ev.tiene : undefined
  }
  const jugadores = POSICIONES.map((p): InfoJugador => {
    if (p === heroe) return { mano: e.manos[heroe] }
    return {
      senas: conocidas.filter((s) => s.de === p).map((s) => s.sena),
      pares: declarado('pares', p),
      juego: declarado('juego', p),
      seQuedoCon: e.ronda > 0 ? (e.conservadas[p] ?? undefined) : undefined,
    }
  }) as Escenario['jugadores']
  return { jugadores }
}

/** Acciones de la ronda actual (desde el último reparto), en orden. */
function accionesRonda(e: EstadoMano): { pos: Posicion; accion: AccionMano }[] {
  const ini = e.eventos.findLastIndex((x) => x.tipo === 'reparto')
  const out: { pos: Posicion; accion: AccionMano }[] = []
  for (const ev of e.eventos.slice(ini + 1)) {
    if (ev.tipo === 'mus') out.push({ pos: ev.pos, accion: { tipo: ev.corta ? 'corto' : 'mus' } })
    else if (ev.tipo === 'envite') out.push({ pos: ev.pos, accion: { tipo: 'envite', accion: ev.accion } })
  }
  return out
}

/**
 * Reconstruye el estado actual con otras cartas ocultas, repitiendo las
 * acciones de la ronda, y calcula el peso (verosimilitud) del reparto.
 */
function reconstruir(
  e: EstadoMano,
  heroe: Posicion,
  manos: Carta[][],
  personalidades: Personalidad[],
  rng: Rng,
): { estado: EstadoMano; peso: number } | null {
  const usadas = new Set(manos.flat())
  const mazo = extraer(
    BARAJA.filter((c) => !usadas.has(c)),
    40 - usadas.size,
    rng,
  )
  let s: EstadoMano = {
    ...manoDesdeCartas(e.reglas, e.marcador, manos, mazo, e.config),
    ronda: e.ronda,
    conservadas: e.conservadas,
    senas: e.senas,
  }
  let peso = 1
  for (const { pos, accion } of accionesRonda(e)) {
    if (pos !== heroe) {
      peso *= probAccion(politica(s, pos, personalidades[pos]), accion)
      if (peso < 1e-12) return null
    }
    try {
      s = aplicar(s, accion, rng)
    } catch {
      return null // la acción no es legal con estas cartas (p. ej. declaraciones distintas)
    }
  }
  if (s.turno !== e.turno || s.fase !== e.fase) return null
  return { estado: s, peso }
}

function valorFinal(fin: EstadoMano, heroe: Posicion): { pJuego: number; piedras: number } {
  const r = fin.resultado!
  const nos = parejaDe(heroe)
  const ellos = rival(nos)
  const piedras = r.marcador[nos] - fin.marcador[nos] - (r.marcador[ellos] - fin.marcador[ellos])
  if (r.ganadorJuego) return { pJuego: r.ganadorJuego === nos ? 1 : 0, piedras }
  const objetivo = fin.reglas.piedras
  return { pJuego: estimarDesdeMarcador(objetivo - r.marcador[nos], objetivo - r.marcador[ellos]), piedras }
}

/** Alternativas razonables para el jugador con el turno. */
export function alternativas(e: EstadoMano): AccionMano[] {
  if (e.fase === 'mus') return [{ tipo: 'mus' }, { tipo: 'corto' }]
  if (e.fase === 'envites' && e.envite) {
    const legales = accionesLegales(e.envite)
    const out: AccionMano[] = []
    for (const t of legales) {
      if (t === 'envido') {
        out.push({ tipo: 'envite', accion: { tipo: 'envido', piedras: 2 } })
        if (e.envite.fase === 'apertura') out.push({ tipo: 'envite', accion: { tipo: 'envido', piedras: 4 } })
      } else out.push({ tipo: 'envite', accion: { tipo: t } })
    }
    return out
  }
  return []
}

export function evaluarDecision(
  e: EstadoMano,
  heroe: Posicion,
  opciones: AccionMano[],
  cfg: OpcionesEvaluacion,
): Evaluacion | null {
  const rng = crearRng(cfg.semilla ?? 1)
  const n = cfg.muestras ?? 400
  const muestreador = crearMuestreador(escenarioVisible(e, heroe), e.reglas)
  if (!muestreador) return null

  const referencia = PERSONALIDAD_POR_ID.equilibrado
  const agentes: Agente[] = POSICIONES.map((p) => agenteBot(p === heroe ? referencia : cfg.personalidades[p]))
  const acum = opciones.map(() => ({ pJuego: 0, piedras: 0 }))
  let sumaPesos = 0
  let sumaPesos2 = 0

  for (let i = 0, intentos = 0; i < n && intentos < n * 20; intentos++) {
    const reparto = muestreador(rng)
    if (!reparto) break
    const rec = reconstruir(e, heroe, reparto.manos, cfg.personalidades, rng)
    if (!rec) continue
    i++
    const semilla = Math.floor(rng() * 2 ** 31)
    opciones.forEach((op, k) => {
      const r2 = crearRng(semilla)
      const tras = aplicar(rec.estado, op, r2)
      const fin = tras.fase === 'fin' ? tras : jugarHastaFin(tras, agentes, r2)
      const v = valorFinal(fin, heroe)
      acum[k].pJuego += rec.peso * v.pJuego
      acum[k].piedras += rec.peso * v.piedras
    })
    sumaPesos += rec.peso
    sumaPesos2 += rec.peso * rec.peso
  }
  if (sumaPesos === 0) return null
  return {
    alternativas: opciones.map((accion, k) => ({
      accion,
      pJuego: acum[k].pJuego / sumaPesos,
      piedras: acum[k].piedras / sumaPesos,
    })),
    muestrasEfectivas: (sumaPesos * sumaPesos) / sumaPesos2,
  }
}
