import { DurableObject } from 'cloudflare:workers'
import { ELO_BOT, cambioElo, factorK, fuerzaEquipo } from '../../src/engine/elo'
import type { Sena } from '../../src/engine/informacion'
import type { AccionMano } from '../../src/engine/mano'
import type { Asiento } from '../../src/engine/partida'
import { REGLAS_POR_DEFECTO, type Reglas } from '../../src/engine/reglas'
import {
  ESPERA_DESCONECTADO_MS,
  ESPERA_SIGUIENTE_MS,
  ErrorSala,
  anotarCambios,
  asientoDeUsuario,
  avanzarSiProcede,
  buscarRivales,
  decir,
  dejarDeBuscar,
  empezar,
  hacerSena,
  humanos,
  jugar,
  jugarAutomatico,
  levantar,
  marcarListo,
  normalizarSala,
  nuevaSala,
  parejaSentada,
  procesarPendientes,
  proximoPendiente,
  reconectar,
  reservar,
  sentar,
  turnoAutomatico,
  vistaPara,
  type CambioElo,
  type ModoMesa,
  type Sala,
} from '../../src/engine/sala'
import type { Env } from './index'
import { aleatorio, rngSeguro } from './seguridad'

/** Pausa entre jugadas automáticas para que los humanos puedan seguir la mano. */
const PAUSA_BOT_MS = 900
/** Una mesa pública arranca sola con bots si nadie la llena en este tiempo. */
const ESPERA_PUBLICA_MS = 40_000
/** Si la pareja rival no llega a tiempo, se vuelve a buscar. */
const ESPERA_RESERVA_MS = 30_000

interface Etiqueta {
  id: string
  nombre: string
}

type MensajeCliente =
  | { tipo: 'sentarse'; asiento?: Asiento }
  | { tipo: 'levantarse' }
  | { tipo: 'empezar' }
  | { tipo: 'accion'; accion: AccionMano }
  | { tipo: 'listo' }
  | { tipo: 'chat'; texto: string }
  | { tipo: 'sena'; sena: Sena }
  | { tipo: 'buscarRivales' }
  | { tipo: 'dejarDeBuscar' }

/**
 * Una mesa de mus online. Guarda la `Sala` en su almacenamiento, recibe a los
 * jugadores por WebSocket (con hibernación) y envía a cada uno sólo su vista.
 */
export class Mesa extends DurableObject<Env> {
  private sala: Sala | null = null
  private tiempos: { esperandoDesde: number | null; reservadoEn: number | null } | null = null

  private async cargar(): Promise<Sala | null> {
    if (!this.sala) {
      const guardada = await this.ctx.storage.get<Sala>('sala')
      this.sala = guardada ? normalizarSala(guardada) : null
    }
    if (!this.tiempos) this.tiempos = (await this.ctx.storage.get<typeof this.tiempos>('tiempos')) ?? { esperandoDesde: null, reservadoEn: null }
    return this.sala
  }

  private async guardar(s: Sala) {
    this.sala = s
    await this.ctx.storage.put('sala', s)
  }

  private async guardarTiempos(cambios: Partial<NonNullable<typeof this.tiempos>>) {
    this.tiempos = { ...this.tiempos!, ...cambios }
    await this.ctx.storage.put('tiempos', this.tiempos)
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/iniciar' && req.method === 'POST') {
      const { codigo, publica, reglas, modo } = (await req.json()) as { codigo: string; publica: boolean; reglas?: Partial<Reglas>; modo?: ModoMesa }
      if (!(await this.cargar())) {
        await this.guardar(nuevaSala(codigo, { ...REGLAS_POR_DEFECTO, ...reglas }, publica, { modo: modo ?? 'amistosa', modoSenas: 'avatar' }))
        if (publica) {
          await this.guardarTiempos({ esperandoDesde: Date.now() })
          await this.ctx.storage.setAlarm(Date.now() + ESPERA_PUBLICA_MS)
        }
      }
      return Response.json({ ok: true })
    }

    if (url.pathname === '/estado') {
      const s = await this.cargar()
      if (!s) return Response.json({ existe: false })
      return Response.json({ existe: true, fase: s.fase, humanos: humanos(s), publica: s.publica, modo: s.modo, buscando: s.buscandoDesde !== null })
    }

    if (url.pathname === '/pareja') {
      const s = await this.cargar()
      return Response.json({ pareja: s && s.fase === 'esperando' && s.buscandoDesde !== null ? parejaSentada(s) : null })
    }

    if (url.pathname === '/reservar' && req.method === 'POST') {
      const s = await this.cargar()
      if (!s || s.fase !== 'esperando') return Response.json({ ok: false })
      const { reservas } = (await req.json()) as { reservas: { id: string; asiento: Asiento }[] }
      await this.guardarTiempos({ reservadoEn: Date.now() })
      await this.cambiar(reservar(s, reservas))
      return Response.json({ ok: true })
    }

    if (url.pathname === '/mover' && req.method === 'POST') {
      const s = await this.cargar()
      const { destino } = (await req.json()) as { destino: string }
      for (const ws of this.ctx.getWebSockets()) ws.send(JSON.stringify({ tipo: 'mover', codigo: destino }))
      if (s) await this.cambiar(dejarDeBuscar(s))
      return Response.json({ ok: true })
    }

    if (req.headers.get('Upgrade') === 'websocket') {
      const s = await this.cargar()
      if (!s) return new Response('La mesa no existe', { status: 404 })
      const usuario: Etiqueta = { id: req.headers.get('x-usuario-id')!, nombre: req.headers.get('x-usuario-nombre')! }
      const par = new WebSocketPair()
      const [cliente, servidor] = [par[0], par[1]]
      this.ctx.acceptWebSocket(servidor)
      servidor.serializeAttachment(usuario)
      // Al entrar, se sienta (o recupera su asiento) si hay sitio; si no, mira como espectador.
      const { sala } = sentar(s, usuario)
      await this.cambiar(sala)
      return new Response(null, { status: 101, webSocket: cliente })
    }

    return new Response('No encontrado', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, mensaje: string | ArrayBuffer) {
    const usuario = ws.deserializeAttachment() as Etiqueta
    const s = await this.cargar()
    if (!s || typeof mensaje !== 'string' || mensaje.length > 4000) return
    let m: MensajeCliente
    try {
      m = JSON.parse(mensaje)
    } catch {
      return
    }
    const rng = rngSeguro()
    const asiento = asientoDeUsuario(s, usuario.id)
    try {
      switch (m.tipo) {
        case 'sentarse': {
          const r = sentar(s, usuario, m.asiento)
          if (r.asiento === null) return this.error(ws, 'No hay sitio libre en esta mesa')
          return await this.cambiar(r.sala)
        }
        case 'levantarse':
          return await this.cambiar(levantar(s, usuario.id))
        case 'empezar':
          if (asiento === null) return this.error(ws, 'Siéntate para empezar la partida')
          if (s.modo === 'individual') return this.error(ws, 'Las mesas puntuables empiezan solas cuando se llenan')
          await this.quitarDeBusqueda(s)
          return await this.cambiar(empezar(s, rng))
        case 'accion':
          if (asiento === null) return this.error(ws, 'No estás sentado en esta mesa')
          return await this.cambiar(jugar(s, asiento, m.accion, rng))
        case 'listo':
          if (asiento === null) return
          return await this.cambiar(avanzarSiProcede(marcarListo(s, asiento), rng))
        case 'chat':
          return await this.cambiar(decir(s, asiento, usuario.nombre, String(m.texto ?? '')))
        case 'sena':
          if (asiento === null) return
          return await this.cambiar(hacerSena(s, asiento, m.sena, rng))
        case 'buscarRivales': {
          if (asiento === null) return
          const buscando = buscarRivales(s)
          await this.cambiar(buscando)
          return await this.registrarBusqueda(buscando)
        }
        case 'dejarDeBuscar':
          await this.quitarDeBusqueda(s)
          return await this.cambiar(dejarDeBuscar(s))
      }
    } catch (e) {
      if (e instanceof ErrorSala) return this.error(ws, e.message)
      throw e
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.desconectar(ws)
  }

  async webSocketError(ws: WebSocket) {
    await this.desconectar(ws)
  }

  private async desconectar(ws: WebSocket) {
    const usuario = ws.deserializeAttachment() as Etiqueta
    const s = await this.cargar()
    if (!s) return
    // Puede tener otra pestaña abierta: sólo se desconecta si no le queda ninguna.
    const sigue = this.ctx.getWebSockets().some((o) => o !== ws && (o.deserializeAttachment() as Etiqueta).id === usuario.id)
    if (sigue) return
    if (s.fase === 'esperando' && s.buscandoDesde !== null) await this.quitarDeBusqueda(s)
    await this.cambiar(s.fase === 'esperando' ? levantar(s, usuario.id) : reconectar(s, usuario.id, false))
  }

  /** Avanza lo automático: gestos de bots, bots, ausentes, siguiente mano, reservas y mesas públicas. */
  async alarm() {
    let s = await this.cargar()
    if (!s) return
    const ahora = Date.now()
    const rng = rngSeguro()
    const t = this.tiempos!

    s = procesarPendientes(s, ahora)
    if (s.fase === 'esperando') {
      if (s.publica && t.esperandoDesde !== null && ahora - t.esperandoDesde >= ESPERA_PUBLICA_MS && humanos(s) > 0) s = empezar(s, rng)
      else if (s.reservas.length > 0 && t.reservadoEn !== null && ahora - t.reservadoEn >= ESPERA_RESERVA_MS) {
        // La pareja rival no ha llegado: se vuelve a buscar.
        await this.guardarTiempos({ reservadoEn: null })
        s = buscarRivales({ ...s, reservas: [] }, ahora)
        await this.cambiar(s)
        return this.registrarBusqueda(s)
      }
    } else if (s.fase === 'jugando') {
      const auto = turnoAutomatico(s, ahora)
      if (auto !== null) s = jugarAutomatico(s, auto, rng, ahora)
      else s = avanzarSiProcede(s, rng, ahora)
    }
    await this.cambiar(s)
  }

  private async cambiar(s: Sala): Promise<void> {
    const anterior = this.sala
    await this.guardar(s)
    if (s.fase === 'esperando' && humanos(s) === 4 && (s.publica || s.modo === 'parejas')) {
      // Mesa puntuable llena: empieza ya.
      return this.cambiar(empezar(s, rngSeguro()))
    }
    if (s.fase === 'terminada' && anterior?.fase !== 'terminada') {
      const cambios = await this.registrarResultado(s)
      if (cambios.length) {
        s = anotarCambios(s, cambios)
        await this.guardar(s)
      }
    }
    this.difundir(s)
    await this.programar(s)
  }

  private difundir(s: Sala) {
    for (const ws of this.ctx.getWebSockets()) {
      const u = ws.deserializeAttachment() as Etiqueta
      try {
        ws.send(JSON.stringify({ tipo: 'vista', vista: vistaPara(s, asientoDeUsuario(s, u.id)) }))
      } catch {
        // Conexión cerrándose: se limpia en webSocketClose.
      }
    }
  }

  private error(ws: WebSocket, mensaje: string) {
    ws.send(JSON.stringify({ tipo: 'error', mensaje }))
  }

  /** Programa la próxima alarma según lo que esté pendiente. */
  private async programar(s: Sala) {
    const ahora = Date.now()
    const t = this.tiempos!
    const candidatos: number[] = []
    const gesto = proximoPendiente(s)
    if (gesto !== null) candidatos.push(gesto)
    if (s.fase === 'esperando') {
      if (s.publica && t.esperandoDesde !== null) candidatos.push(t.esperandoDesde + ESPERA_PUBLICA_MS)
      if (s.reservas.length > 0 && t.reservadoEn !== null) candidatos.push(t.reservadoEn + ESPERA_RESERVA_MS)
    }
    if (s.fase === 'jugando' && s.partida) {
      const e = s.partida.mano
      if (turnoAutomatico(s, ahora) !== null) candidatos.push(ahora + PAUSA_BOT_MS)
      else if (e.fase === 'fin' && s.finManoEn !== null) candidatos.push(s.finManoEn + ESPERA_SIGUIENTE_MS)
      else {
        // Humano desconectado con el turno: se le espera un tiempo antes de que juegue un bot por él.
        const o = s.asientos.find((x) => x?.tipo === 'humano' && !x.conectado && x.desconectadoDesde !== null)
        if (o?.tipo === 'humano') candidatos.push(o.desconectadoDesde! + ESPERA_DESCONECTADO_MS)
      }
    }
    if (candidatos.length === 0) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(Math.max(Math.min(...candidatos), ahora + 50))
  }

  // -------------------------------------------------------------------------
  // Emparejamiento de parejas
  // -------------------------------------------------------------------------

  private vestibulo() {
    return this.env.VESTIBULO.get(this.env.VESTIBULO.idFromName('global'))
  }

  private async registrarBusqueda(s: Sala) {
    const pareja = parejaSentada(s)
    if (!pareja) return
    const elo = await this.eloPareja(pareja[0].id, pareja[1].id)
    await this.vestibulo().fetch('https://vestibulo/parejas/registrar', { method: 'POST', body: JSON.stringify({ codigo: s.codigo, elo }) })
  }

  private async quitarDeBusqueda(s: Sala) {
    if (s.buscandoDesde === null) return
    await this.vestibulo().fetch('https://vestibulo/parejas/quitar', { method: 'POST', body: JSON.stringify({ codigo: s.codigo }) })
  }

  private async eloPareja(a: string, b: string): Promise<number> {
    const fila = await this.env.DB.prepare('SELECT elo FROM parejas WHERE id = ?').bind(idPareja(a, b)).first<{ elo: number }>()
    return fila?.elo ?? 1200
  }

  // -------------------------------------------------------------------------
  // Resultado y puntuación
  // -------------------------------------------------------------------------

  /** Guarda la partida y, si es puntuable, actualiza el ranking. Devuelve los cambios para mostrarlos. */
  private async registrarResultado(s: Sala): Promise<CambioElo[]> {
    const r = s.resultado
    if (!r || r.humanos.length === 0) return []
    const db = this.env.DB
    const id = aleatorio(12)
    const ahora = Date.now()
    const gana = (asiento: number) => asiento % 2 === r.ganador
    const cambios: CambioElo[] = []
    const cambioPorUsuario = new Map<string, number>()
    const sentencias: D1PreparedStatement[] = []

    if (s.modo === 'individual') {
      const ids = r.humanos.map((h) => h.id)
      const filas = await db
        .prepare(`SELECT id, elo, partidas_elo FROM usuarios WHERE id IN (${ids.map(() => '?').join(',')})`)
        .bind(...ids)
        .all<{ id: string; elo: number; partidas_elo: number }>()
      const datos = new Map(filas.results.map((f) => [f.id, f]))
      const eloAsiento = (a: number) => {
        const h = r.humanos.find((x) => x.asiento === a)
        return h ? (datos.get(h.id)?.elo ?? 1200) : ELO_BOT
      }
      const fuerza = (eq: number) => fuerzaEquipo([eloAsiento(eq), eloAsiento(eq + 2)])
      for (const h of r.humanos) {
        const d = datos.get(h.id)
        if (!d) continue
        const eq = h.asiento % 2
        const delta = cambioElo(fuerza(eq), fuerza(1 - eq), gana(h.asiento), factorK(d.partidas_elo))
        cambios.push({ asiento: h.asiento, antes: d.elo, despues: d.elo + delta })
        cambioPorUsuario.set(h.id, delta)
        sentencias.push(
          db
            .prepare('UPDATE usuarios SET elo = elo + ?, partidas_elo = partidas_elo + 1, ganadas_elo = ganadas_elo + ? WHERE id = ?')
            .bind(delta, gana(h.asiento) ? 1 : 0, h.id),
        )
      }
    } else if (s.modo === 'parejas') {
      // Cada equipo es una pareja de dos humanos o una pareja de bots (1200).
      const equipos = [0, 1].map((eq) => {
        const miembros = r.humanos.filter((h) => h.asiento % 2 === eq)
        return miembros.length === 2 ? { eq, pareja: idPareja(miembros[0].id, miembros[1].id), miembros } : { eq, pareja: null, miembros }
      })
      const ids = equipos.flatMap((e) => (e.pareja ? [e.pareja] : []))
      const filas = ids.length
        ? (await db.prepare(`SELECT id, elo, partidas FROM parejas WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: string; elo: number; partidas: number }>())
            .results
        : []
      const datos = new Map(filas.map((f) => [f.id, f]))
      const fuerza = (eq: number) => {
        const e = equipos[eq]
        return e.pareja ? (datos.get(e.pareja)?.elo ?? 1200) : ELO_BOT
      }
      for (const e of equipos) {
        if (!e.pareja) continue
        const d = datos.get(e.pareja) ?? { elo: 1200, partidas: 0 }
        const delta = cambioElo(fuerza(e.eq), fuerza(1 - e.eq), e.eq === r.ganador, factorK(d.partidas))
        const [a, b] = e.pareja.split(':')
        sentencias.push(
          db
            .prepare(
              `INSERT INTO parejas (id, usuario_a, usuario_b, elo, partidas, ganadas, actualizado) VALUES (?, ?, ?, ?, 1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET elo = elo + ?, partidas = partidas + 1, ganadas = ganadas + ?, actualizado = ?`,
            )
            .bind(e.pareja, a, b, 1200 + delta, e.eq === r.ganador ? 1 : 0, ahora, delta, e.eq === r.ganador ? 1 : 0, ahora),
        )
        for (const m of e.miembros) {
          cambios.push({ asiento: m.asiento, antes: d.elo, despues: d.elo + delta })
          cambioPorUsuario.set(m.id, delta)
        }
      }
    }

    const tipo = s.modo
    sentencias.unshift(
      db
        .prepare('INSERT INTO partidas (id, modo, mesa, creada, juegos_0, juegos_1, ganador, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, 'online', s.codigo, ahora, r.juegos[0], r.juegos[1], r.ganador, tipo),
    )
    for (const h of r.humanos)
      sentencias.splice(
        1,
        0,
        db
          .prepare('INSERT OR IGNORE INTO partida_jugadores (partida_id, usuario_id, nombre, equipo, gano, elo_cambio) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(id, h.id, h.nombre, h.asiento % 2, gana(h.asiento) ? 1 : 0, cambioPorUsuario.get(h.id) ?? null),
      )
    await db.batch(sentencias)
    return cambios
  }
}

/** Identificador estable de una pareja, sin importar el orden. */
export function idPareja(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}
