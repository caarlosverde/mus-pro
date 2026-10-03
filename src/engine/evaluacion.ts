import { rangoEfectivo, numeroDe, type Carta } from './cartas'
import type { Reglas } from './reglas'

export type TipoPares = 'ninguno' | 'pareja' | 'medias' | 'duples'

export interface Pares {
  tipo: TipoPares
  /** Rango de la pareja/medias, o de la pareja alta en duples. */
  alto: number
  /** Rango de la pareja baja en duples (igual que `alto` en duples de cuatro iguales). */
  bajo: number
}

export interface Juego {
  /** Suma de la mano (figuras = 10). */
  puntos: number
  /** Tiene juego: suma de 31 o más. */
  tiene: boolean
  /** Es la Real (sólo si la variante la admite). */
  real: boolean
}

/**
 * Evaluación completa de una mano. Todas las claves numéricas siguen la
 * convención "mayor es mejor", de modo que comparar dos manos en un lance
 * es comparar dos números (el empate lo deshace la posición respecto a la mano).
 */
export interface Jugada {
  /** Rangos efectivos ordenados de mayor a menor. */
  rangos: number[]
  claveGrandes: number
  claveChicas: number
  pares: Pares
  /** 0 si no tiene pares. */
  clavePares: number
  juego: Juego
  /** 0 si no tiene juego. */
  claveJuego: number
  /** Suma para el punto (sólo relevante si nadie tiene juego). */
  clavePunto: number
  /** Número de reyes y de ases (útil para señas). */
  reyes: number
  ases: number
}

const BASE = 13

/** Orden de los juegos de mejor a peor: 31, 32, 40, 37, 36, 35, 34, 33. */
const ORDEN_JUEGO: Record<number, number> = { 31: 8, 32: 7, 40: 6, 37: 5, 36: 4, 35: 3, 34: 2, 33: 1 }

/**
 * Evalúa una mano de 4 cartas. Es la función más llamada de la simulación
 * (cientos de miles de veces por análisis), así que evita reservas de memoria
 * innecesarias.
 */
export function evaluar(mano: readonly Carta[], reglas: Reglas): Jugada {
  // Rangos ordenados de mayor a menor (ordenación por inserción: son 4).
  const rangos = [0, 0, 0, 0]
  let puntos = 0
  for (let i = 0; i < 4; i++) {
    const r = rangoEfectivo(mano[i], reglas)
    puntos += r >= 10 ? 10 : r
    let j = i
    while (j > 0 && rangos[j - 1] < r) {
      rangos[j] = rangos[j - 1]
      j--
    }
    rangos[j] = r
  }
  const [a, b, c, d] = rangos

  // Grandes: lexicográfica de mayor a menor. Chicas: de menor a mayor, invertida.
  const claveGrandes = ((a * BASE + b) * BASE + c) * BASE + d
  const claveChicas = (((BASE - d) * BASE + (BASE - c)) * BASE + (BASE - b)) * BASE + (BASE - a)

  const pares = calcularPares(a, b, c, d)
  const clavePares = clavePar(pares)

  const real = reglas.laReal && puntos === 31 && esReal(mano)
  const tiene = puntos >= 31
  const claveJuego = !tiene ? 0 : real ? 9 : ORDEN_JUEGO[puntos]

  let reyes = 0
  let ases = 0
  for (const r of rangos) {
    if (r === 12) reyes++
    else if (r === 1) ases++
  }

  return {
    rangos,
    claveGrandes,
    claveChicas,
    pares,
    clavePares,
    juego: { puntos, tiene, real },
    claveJuego,
    clavePunto: tiene ? 0 : puntos,
    reyes,
    ases,
  }
}

/** Pares a partir de los rangos ordenados de mayor a menor (a ≥ b ≥ c ≥ d). */
function calcularPares(a: number, b: number, c: number, d: number): Pares {
  if (a === d) return { tipo: 'duples', alto: a, bajo: a }
  if (a === c) return { tipo: 'medias', alto: a, bajo: 0 }
  if (b === d) return { tipo: 'medias', alto: b, bajo: 0 }
  if (a === b && c === d) return { tipo: 'duples', alto: a, bajo: c }
  if (a === b) return { tipo: 'pareja', alto: a, bajo: 0 }
  if (b === c) return { tipo: 'pareja', alto: b, bajo: 0 }
  if (c === d) return { tipo: 'pareja', alto: c, bajo: 0 }
  return { tipo: 'ninguno', alto: 0, bajo: 0 }
}

const NIVEL_PARES: Record<TipoPares, number> = { ninguno: 0, pareja: 1, medias: 2, duples: 3 }

function clavePar(p: Pares): number {
  if (p.tipo === 'ninguno') return 0
  return NIVEL_PARES[p.tipo] * BASE * BASE + p.alto * BASE + p.bajo
}

/** Tres sietes y una figura (sota, caballo o rey; el tres no vale). */
function esReal(mano: readonly Carta[]): boolean {
  const numeros = mano.map(numeroDe)
  const sietes = numeros.filter((n) => n === 7).length
  const figuras = numeros.filter((n) => n >= 10).length
  return sietes === 3 && figuras === 1
}

/** Piedras que vale una jugada de pares en el recuento. */
export function tantosPares(p: Pares): number {
  return NIVEL_PARES[p.tipo]
}

/** Piedras que vale un juego en el recuento (31 y la Real: 3; resto: 2). */
export function tantosJuego(j: Juego): number {
  if (!j.tiene) return 0
  return j.puntos === 31 ? 3 : 2
}

export function tienePares(j: Jugada): boolean {
  return j.pares.tipo !== 'ninguno'
}
