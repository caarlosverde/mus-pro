import type { Rng } from './azar'
import { decidir, type Personalidad } from './bots'
import { aplicar, nuevaMano, type AccionMano, type ConfigMano, type EstadoMano } from './mano'
import type { Posicion } from './mesa'
import type { Reglas } from './reglas'

/** Un agente decide la acción del jugador en `pos` (bot, humano, política de referencia...). */
export type Agente = (e: EstadoMano, pos: Posicion, rng: Rng) => AccionMano

export function agenteBot(per: Personalidad): Agente {
  return (e, pos, rng) => decidir(e, pos, per, rng)
}

/** Juega la mano hasta el final con los agentes dados (indexados por posición). */
export function jugarHastaFin(e: EstadoMano, agentes: readonly Agente[], rng: Rng, maxPasos = 400): EstadoMano {
  let s = e
  for (let i = 0; i < maxPasos && s.fase !== 'fin'; i++) {
    const pos = s.turno!
    s = aplicar(s, agentes[pos](s, pos, rng), rng)
  }
  if (s.fase !== 'fin') throw new Error('La mano no terminó')
  return s
}

// ---------------------------------------------------------------------------
// Partida: manos sucesivas, juegos y vaca
// ---------------------------------------------------------------------------

/** Asientos fijos 0-3 en orden de habla. Equipo 0 = asientos 0 y 2; equipo 1 = asientos 1 y 3. */
export type Asiento = 0 | 1 | 2 | 3
export type Equipo = 0 | 1

export const equipoDe = (a: Asiento): Equipo => (a % 2) as Equipo

export interface EstadoPartida {
  reglas: Reglas
  config: ConfigMano
  /** Asiento que es mano en la mano actual. */
  asientoMano: Asiento
  tantos: [number, number]
  juegos: [number, number]
  mano: EstadoMano
  /** Manos terminadas en el juego actual. */
  manosJugadas: number
  ganadorVaca: Equipo | null
  /** Último juego ganado (para avisar en la interfaz). */
  ultimoJuego: Equipo | null
}

/** Asiento que ocupa la posición `pos` en la mano actual. */
export function asientoDe(p: EstadoPartida, pos: Posicion): Asiento {
  return ((p.asientoMano + pos) % 4) as Asiento
}

/** Posición en la mano actual del asiento `a`. */
export function posicionDe(p: EstadoPartida, a: Asiento): Posicion {
  return ((a - p.asientoMano + 4) % 4) as Posicion
}

function marcadorMano(tantos: [number, number], asientoMano: Asiento) {
  const eqMano = equipoDe(asientoMano)
  return { mano: tantos[eqMano], postre: tantos[1 - eqMano] }
}

export function nuevaPartida(reglas: Reglas, config: ConfigMano, rng: Rng, asientoMano: Asiento = 0): EstadoPartida {
  const tantos: [number, number] = [0, 0]
  return {
    reglas,
    config,
    asientoMano,
    tantos,
    juegos: [0, 0],
    mano: nuevaMano(reglas, marcadorMano(tantos, asientoMano), rng, config),
    manosJugadas: 0,
    ganadorVaca: null,
    ultimoJuego: null,
  }
}

/** Aplica el resultado de la mano terminada y reparte la siguiente. */
export function siguienteMano(p: EstadoPartida, rng: Rng): EstadoPartida {
  const r = p.mano.resultado
  if (!r) throw new Error('La mano no ha terminado')
  const eqMano = equipoDe(p.asientoMano)
  const tantos: [number, number] = [0, 0]
  tantos[eqMano] = r.marcador.mano
  tantos[1 - eqMano] = r.marcador.postre
  const juegos: [number, number] = [...p.juegos]
  let ultimoJuego: Equipo | null = null
  let manosJugadas = p.manosJugadas + 1
  if (r.ganadorJuego) {
    const eq = (r.ganadorJuego === 'mano' ? eqMano : 1 - eqMano) as Equipo
    juegos[eq]++
    ultimoJuego = eq
    tantos[0] = 0
    tantos[1] = 0
    manosJugadas = 0
  }
  const ganadorVaca = juegos[0] >= p.reglas.juegosPorVaca ? 0 : juegos[1] >= p.reglas.juegosPorVaca ? 1 : null
  // La mano pasa al jugador de la derecha: el que era contramano.
  const asientoMano = ((p.asientoMano + 1) % 4) as Asiento
  return {
    ...p,
    asientoMano,
    tantos,
    juegos,
    manosJugadas,
    ultimoJuego,
    ganadorVaca,
    mano: nuevaMano(p.reglas, marcadorMano(tantos, asientoMano), rng, p.config),
  }
}
