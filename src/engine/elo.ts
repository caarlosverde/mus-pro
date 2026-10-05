/**
 * Puntuación tipo Elo para el ranking.
 *
 * - Todos empiezan con 1200. Los bots cuentan siempre como 1200.
 * - La fuerza de un equipo es la media de sus dos jugadores (ranking
 *   individual) o la puntuación de la pareja (ranking de parejas).
 * - Ganar a quien tiene más nivel da más puntos; perder contra quien tiene
 *   menos quita más. Las primeras partidas mueven más (K alto) para
 *   encontrar antes el nivel de cada uno.
 */

export const ELO_INICIAL = 1200
export const ELO_BOT = 1200
/** Partidas con las que la puntuación se considera asentada. */
export const PARTIDAS_PROVISIONALES = 10

export function factorK(partidas: number): number {
  return partidas < PARTIDAS_PROVISIONALES ? 40 : 24
}

/** Probabilidad esperada de que gane el equipo de fuerza `a` contra el de fuerza `b`. */
export function esperado(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400))
}

/** Puntos que gana (positivo) o pierde (negativo) un jugador o pareja. */
export function cambioElo(propio: number, rival: number, gano: boolean, k: number): number {
  const delta = Math.round(k * ((gano ? 1 : 0) - esperado(propio, rival)))
  // Siempre se mueve al menos un punto: ganar nunca deja igual.
  if (delta === 0) return gano ? 1 : -1
  return delta
}

export function fuerzaEquipo(puntuaciones: number[]): number {
  return puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length
}
