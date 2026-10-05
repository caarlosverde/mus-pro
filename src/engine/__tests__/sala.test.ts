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
  buscarRivales,
  hacerSena,
  normalizarSala,
  procesarPendientes,
  proximoPendiente,
  reservar,
  senasPermitidas,
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

describe('señas con avatar', () => {
  function salaAvatar(semilla = 11) {
    const rng = crearRng(semilla)
    let s = nuevaSala('SENAS', REGLAS_POR_DEFECTO, false, { modoSenas: 'avatar' })
    s = sentar(s, ana).sala
    s = sentar(s, luis).sala
    return { s: empezar(s, rng, 'equilibrado', 1000), rng }
  }

  it('sólo deja hacer señas que la mano permite', () => {
    const { s, rng } = salaAvatar()
    const permitidas = senasPermitidas(s, 0)
    const todas = ['dosReyes', 'tresReyes', 'dosPitos', 'tresPitos', 'medias', 'duples', 'pares', 'la31', 'juego', 'treinta', 'ciego'] as const
    const falsa = todas.find((x) => !permitidas.includes(x))!
    expect(() => hacerSena(s, 0, falsa, rng)).toThrow(ErrorSala)
    const buena = permitidas[0]
    const s2 = hacerSena(s, 0, buena, rng, 2000)
    expect(s2.gestos.at(-1)).toMatchObject({ asiento: 0, sena: buena })
    // La seña queda registrada para los bots (que la ven con cierta probabilidad).
    expect(s2.partida!.mano.senas.some((x) => x.sena === buena && x.de === posicionDe(s2.partida!, 0))).toBe(true)
  })

  it('las señas de los bots se programan como gestos y no se dan por escrito', () => {
    const { s } = salaAvatar(3)
    const v = vistaPara(s, 0)
    expect(v.mano!.senas.every((x) => x.como === 'propia')).toBe(true)
    if (s.pendientes.length === 0) return // ningún bot tenía nada que señar
    expect(s.pendientes.every((x) => s.asientos[x.asiento]?.tipo === 'bot')).toBe(true)
    const mas = procesarPendientes(s, 1000 + 60_000)
    expect(mas.pendientes).toHaveLength(0)
    expect(mas.gestos.length).toBeGreaterThan(0)
    expect(proximoPendiente(mas)).toBeNull()
  })
})

describe('parejas que buscan rivales', () => {
  it('sólo una pareja sentada en norte y sur puede buscar; las reservas guardan el sitio', () => {
    let s = nuevaSala('PAREJ', REGLAS_POR_DEFECTO, false)
    s = sentar(s, ana).sala
    expect(() => buscarRivales(s)).toThrow(ErrorSala)
    s = sentar(s, luis).sala
    s = buscarRivales(s, 5)
    expect(s.modo).toBe('parejas')
    s = reservar(s, [
      { id: 'u3', asiento: 1 },
      { id: 'u4', asiento: 3 },
    ])
    // Un intruso no puede ocupar un asiento reservado.
    expect(sentar(s, { id: 'u9', nombre: 'intruso' }).asiento).toBeNull()
    s = sentar(s, { id: 'u4', nombre: 'eva' }).sala
    expect(s.asientos[3]).toMatchObject({ nombre: 'eva' })
  })
})

describe('compatibilidad con mesas guardadas antes', () => {
  it('normalizarSala completa los campos que faltan', () => {
    const vieja = { ...nuevaSala('VIEJA', REGLAS_POR_DEFECTO, true) } as Partial<Sala>
    delete vieja.gestos
    delete vieja.pendientes
    delete vieja.reservas
    delete vieja.modo
    const s = normalizarSala(vieja as Sala)
    expect(s.gestos).toEqual([])
    expect(s.pendientes).toEqual([])
    expect(s.reservas).toEqual([])
    expect(s.modo).toBe('amistosa')
    expect(procesarPendientes(s, 1)).toBe(s)
  })
})
