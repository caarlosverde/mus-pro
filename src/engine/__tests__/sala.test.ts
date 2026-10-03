import { describe, expect, it } from 'vitest'
import { crearRng } from '../azar'
import { PERSONALIDAD_POR_ID, decidir } from '../bots'
import { posicionDe } from '../partida'
import { REGLAS_POR_DEFECTO } from '../reglas'
import {
  ErrorSala,
  avanzarSiProcede,
  empezar,
  jugar,
  jugarAutomatico,
  marcarListo,
  nuevaSala,
  reconectar,
  sentar,
  turnoAutomatico,
  vistaPara,
  ESPERA_DESCONECTADO_MS,
  type Sala,
} from '../sala'

const ana = { id: 'u1', nombre: 'ana' }
const luis = { id: 'u2', nombre: 'luis' }

function salaConDos(semilla = 1) {
  const rng = crearRng(semilla)
  let s = nuevaSala('ABCD', REGLAS_POR_DEFECTO, false)
  s = sentar(s, ana).sala
  s = sentar(s, luis).sala
  s = empezar(s, rng)
  return { s, rng }
}

describe('sala', () => {
  it('sienta a los humanos como compañeros y rellena con bots al empezar', () => {
    const { s } = salaConDos()
    expect(s.asientos[0]).toMatchObject({ tipo: 'humano', nombre: 'ana' })
    expect(s.asientos[2]).toMatchObject({ tipo: 'humano', nombre: 'luis' })
    expect(s.asientos[1]?.tipo).toBe('bot')
    expect(s.asientos[3]?.tipo).toBe('bot')
    expect(s.fase).toBe('jugando')
  })

  it('cada jugador sólo ve sus cartas hasta el final de la mano', () => {
    const { s } = salaConDos()
    const v = vistaPara(s, 0)
    expect(v.mano!.cartas[0]).toHaveLength(4)
    expect(v.mano!.cartas[1]).toBeNull()
    expect(v.mano!.cartas[2]).toBeNull()
    const espectador = vistaPara(s, null)
    expect(espectador.mano!.cartas.every((c) => c === null)).toBe(true)
  })

  it('rechaza jugar fuera de turno', () => {
    const { s, rng } = salaConDos()
    const p = s.partida!
    const turno = ([0, 1, 2, 3] as const).find((a) => posicionDe(p, a) === p.mano.turno)!
    const otro = ((turno + 1) % 4) as 0 | 1 | 2 | 3
    expect(() => jugar(s, otro, { tipo: 'mus' }, rng)).toThrow(ErrorSala)
  })

  it('una vaca completa con humanos (jugando como bots) termina con resultado', () => {
    let { s, rng } = salaConDos(7)
    const eq = PERSONALIDAD_POR_ID.equilibrado
    for (let i = 0; i < 20000 && s.fase === 'jugando'; i++) {
      const auto = turnoAutomatico(s)
      if (auto !== null) {
        s = jugarAutomatico(s, auto, rng)
        continue
      }
      const p = s.partida!
      if (p.mano.fase === 'fin') {
        s = marcarListo(marcarListo(s, 0), 2)
        s = avanzarSiProcede(s, rng)
        continue
      }
      const pos = p.mano.turno!
      const asiento = ([0, 1, 2, 3] as const).find((a) => posicionDe(p, a) === pos)!
      s = jugar(s, asiento, decidir(p.mano, pos, eq, rng), rng)
    }
    expect(s.fase).toBe('terminada')
    expect(s.resultado!.humanos.map((h) => h.nombre).sort()).toEqual(['ana', 'luis'])
    expect(Math.max(...s.resultado!.juegos)).toBe(REGLAS_POR_DEFECTO.juegosPorVaca)
  })

  it('si un humano se desconecta, un bot juega por él pasado un tiempo', () => {
    let { s } = salaConDos(3)
    const p = s.partida!
    const asientoTurno = ([0, 1, 2, 3] as const).find((a) => posicionDe(p, a) === p.mano.turno)!
    const humano = s.asientos[asientoTurno]
    if (humano?.tipo !== 'humano') return // el turno es de un bot: no aplica
    const t0 = 1_000_000
    s = reconectar(s, humano.id, false, t0) as Sala
    expect(turnoAutomatico(s, t0 + 1000)).toBeNull()
    expect(turnoAutomatico(s, t0 + ESPERA_DESCONECTADO_MS + 1)).toBe(asientoTurno)
  })

  it('un usuario que vuelve recupera su asiento', () => {
    let { s } = salaConDos()
    s = reconectar(s, 'u1', false)
    const r = sentar(s, ana)
    expect(r.asiento).toBe(0)
    expect(r.sala.asientos[0]).toMatchObject({ conectado: true })
  })
})
