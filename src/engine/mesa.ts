import type { Jugada } from './evaluacion'

/**
 * Posiciones relativas al reparto. El orden de habla y el desempate
 * ("gana el que va de mano") siguen este orden.
 */
export type Posicion = 0 | 1 | 2 | 3
export const POSICIONES: readonly Posicion[] = [0, 1, 2, 3]
export const NOMBRE_POSICION: Record<Posicion, string> = {
  0: 'Mano',
  1: 'Contramano',
  2: 'Pie de mano',
  3: 'Postre',
}

export type Pareja = 'mano' | 'postre'
export const NOMBRE_PAREJA: Record<Pareja, string> = { mano: 'Pareja mano', postre: 'Pareja postre' }

export function parejaDe(p: Posicion): Pareja {
  return p % 2 === 0 ? 'mano' : 'postre'
}

export function companeroDe(p: Posicion): Posicion {
  return ((p + 2) % 4) as Posicion
}

export function rival(pareja: Pareja): Pareja {
  return pareja === 'mano' ? 'postre' : 'mano'
}

export function miembros(pareja: Pareja): [Posicion, Posicion] {
  return pareja === 'mano' ? [0, 2] : [1, 3]
}

export type Lance = 'grandes' | 'chicas' | 'pares' | 'juego' | 'punto'
export const LANCES: readonly Lance[] = ['grandes', 'chicas', 'pares', 'juego', 'punto']
export const NOMBRE_LANCE: Record<Lance, string> = {
  grandes: 'Grandes',
  chicas: 'Chicas',
  pares: 'Pares',
  juego: 'Juego',
  punto: 'Punto',
}

function clave(j: Jugada, lance: Lance): number {
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

/** Si un jugador participa en el lance (en pares y juego sólo quien los tiene). */
export function participa(j: Jugada, lance: Lance): boolean {
  if (lance === 'pares') return j.clavePares > 0
  if (lance === 'juego') return j.juego.tiene
  return true
}

/**
 * Posición del jugador que gana el lance, o `null` si nadie participa.
 * `jugadas` está indexado por posición (0 = mano). A igualdad gana quien va antes.
 */
export function ganadorLance(jugadas: readonly Jugada[], lance: Lance): Posicion | null {
  let mejor: Posicion | null = null
  let mejorClave = -1
  for (const p of POSICIONES) {
    const j = jugadas[p]
    if (!participa(j, lance)) continue
    const k = clave(j, lance)
    if (k > mejorClave) {
      mejor = p
      mejorClave = k
    }
  }
  return mejor
}

/** Si se juega al punto (nadie tiene juego). */
export function seJuegaPunto(jugadas: readonly Jugada[]): boolean {
  return jugadas.every((j) => !j.juego.tiene)
}

/** Pareja que tiene jugada en un lance de declaración: 'ambas', una pareja o 'ninguna'. */
export function quienDeclara(
  jugadas: readonly Jugada[],
  lance: 'pares' | 'juego',
): 'ambas' | Pareja | 'ninguna' {
  const mano = miembros('mano').some((p) => participa(jugadas[p], lance))
  const postre = miembros('postre').some((p) => participa(jugadas[p], lance))
  if (mano && postre) return 'ambas'
  if (mano) return 'mano'
  if (postre) return 'postre'
  return 'ninguna'
}
