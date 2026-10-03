import type { Carta } from './cartas'
import { rangoEfectivo } from './cartas'
import type { Jugada } from './evaluacion'
import type { Reglas } from './reglas'

/**
 * Señas reglamentadas más habituales. Cada una se interpreta de forma
 * estricta: "dos reyes" significa exactamente dos reyes, etc.
 */
export type Sena =
  | 'dosReyes'
  | 'tresReyes'
  | 'dosPitos'
  | 'tresPitos'
  | 'medias'
  | 'duples'
  | 'pares'
  | 'la31'
  | 'juego'
  | 'treinta'
  | 'ciego'

export const SENAS: Record<Sena, { nombre: string; gesto: string; test: (j: Jugada) => boolean }> = {
  dosReyes: { nombre: 'Dos reyes', gesto: 'Morderse el labio inferior', test: (j) => j.reyes === 2 },
  tresReyes: { nombre: 'Tres reyes', gesto: 'Morderse el labio por un lado', test: (j) => j.reyes === 3 },
  dosPitos: { nombre: 'Dos pitos', gesto: 'Sacar la punta de la lengua', test: (j) => j.ases === 2 },
  tresPitos: { nombre: 'Tres pitos', gesto: 'Sacar la lengua por un lado', test: (j) => j.ases === 3 },
  medias: { nombre: 'Medias', gesto: 'Torcer la boca', test: (j) => j.pares.tipo === 'medias' },
  duples: { nombre: 'Duples', gesto: 'Levantar las cejas', test: (j) => j.pares.tipo === 'duples' },
  pares: { nombre: 'Pares', gesto: 'Girar la cabeza', test: (j) => j.pares.tipo !== 'ninguno' },
  la31: { nombre: 'La 31', gesto: 'Guiñar un ojo', test: (j) => j.juego.puntos === 31 },
  juego: { nombre: 'Juego (no 31)', gesto: 'Fruncir los labios', test: (j) => j.juego.tiene && j.juego.puntos !== 31 },
  treinta: { nombre: '30 al punto', gesto: 'Encoger un hombro', test: (j) => j.juego.puntos === 30 },
  ciego: {
    nombre: 'Ciego',
    gesto: 'Cerrar los dos ojos',
    test: (j) => j.pares.tipo === 'ninguno' && !j.juego.tiene,
  },
}

export interface Condicion {
  descripcion: string
  test: (j: Jugada) => boolean
}

/** Todo lo que se sabe (o se cree saber) de un jugador. */
export interface InfoJugador {
  /** Cartas conocidas (las tuyas). Si se da, el resto se ignora. */
  mano?: Carta[]
  senas?: Sena[]
  /** "Pares sí / pares no" (obligatorio decir la verdad). */
  pares?: boolean
  /** "Juego sí / juego no". */
  juego?: boolean
  /** Cartas con las que se quedó en el último descarte (0-3). */
  seQuedoCon?: number
  /** Condiciones adicionales (usadas por los problemas). */
  condiciones?: Condicion[]
}

export function cumple(j: Jugada, info: InfoJugador): boolean {
  if (info.pares !== undefined && (j.pares.tipo !== 'ninguno') !== info.pares) return false
  if (info.juego !== undefined && j.juego.tiene !== info.juego) return false
  if (info.senas) for (const s of info.senas) if (!SENAS[s].test(j)) return false
  if (info.condiciones) for (const c of info.condiciones) if (!c.test(j)) return false
  return true
}

export function tieneRestricciones(info: InfoJugador): boolean {
  return (
    info.pares !== undefined ||
    info.juego !== undefined ||
    (info.senas?.length ?? 0) > 0 ||
    (info.condiciones?.length ?? 0) > 0 ||
    info.seQuedoCon !== undefined
  )
}

/**
 * Modelo sencillo de qué conserva un jugador al descartarse:
 * se queda con los reyes y con las cartas que le forman pares
 * (siempre suelta al menos una carta). Es una aproximación razonable
 * del comportamiento típico; sirve para interpretar "se quedó con N".
 */
export function cartasQueConserva(mano: readonly Carta[], reglas: Reglas): Carta[] {
  const rangos = mano.map((c) => rangoEfectivo(c, reglas))
  const cuenta = new Map<number, number>()
  for (const r of rangos) cuenta.set(r, (cuenta.get(r) ?? 0) + 1)
  const conservadas = mano.filter((_, i) => rangos[i] === 12 || (cuenta.get(rangos[i]) ?? 0) >= 2)
  if (conservadas.length === 4) {
    // Hay que soltar al menos una: suelta la más baja.
    conservadas.sort((a, b) => rangoEfectivo(b, reglas) - rangoEfectivo(a, reglas))
    conservadas.pop()
  }
  return conservadas
}
