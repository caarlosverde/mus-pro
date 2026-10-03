import { BARAJA } from './cartas'
import { evaluar, type Jugada } from './evaluacion'
import type { Lance } from './mesa'
import type { Reglas } from './reglas'

/**
 * Distribución de las claves de cada lance sobre todas las manos posibles
 * (91.390), para saber en microsegundos qué fracción de manos supera una dada.
 *
 * - grandes, chicas: sobre todas las manos.
 * - pares: sólo entre manos con pares. juego: sólo entre manos con juego.
 * - punto: sólo entre manos sin juego.
 */
interface Tabla {
  claves: Float64Array // ordenadas de menor a mayor
}

export interface TablasFuerza {
  grandes: Tabla
  chicas: Tabla
  pares: Tabla
  juego: Tabla
  punto: Tabla
  /** Probabilidad de que una mano al azar tenga pares / juego. */
  pPares: number
  pJuego: number
}

const cache = new Map<string, TablasFuerza>()

export function tablasFuerza(reglas: Reglas): TablasFuerza {
  const clave = `${reglas.reyes}-${reglas.laReal}`
  const hecha = cache.get(clave)
  if (hecha) return hecha

  const g: number[] = []
  const c: number[] = []
  const p: number[] = []
  const j: number[] = []
  const pu: number[] = []
  for (let a = 0; a < 40; a++)
    for (let b = a + 1; b < 40; b++)
      for (let d = b + 1; d < 40; d++)
        for (let e = d + 1; e < 40; e++) {
          const ju = evaluar([BARAJA[a], BARAJA[b], BARAJA[d], BARAJA[e]], reglas)
          g.push(ju.claveGrandes)
          c.push(ju.claveChicas)
          if (ju.clavePares > 0) p.push(ju.clavePares)
          if (ju.juego.tiene) j.push(ju.claveJuego)
          else pu.push(ju.clavePunto)
        }
  const tabla = (xs: number[]): Tabla => ({ claves: Float64Array.from(xs).sort() })
  const total = g.length
  const t: TablasFuerza = {
    grandes: tabla(g),
    chicas: tabla(c),
    pares: tabla(p),
    juego: tabla(j),
    punto: tabla(pu),
    pPares: p.length / total,
    pJuego: j.length / total,
  }
  cache.set(clave, t)
  return t
}

/** Número de elementos estrictamente menores / menores o iguales que `x`. */
function contar(arr: Float64Array, x: number, inclusivo: boolean): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (arr[m] < x || (inclusivo && arr[m] === x)) lo = m + 1
    else hi = m
  }
  return lo
}

export interface Percentil {
  /** Fracción de manos (de la población del lance) estrictamente peores. */
  peor: number
  /** Fracción de manos exactamente iguales (el empate lo decide la posición). */
  igual: number
}

export function claveLance(j: Jugada, lance: Lance): number {
  switch (lance) {
    case 'grandes':
      return j.claveGrandes
    case 'chicas':
      return j.claveChicas
    case 'pares':
      return j.clavePares
    case 'juego':
      return j.claveJuego
    case 'punto':
      return j.clavePunto
  }
}

/** Percentil de una jugada en un lance, frente a la población de ese lance. */
export function percentil(j: Jugada, lance: Lance, t: TablasFuerza): Percentil {
  const tabla = t[lance]
  const k = claveLance(j, lance)
  const n = tabla.claves.length
  const menores = contar(tabla.claves, k, false)
  const menoresIgual = contar(tabla.claves, k, true)
  return { peor: menores / n, igual: (menoresIgual - menores) / n }
}

/** Probabilidad de ganar a un rival concreto, dado si le ganamos los empates. */
export function ganarA(p: Percentil, ganoEmpates: boolean): number {
  return p.peor + (ganoEmpates ? p.igual : 0)
}
