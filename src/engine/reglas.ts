/**
 * Variantes de reglamento configurables por cada jugador.
 *
 * El motor nunca asume una variante concreta: todas las funciones que
 * dependen de ella reciben un objeto `Reglas`.
 */
export interface Reglas {
  /** 8 reyes: los treses son reyes y los doses son ases. 4 reyes: cada carta es ella misma. */
  reyes: 8 | 4
  /** Piedras necesarias para ganar un juego. */
  piedras: 30 | 40
  /** La Real (tres sietes y una figura, sin contar el tres) gana a cualquier juego. */
  laReal: boolean
  /** Juegos necesarios para ganar la vaca. */
  juegosPorVaca: number
}

export const REGLAS_POR_DEFECTO: Reglas = {
  reyes: 8,
  piedras: 40,
  laReal: false,
  juegosPorVaca: 3,
}

/** Piedras a partir de las cuales una pareja "está dentro" (le faltan 5 o menos). */
export function umbralDentro(reglas: Reglas): number {
  return reglas.piedras - 5
}
