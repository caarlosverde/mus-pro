import { describe, expect, it } from 'vitest'
import { crearRng } from '../azar'
import { PERSONALIDAD_POR_ID } from '../bots'
import { BARAJA, manoDesdeNotacion } from '../cartas'
import { evaluarDecision } from '../evaluador'
import { aplicar, manoDesdeCartas, type AccionMano } from '../mano'
import { REGLAS_POR_DEFECTO } from '../reglas'

const R = REGLAS_POR_DEFECTO
const EQ = PERSONALIDAD_POR_ID.equilibrado
const personalidades = [EQ, EQ, EQ, EQ]

/** Mesa con la mano del héroe fija y el resto de cartas repartidas al azar. */
function mesa(heroe: number, notacionHeroe: string, semilla: number) {
  const rng = crearRng(semilla)
  const mia = manoDesdeNotacion(notacionHeroe, R)
  const resto = BARAJA.filter((c) => !mia.includes(c)).sort(() => rng() - 0.5)
  const manos = [0, 1, 2, 3].map((p) => (p === heroe ? mia : resto.splice(0, 4)))
  return { estado: manoDesdeCartas(R, { mano: 0, postre: 0 }, manos, resto), rng }
}

const mejor = (alts: { accion: AccionMano; pJuego: number }[]) => [...alts].sort((a, b) => b.pJuego - a.pJuego)[0].accion

describe('evaluador de decisiones', () => {
  it('con el perete de postre, mejor pedir mus que cortar', () => {
    let { estado, rng } = mesa(3, '4567', 1)
    for (let i = 0; i < 3; i++) estado = aplicar(estado, { tipo: 'mus' }, rng)
    const ev = evaluarDecision(estado, 3, [{ tipo: 'mus' }, { tipo: 'corto' }], { personalidades, muestras: 300 })!
    expect(mejor(ev.alternativas)).toEqual({ tipo: 'mus' })
  })

  it('con cuatro reyes se ve el órdago a grandes', () => {
    let { estado, rng } = mesa(1, 'RRRR', 2)
    estado = aplicar(estado, { tipo: 'corto' }, rng)
    estado = aplicar(estado, { tipo: 'envite', accion: { tipo: 'ordago' } }, rng)
    const ev = evaluarDecision(
      estado,
      1,
      [
        { tipo: 'envite', accion: { tipo: 'paso' } },
        { tipo: 'envite', accion: { tipo: 'quiero' } },
      ],
      { personalidades, muestras: 300 },
    )!
    expect(mejor(ev.alternativas)).toEqual({ tipo: 'envite', accion: { tipo: 'quiero' } })
  })

  it('con una grande mediocre no se ve un órdago del mano: la inferencia le supone cargado', () => {
    let { estado, rng } = mesa(1, 'R754', 3)
    estado = aplicar(estado, { tipo: 'corto' }, rng)
    estado = aplicar(estado, { tipo: 'envite', accion: { tipo: 'ordago' } }, rng)
    const ev = evaluarDecision(
      estado,
      1,
      [
        { tipo: 'envite', accion: { tipo: 'paso' } },
        { tipo: 'envite', accion: { tipo: 'quiero' } },
      ],
      { personalidades, muestras: 300 },
    )!
    expect(mejor(ev.alternativas)).toEqual({ tipo: 'envite', accion: { tipo: 'paso' } })
    expect(ev.muestrasEfectivas).toBeGreaterThan(5)
  })
})
