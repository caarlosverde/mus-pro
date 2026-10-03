import { describe, expect, it } from 'vitest'
import { manoDesdeNotacion } from '../cartas'
import { evaluar } from '../evaluacion'
import { resolverMano, TODO_EN_PASO, type Apuestas } from '../recuento'
import { REGLAS_POR_DEFECTO } from '../reglas'

const R = REGLAS_POR_DEFECTO

function mesa(manos: string[]) {
  const usadas = new Set<number>()
  return manos.map((t) => {
    const m = manoDesdeNotacion(t, R, usadas)
    m.forEach((c) => usadas.add(c))
    return evaluar(m, R)
  })
}

describe('recuento', () => {
  it('todo en paso: grandes 1, chicas 1, pares y juego por sus tantos', () => {
    // Mano: RRCA (31 + pareja de reyes). Contramano: AA45. Pie: 4567. Postre: SSC7 (37 + pareja).
    const j = mesa(['RRCA', 'AA45', '4567', 'SSC7'])
    const r = resolverMano(j, TODO_EN_PASO, { mano: 0, postre: 0 }, R)
    // Mano: grandes (1) + pares RR (1) + la 31 (3) = 5. Postre: chicas (1).
    expect(r.marcador).toEqual({ mano: 5, postre: 1 })
    expect(r.ganadorJuego).toBeNull()
  })

  it('envites queridos y "porque no"', () => {
    const j = mesa(['RRCA', 'AA45', '4567', 'SSC7'])
    const apuestas: Apuestas = {
      grandes: { tipo: 'querido', piedras: 5 },
      chicas: { tipo: 'noQuerido', ganador: 'postre', piedras: 2 },
      pares: { tipo: 'querido', piedras: 2 },
      juego: { tipo: 'noQuerido', ganador: 'mano', piedras: 1 },
    }
    const r = resolverMano(j, apuestas, { mano: 0, postre: 0 }, R)
    // Mano: 5 grandes + 2 pares + 1 pareja + 1 porque no juego + 3 la 31 = 12.
    // Postre: 2 porque no chicas (las chicas no querido no dan piedra extra).
    expect(r.marcador).toEqual({ mano: 12, postre: 2 })
  })

  it('la 31 que no sirvió: el orden de cobro decide el juego', () => {
    // Mano 37 - Postre 35. El mano tiene la 31 con pareja de reyes,
    // los rivales sólo pitos, cuatros y una media de cuatros, sin juego.
    const j = mesa(['RRCA', 'A4SC', '567S', '4447'])
    const apuestas: Apuestas = {
      grandes: { tipo: 'noQuerido', ganador: 'postre', piedras: 1 }, // órdago no querido
      chicas: { tipo: 'paso' },
      pares: { tipo: 'noQuerido', ganador: 'postre', piedras: 1 }, // órdago no querido
      juego: { tipo: 'paso' },
    }
    const r = resolverMano(j, apuestas, { mano: 37, postre: 35 }, R)
    expect(r.ganadorJuego).toBe('postre')
    expect(r.decididoEn).toBe('pares')
    expect(r.marcador.postre).toBe(40)
    expect(r.marcador.mano).toBe(37) // la 31 no llega a cobrarse
  })

  it('un órdago querido decide el juego inmediatamente', () => {
    const j = mesa(['RRCA', 'A4SC', '567S', '4447'])
    const apuestas: Apuestas = { ...TODO_EN_PASO, grandes: { tipo: 'ordago' } }
    const r = resolverMano(j, apuestas, { mano: 3, postre: 20 }, R)
    expect(r.ganadorJuego).toBe('mano')
    expect(r.decididoEn).toBe('grandes')
    expect(r.marcador.mano).toBe(40)
  })

  it('si sólo una pareja tiene pares, se los lleva sin envite', () => {
    const j = mesa(['RRCA', 'A4SC', '4567', '5A6C'])
    const apuestas: Apuestas = { ...TODO_EN_PASO, pares: { tipo: 'ordago' } }
    const r = resolverMano(j, apuestas, { mano: 0, postre: 0 }, R)
    expect(r.ganadorJuego).toBeNull() // el órdago se ignora: no hubo disputa
  })

  it('al punto: el envite querido más una piedra', () => {
    const j = mesa(['RR55', 'A4SC', '4567', '5A6C'])
    const apuestas: Apuestas = { ...TODO_EN_PASO, juego: { tipo: 'querido', piedras: 3 } }
    const r = resolverMano(j, apuestas, { mano: 0, postre: 0 }, R)
    const punto = r.eventos.filter((e) => e.lance === 'punto')
    expect(punto.map((e) => [e.pareja, e.piedras])).toEqual([
      ['mano', 3],
      ['mano', 1],
    ])
  })
})
