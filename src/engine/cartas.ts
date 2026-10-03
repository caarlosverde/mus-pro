import type { Reglas } from './reglas'

export const PALOS = ['oros', 'copas', 'espadas', 'bastos'] as const
export type Palo = (typeof PALOS)[number]

/** Números de la baraja española de 40 cartas (10 = sota, 11 = caballo, 12 = rey). */
export const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const
export type Numero = (typeof NUMEROS)[number]

/**
 * Una carta se representa como un entero 0..39 para que la simulación sea rápida:
 * `id = indicePalo * 10 + indiceNumero`.
 */
export type Carta = number

export const BARAJA: readonly Carta[] = Array.from({ length: 40 }, (_, i) => i)

export function crearCarta(numero: Numero, palo: Palo): Carta {
  return PALOS.indexOf(palo) * 10 + NUMEROS.indexOf(numero)
}

export function numeroDe(carta: Carta): Numero {
  return NUMEROS[carta % 10]
}

export function paloDe(carta: Carta): Palo {
  return PALOS[Math.floor(carta / 10)]
}

/**
 * Valor jerárquico de la carta según la variante: en 8 reyes el 3 cuenta
 * como rey (12) y el 2 como as (1).
 */
export function rangoEfectivo(carta: Carta, reglas: Reglas): number {
  const n = numeroDe(carta)
  if (reglas.reyes === 8) {
    if (n === 3) return 12
    if (n === 2) return 1
  }
  return n
}

/** Valor de la carta para el juego y el punto (las figuras valen 10). */
export function valorPunto(carta: Carta, reglas: Reglas): number {
  const r = rangoEfectivo(carta, reglas)
  return r >= 10 ? 10 : r
}

const LETRA: Record<number, string> = { 1: 'A', 10: 'S', 11: 'C', 12: 'R' }

/** Letra corta de un rango efectivo: A, 2..7, S, C, R. */
export function letraRango(rango: number): string {
  return LETRA[rango] ?? String(rango)
}

const NOMBRE_RANGO: Record<number, [string, string]> = {
  1: ['as', 'ases'],
  2: ['dos', 'doses'],
  3: ['tres', 'treses'],
  4: ['cuatro', 'cuatros'],
  5: ['cinco', 'cincos'],
  6: ['seis', 'seises'],
  7: ['siete', 'sietes'],
  10: ['sota', 'sotas'],
  11: ['caballo', 'caballos'],
  12: ['rey', 'reyes'],
}

export function nombreRango(rango: number, plural = false): string {
  return NOMBRE_RANGO[rango][plural ? 1 : 0]
}

/** Notación compacta de una mano por rangos efectivos, de mayor a menor: "RRCA". */
export function notacion(mano: readonly Carta[], reglas: Reglas): string {
  return mano
    .map((c) => rangoEfectivo(c, reglas))
    .sort((a, b) => b - a)
    .map(letraRango)
    .join('')
}

const SIMBOLO_A_NUMERO: Record<string, Numero> = {
  A: 1, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, S: 10, C: 11, R: 12,
}

/**
 * Construye una mano a partir de una notación como "RRCA" o "3R71",
 * eligiendo palos libres para no repetir cartas.
 * En 8 reyes, si se piden más de 4 reyes se usan treses (y doses para los ases).
 */
export function manoDesdeNotacion(
  texto: string,
  reglas: Reglas,
  ocupadas: ReadonlySet<Carta> = new Set(),
): Carta[] {
  const usadas = new Set(ocupadas)
  const mano: Carta[] = []
  for (const simbolo of texto.toUpperCase().replace(/\s/g, '')) {
    const numero = SIMBOLO_A_NUMERO[simbolo]
    if (numero === undefined) throw new Error(`Símbolo de carta desconocido: "${simbolo}"`)
    const alternativas: Numero[] = [numero]
    if (reglas.reyes === 8 && numero === 12) alternativas.push(3)
    if (reglas.reyes === 8 && numero === 1) alternativas.push(2)
    // Se rotan los palos para que la mano tenga un aspecto natural.
    const palos = PALOS.map((_, i) => PALOS[(i + mano.length) % 4])
    const carta = alternativas
      .flatMap((n) => palos.map((p) => crearCarta(n, p)))
      .find((c) => !usadas.has(c))
    if (carta === undefined) throw new Error(`No quedan cartas "${simbolo}" en la baraja`)
    usadas.add(carta)
    mano.push(carta)
  }
  return mano
}
