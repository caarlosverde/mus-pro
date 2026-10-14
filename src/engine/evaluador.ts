import { crearRng, extraer, type Rng } from './azar'
import { BARAJA, type Carta } from './cartas'
import { PERSONALIDAD_POR_ID, politica, probAccion, type Personalidad } from './bots'
import { accionesLegales } from './envites'
import type { InfoJugador } from './informacion'
import { aplicar, manoDesdeCartas, senasConocidas, senasPosibles, type AccionMano, type EstadoMano, type SenaPasada } from './mano'
import { POSICIONES, companeroDe, parejaDe, rival, type Posicion } from './mesa'
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
  /**
   * Margen de error (dos errores estándar) de la diferencia con la mejor
   * alternativa. Si la diferencia es menor, las dos opciones son
   * estadísticamente indistinguibles con esta simulación.
   */
  margen: number
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
  }
  s = { ...s, senas: senasCoherentes(e, s, heroe, rng) }
  let peso = pesoSenasCompanero(e, s, heroe)
  if (peso === 0) return null
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

/**
 * Lo que el compañero NO ha señalado también informa: quien hace señas pasa
 * todas las que tiene. Si te ha pasado sólo "dos reyes", no lleva medias ni la
 * 31; si no ha pasado ninguna, lo más probable es que no tenga nada que pasar.
 * Si alguna seña suya no se vio, no se puede deducir nada de las ausencias.
 */
function pesoSenasCompanero(real: EstadoMano, sim: EstadoMano, heroe: Posicion): number {
  const comp = companeroDe(heroe)
  const suyas = real.senas.filter((x) => x.de === comp)
  if (suyas.some((x) => x.noVista)) return 1
  const posibles = senasPosibles(sim.jugadas[comp])
  if (suyas.length === 0) return posibles.length === 0 ? 1 : 1 - real.config.probSenas[comp]
  const vistas = new Set(suyas.map((x) => x.sena))
  return posibles.length === vistas.size && posibles.every((x) => vistas.has(x)) ? 1 : 0
}

/**
 * Señas del reparto reconstruido. Las que conoce el héroe (las suyas, las de su
 * compañero y las que ha pillado) se mantienen: el reparto ya es compatible con
 * ellas. Las demás no las conoce, así que se generan de nuevo a partir de las
 * cartas simuladas (copiar las reales filtraría información de las cartas
 * verdaderas a los bots de la simulación).
 */
function senasCoherentes(real: EstadoMano, sim: EstadoMano, heroe: Posicion, rng: Rng): SenaPasada[] {
  const comp = companeroDe(heroe)
  const conocidas = real.senas.filter((x) => x.de === heroe || x.de === comp || x.pillada.includes(heroe))
  const out: SenaPasada[] = conocidas.slice()
  for (const p of POSICIONES) {
    if (p === heroe || p === comp) continue
    // Si el héroe pilló alguna seña de este rival, ya sabemos que las pasó: se respetan esas.
    if (conocidas.some((x) => x.de === p)) continue
    if (rng() >= real.config.probSenas[p]) continue
    const rivales = POSICIONES.filter((r) => parejaDe(r) !== parejaDe(p) && r !== heroe)
    for (const sena of senasPosibles(sim.jugadas[p])) out.push({ de: p, sena, pillada: rivales.filter(() => rng() < real.config.probPillar) })
  }
  return out
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
  const valores: number[][] = opciones.map(() => [])
  const pesos: number[] = []
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
      valores[k].push(v.pJuego)
      acum[k].piedras += rec.peso * v.piedras
    })
    pesos.push(rec.peso)
    sumaPesos += rec.peso
    sumaPesos2 += rec.peso * rec.peso
  }
  if (sumaPesos === 0) return null

  // Margen de cada alternativa respecto a la mejor, con diferencias emparejadas
  // (mismos repartos y semilla): el ruido común se cancela.
  const medias = acum.map((a) => a.pJuego / sumaPesos)
  const mejor = medias.indexOf(Math.max(...medias))
  const efectivas = (sumaPesos * sumaPesos) / sumaPesos2
  const margenes = opciones.map((_, k) => {
    if (k === mejor) return 0
    const d = pesos.map((_, i) => valores[mejor][i] - valores[k][i])
    const media = d.reduce((acc, x, i) => acc + pesos[i] * x, 0) / sumaPesos
    const varianza = d.reduce((acc, x, i) => acc + pesos[i] * (x - media) ** 2, 0) / sumaPesos
    return 2 * Math.sqrt(varianza / Math.max(1, efectivas))
  })
  return {
    alternativas: opciones.map((accion, k) => ({
      accion,
      pJuego: acum[k].pJuego / sumaPesos,
      piedras: acum[k].piedras / sumaPesos,
      margen: margenes[k],
    })),
    muestrasEfectivas: (sumaPesos * sumaPesos) / sumaPesos2,
  }
}
