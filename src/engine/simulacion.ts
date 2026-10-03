import { extraer, type Rng } from './azar'
import { BARAJA, type Carta } from './cartas'
import { evaluar, type Jugada } from './evaluacion'
import { cartasQueConserva, cumple, tieneRestricciones, type InfoJugador } from './informacion'
import { POSICIONES, type Posicion } from './mesa'
import type { Reglas } from './reglas'

export interface Escenario {
  /** Información de cada jugador, indexada por posición (0 = mano). */
  jugadores: [InfoJugador, InfoJugador, InfoJugador, InfoJugador]
  /** Cartas que se sabe que no están en ninguna mano (p. ej. tus descartes). */
  fuera?: Carta[]
}

export interface Reparto {
  manos: Carta[][]
  jugadas: Jugada[]
}

/** Intentos máximos para encontrar un reparto antes de declararlo imposible. */
const INTENTOS = 20000

/**
 * Prepara un muestreador de repartos compatibles con el escenario.
 *
 * - Jugadores con restricciones sobre su mano (señas, "pares sí/no"...):
 *   se enumeran una vez todas sus manos compatibles y en cada reparto se
 *   elige una al azar. Si las manos elegidas se solapan, se rechaza el
 *   reparto completo. Esto muestrea exactamente la distribución condicionada
 *   (todos los repartos compatibles son igual de probables).
 * - Jugadores de los que se sabe con cuántas cartas se quedaron: se simula
 *   su descarte con un modelo de comportamiento (ver `cartasQueConserva`).
 * - El resto recibe cartas al azar del mazo restante.
 *
 * Devuelve `null` si el escenario es imposible.
 */
export function crearMuestreador(escenario: Escenario, reglas: Reglas): ((rng: Rng) => Reparto | null) | null {
  const conocidas = new Set<Carta>(escenario.fuera ?? [])
  const fijas: [Posicion, Carta[]][] = []
  for (const p of POSICIONES) {
    const m = escenario.jugadores[p].mano
    if (m) {
      fijas.push([p, m])
      for (const c of m) conocidas.add(c)
    }
  }
  const mazoInicial = BARAJA.filter((c) => !conocidas.has(c))

  const restringidos: [Posicion, Carta[][]][] = []
  const descartadores: Posicion[] = []
  const libres: Posicion[] = []

  for (const p of POSICIONES) {
    const info = escenario.jugadores[p]
    if (info.mano) continue
    if (info.seQuedoCon !== undefined) descartadores.push(p)
    else if (tieneRestricciones(info)) {
      const validas = manosCompatibles(mazoInicial, info, reglas)
      if (validas.length === 0) return null
      restringidos.push([p, validas])
    } else libres.push(p)
  }
  // Los más restringidos primero: menos solapes que rechazar.
  restringidos.sort((a, b) => a[1].length - b[1].length)

  return (rng) => {
    for (let intento = 0; intento < INTENTOS; intento++) {
      const manos: Carta[][] = [[], [], [], []]
      for (const [p, m] of fijas) manos[p] = m
      const usadas = new Set<Carta>()
      let valido = true

      for (const [p, validas] of restringidos) {
        const mano = validas[Math.floor(rng() * validas.length)]
        if (mano.some((c) => usadas.has(c))) {
          valido = false
          break
        }
        for (const c of mano) usadas.add(c)
        manos[p] = mano
      }
      if (!valido) continue

      let mazo = mazoInicial.filter((c) => !usadas.has(c))
      for (const p of descartadores) {
        const r = simularDescarte(escenario.jugadores[p], mazo, reglas, rng)
        if (!r) {
          valido = false
          break
        }
        manos[p] = r.mano
        mazo = r.mazo
      }
      if (!valido) continue

      // `mazo` es una copia propia: `extraer` deja las elegidas al final y se recortan.
      for (const p of libres) {
        manos[p] = extraer(mazo, 4, rng)
        mazo.length -= 4
      }

      return { manos, jugadas: manos.map((m) => evaluar(m, reglas)) }
    }
    return null
  }
}

/** Todas las manos de 4 cartas del mazo que cumplen la información del jugador. */
function manosCompatibles(mazo: readonly Carta[], info: InfoJugador, reglas: Reglas): Carta[][] {
  const out: Carta[][] = []
  const n = mazo.length
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const mano = [mazo[a], mazo[b], mazo[c], mazo[d]]
          if (cumple(evaluar(mano, reglas), info)) out.push(mano)
        }
  return out
}

/** Modelo de descarte: mano previa → conserva N → roba el resto, y debe cumplir sus señas. */
function simularDescarte(
  info: InfoJugador,
  mazo: Carta[],
  reglas: Reglas,
  rng: Rng,
): { mano: Carta[]; mazo: Carta[] } | null {
  const trabajo = mazo.slice()
  for (let intento = 0; intento < 2000; intento++) {
    const previa = extraer(trabajo, 4, rng)
    const conservadas = cartasQueConserva(previa, reglas)
    if (conservadas.length !== info.seQuedoCon) continue
    const fuera = new Set(previa)
    const resto = mazo.filter((c) => !fuera.has(c))
    const nuevas = extraer(resto, 4 - conservadas.length, rng)
    const mano = [...conservadas, ...nuevas]
    if (cumple(evaluar(mano, reglas), info)) {
      const usadas = new Set([...previa, ...nuevas])
      return { mano, mazo: mazo.filter((c) => !usadas.has(c)) }
    }
  }
  return null
}

/** Un único reparto compatible (crea el muestreador cada vez: para usos puntuales). */
export function repartir(escenario: Escenario, reglas: Reglas, rng: Rng): Reparto | null {
  return crearMuestreador(escenario, reglas)?.(rng) ?? null
}

/**
 * Ejecuta hasta `n` repartos (o hasta agotar `limiteMs`) y llama a `visitar`
 * con cada uno. Devuelve el número de repartos válidos.
 */
export function simular(
  escenario: Escenario,
  reglas: Reglas,
  rng: Rng,
  n: number,
  visitar: (r: Reparto) => void,
  limiteMs = Infinity,
): number {
  const muestreador = crearMuestreador(escenario, reglas)
  if (!muestreador) return 0
  const inicio = Date.now()
  let validos = 0
  while (validos < n) {
    const r = muestreador(rng)
    if (!r) break
    validos++
    visitar(r)
    if ((validos & 63) === 0 && Date.now() - inicio > limiteMs) break
  }
  return validos
}
