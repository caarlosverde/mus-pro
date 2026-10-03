import { describe, expect, it } from 'vitest'
import { aplicarEnvite, iniciarEnvite, accionesLegales, type AccionEnvite } from '../envites'

const paso: AccionEnvite = { tipo: 'paso' }
const quiero: AccionEnvite = { tipo: 'quiero' }
const envido = (piedras: number): AccionEnvite => ({ tipo: 'envido', piedras })
const ordago: AccionEnvite = { tipo: 'ordago' }

function jugar(acciones: AccionEnvite[], participantes = [0, 1, 2, 3] as (0 | 1 | 2 | 3)[]) {
  let e = iniciarEnvite('grandes', participantes)
  for (const a of acciones) e = aplicarEnvite(e, a)
  return e
}

describe('mecánica de envites', () => {
  it('si pasan los cuatro, el lance queda en paso', () => {
    const e = jugar([paso, paso, paso, paso])
    expect(e.fase).toBe('cerrado')
    expect(e.resultado).toEqual({ tipo: 'paso' })
  })

  it('A paso, B envido, C tres más, D quiere: cinco queridas', () => {
    // A=0 (mano), B=1, C=2, D=3. Tras el envido de B responde la pareja mano empezando por C.
    let e = jugar([paso, envido(2)])
    expect(e.turno).toBe(2)
    e = aplicarEnvite(e, envido(3))
    expect(e.turno).toBe(3) // responde la pareja postre, empezando por D
    e = aplicarEnvite(e, quiero)
    expect(e.resultado).toEqual({ tipo: 'querido', piedras: 5 })
  })

  it('envite no querido de primeras: 1 piedra', () => {
    const e = jugar([envido(4), paso, paso])
    expect(e.resultado).toEqual({ tipo: 'noQuerido', ganador: 'mano', piedras: 1 })
  })

  it('si el primero no quiere, el compañero aún puede querer', () => {
    const e = jugar([envido(2), paso, quiero])
    expect(e.resultado).toEqual({ tipo: 'querido', piedras: 2 })
  })

  it('revoque no querido: se cobra lo que estaba envidado antes', () => {
    // Mano envida 2, contramano sube 2 (total 4), la pareja mano no quiere: la postre cobra 2.
    const e = jugar([envido(2), envido(2), paso, paso])
    expect(e.resultado).toEqual({ tipo: 'noQuerido', ganador: 'postre', piedras: 2 })
  })

  it('órdago: sólo se puede querer o no querer', () => {
    const e = jugar([paso, ordago])
    expect(accionesLegales(e)).toEqual(['paso', 'quiero'])
    expect(aplicarEnvite(e, quiero).resultado).toEqual({ tipo: 'ordago' })
    const noQ = aplicarEnvite(aplicarEnvite(e, paso), paso)
    expect(noQ.resultado).toEqual({ tipo: 'noQuerido', ganador: 'postre', piedras: 1 })
  })

  it('órdago como respuesta a un envite: si no se quiere, se cobra el envite', () => {
    const e = jugar([envido(3), ordago, paso, paso])
    expect(e.resultado).toEqual({ tipo: 'noQuerido', ganador: 'postre', piedras: 3 })
  })

  it('en pares sólo hablan quienes los tienen', () => {
    // Sólo tienen pares el pie de mano (2) y el postre (3).
    let e = iniciarEnvite('pares', [2, 3])
    expect(e.turno).toBe(2)
    e = aplicarEnvite(e, envido(2))
    expect(e.turno).toBe(3)
    e = aplicarEnvite(e, paso)
    expect(e.resultado).toEqual({ tipo: 'noQuerido', ganador: 'mano', piedras: 1 })
  })

  it('rechaza envites de menos de dos piedras', () => {
    expect(() => jugar([envido(1)])).toThrow()
  })
})
