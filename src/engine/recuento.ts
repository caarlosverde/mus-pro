import { tantosJuego, tantosPares, type Jugada } from './evaluacion'
import {
  ganadorLance,
  miembros,
  parejaDe,
  quienDeclara,
  seJuegaPunto,
  NOMBRE_LANCE,
  type Lance,
  type Pareja,
} from './mesa'
import type { Reglas } from './reglas'

/** Cómo quedó la apuesta de un lance al terminar los envites. */
export type ResultadoApuesta =
  | { tipo: 'paso' }
  | { tipo: 'querido'; piedras: number }
  /** Envite no querido: el "porque no" se cobra en el momento. */
  | { tipo: 'noQuerido'; ganador: Pareja; piedras: number }
  /** Órdago querido: se levantan las cartas y el lance decide el juego. */
  | { tipo: 'ordago' }

export interface Apuestas {
  grandes: ResultadoApuesta
  chicas: ResultadoApuesta
  /** Sólo se usa si las dos parejas tienen pares. */
  pares: ResultadoApuesta
  /** Juego, o punto si nadie tiene juego. Sólo se usa si hay disputa. */
  juego: ResultadoApuesta
}

export const TODO_EN_PASO: Apuestas = {
  grandes: { tipo: 'paso' },
  chicas: { tipo: 'paso' },
  pares: { tipo: 'paso' },
  juego: { tipo: 'paso' },
}

export interface Marcador {
  mano: number
  postre: number
}

export interface EventoRecuento {
  fase: 'envites' | 'recuento'
  lance: Lance
  pareja: Pareja
  piedras: number
  motivo: string
}

export interface ResultadoMano {
  marcador: Marcador
  /** Pareja que alcanza las piedras del juego en esta mano, si alguna. */
  ganadorJuego: Pareja | null
  /** Lance en el que se decidió el juego, si se decidió. */
  decididoEn: Lance | null
  eventos: EventoRecuento[]
}

/**
 * Resuelve una mano completa: primero los "porque no" y órdagos en el orden
 * en que se producen, y después el recuento en estricto orden
 * (grandes, chicas, pares, juego o punto). El juego termina en cuanto una
 * pareja alcanza las piedras, aunque falten lances por cobrar.
 */
export function resolverMano(
  jugadas: readonly Jugada[],
  apuestas: Apuestas,
  marcadorInicial: Marcador,
  reglas: Reglas,
  /** Piedras para ganar; por defecto las de las reglas. `Infinity` para contar sin límite. */
  objetivo: number = reglas.piedras,
): ResultadoMano {
  const marcador = { ...marcadorInicial }
  const eventos: EventoRecuento[] = []
  const punto = seJuegaPunto(jugadas)
  const loteFinal: Lance = punto ? 'punto' : 'juego'

  const disputaPares = quienDeclara(jugadas, 'pares') === 'ambas'
  const disputaFinal = punto || quienDeclara(jugadas, 'juego') === 'ambas'

  const apuestaDe = (lance: Lance): ResultadoApuesta => {
    if (lance === 'grandes') return apuestas.grandes
    if (lance === 'chicas') return apuestas.chicas
    if (lance === 'pares') return disputaPares ? apuestas.pares : { tipo: 'paso' }
    return disputaFinal ? apuestas.juego : { tipo: 'paso' }
  }

  const lances: Lance[] = ['grandes', 'chicas', 'pares', loteFinal]

  const ganadorPareja = (lance: Lance): Pareja | null => {
    const p = ganadorLance(jugadas, lance)
    return p === null ? null : parejaDe(p)
  }

  let terminado: { pareja: Pareja; lance: Lance } | null = null
  const sumar = (
    fase: EventoRecuento['fase'],
    lance: Lance,
    pareja: Pareja,
    piedras: number,
    motivo: string,
  ): boolean => {
    if (piedras <= 0 || terminado) return terminado !== null
    marcador[pareja] += piedras
    eventos.push({ fase, lance, pareja, piedras, motivo })
    if (marcador[pareja] >= objetivo) terminado = { pareja, lance }
    return terminado !== null
  }

  // 1) Fase de envites: "porque no" y órdagos querido, en orden de lance.
  for (const lance of lances) {
    const a = apuestaDe(lance)
    if (a.tipo === 'noQuerido') {
      if (sumar('envites', lance, a.ganador, a.piedras, `${NOMBRE_LANCE[lance]}: porque no`)) break
    } else if (a.tipo === 'ordago') {
      const g = ganadorPareja(lance)
      if (g) {
        const faltan = objetivo - marcador[g]
        sumar('envites', lance, g, faltan, `${NOMBRE_LANCE[lance]}: órdago querido`)
      }
      break
    }
  }

  // 2) Recuento en estricto orden.
  if (!terminado) {
    for (const lance of lances) {
      if (recontar(lance)) break
    }
  }

  return {
    marcador,
    ganadorJuego: terminado ? (terminado as { pareja: Pareja }).pareja : null,
    decididoEn: terminado ? (terminado as { lance: Lance }).lance : null,
    eventos,
  }

  /** Devuelve true si el juego ha terminado. */
  function recontar(lance: Lance): boolean {
    const a = apuestaDe(lance)
    const nombre = NOMBRE_LANCE[lance]
    const ganadorCartas = ganadorPareja(lance)
    const ganador = a.tipo === 'noQuerido' ? a.ganador : ganadorCartas
    if (!ganador) return false

    if (a.tipo === 'querido') {
      if (sumar('recuento', lance, ganador, a.piedras, `${nombre}: envite querido`)) return true
    }

    if (lance === 'grandes' || lance === 'chicas') {
      if (a.tipo === 'paso') return sumar('recuento', lance, ganador, 1, `${nombre} en paso`)
      return false
    }

    if (lance === 'punto') {
      return sumar('recuento', lance, ganador, 1, 'Punto')
    }

    // Pares y juego: cada miembro de la pareja ganadora cobra su jugada.
    for (const p of miembros(ganador)) {
      const j = jugadas[p]
      const tantos = lance === 'pares' ? tantosPares(j.pares) : tantosJuego(j.juego)
      const desc = lance === 'pares' ? j.pares.tipo : j.juego.puntos === 31 ? 'la 31' : `juego de ${j.juego.puntos}`
      if (sumar('recuento', lance, ganador, tantos, `${nombre}: ${desc}`)) return true
    }
    return false
  }
}
