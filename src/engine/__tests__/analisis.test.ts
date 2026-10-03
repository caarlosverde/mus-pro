import { describe, expect, it } from 'vitest'
import { analizar } from '../analisis'
import { BARAJA, manoDesdeNotacion } from '../cartas'
import { evaluar } from '../evaluacion'
import { REGLAS_POR_DEFECTO } from '../reglas'
import type { Escenario } from '../simulacion'

const R = REGLAS_POR_DEFECTO

/** Probabilidad exacta de una propiedad sobre las 91.390 manos posibles. */
function exacta(prop: (m: number[]) => boolean): number {
  let si = 0
  let total = 0
  for (let a = 0; a < 40; a++)
    for (let b = a + 1; b < 40; b++)
      for (let c = b + 1; c < 40; c++)
        for (let d = c + 1; d < 40; d++) {
          total++
          if (prop([BARAJA[a], BARAJA[b], BARAJA[c], BARAJA[d]])) si++
        }
  return si / total
}

describe('analizar', () => {
  it('sin información, la probabilidad de juego del compañero coincide con la exacta', () => {
    const pJuego = exacta((m) => evaluar(m, R).juego.tiene)
    const pPares = exacta((m) => evaluar(m, R).pares.tipo !== 'ninguno')
    const escenario: Escenario = { jugadores: [{}, {}, {}, {}] }
    const a = analizar(escenario, 0, R, 20000, 1)!
    expect(a.companero.juego).toBeCloseTo(pJuego, 1)
    expect(a.companero.pares).toBeCloseTo(pPares, 1)
    expect(a.pareja.grandes).toBeCloseTo(0.5, 1) // los empates exactos a grandes son rarísimos
  })

  it('las señas restringen las manos', () => {
    const mano = manoDesdeNotacion('RRCA', R)
    const escenario: Escenario = {
      jugadores: [{ mano }, { senas: ['duples'] }, { senas: ['la31'] }, { pares: false, juego: false }],
    }
    const a = analizar(escenario, 0, R, 3000, 2)!
    expect(a.companero.la31).toBe(1)
    expect(a.rivales.duples).toBe(1)
    expect(a.pareja.juego.ganamos).toBe(1) // tenemos la 31 de mano: imbatible
  })

  it('el muestreo condicionado por señas es exacto', () => {
    // P(el compañero tiene juego | seña de tres reyes), con nuestra mano RRCA conocida.
    const mano = manoDesdeNotacion('RRCA', R)
    const resto = BARAJA.filter((c) => !mano.includes(c))
    let validas = 0
    let conJuego = 0
    for (let a = 0; a < resto.length; a++)
      for (let b = a + 1; b < resto.length; b++)
        for (let c = b + 1; c < resto.length; c++)
          for (let d = c + 1; d < resto.length; d++) {
            const j = evaluar([resto[a], resto[b], resto[c], resto[d]], R)
            if (j.reyes !== 3) continue
            validas++
            if (j.juego.tiene) conJuego++
          }
    const escenario: Escenario = { jugadores: [{ mano }, {}, { senas: ['tresReyes'] }, {}] }
    const a = analizar(escenario, 0, R, 20000, 5)!
    expect(a.companero.juego).toBeCloseTo(conJuego / validas, 2)
  })

  it('"se quedó con 3 cartas" hace mucho más probable que tenga reyes', () => {
    const libre = analizar({ jugadores: [{}, {}, {}, {}] }, 0, R, 5000, 3)!
    const cargado = analizar({ jugadores: [{}, { seQuedoCon: 3 }, {}, { seQuedoCon: 3 }] }, 0, R, 5000, 3)!
    expect(cargado.rivales.mediasOMas).toBeGreaterThan(libre.rivales.mediasOMas + 0.1)
    expect(cargado.pareja.grandes).toBeLessThan(libre.pareja.grandes - 0.1)
  })

  it('devuelve null si el escenario es imposible', () => {
    // Cuatro jugadores con medias de reyes: sólo hay 8 reyes.
    const imposible: Escenario = {
      jugadores: [{ senas: ['tresReyes'] }, { senas: ['tresReyes'] }, { senas: ['tresReyes'] }, { senas: ['tresReyes'] }],
    }
    expect(analizar(imposible, 0, R, 100, 4)).toBeNull()
  })
})
