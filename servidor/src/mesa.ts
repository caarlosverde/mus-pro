import { DurableObject } from 'cloudflare:workers'
import type { AccionMano } from '../../src/engine/mano'
import type { Asiento } from '../../src/engine/partida'
import { REGLAS_POR_DEFECTO, type Reglas } from '../../src/engine/reglas'
import {
  ESPERA_DESCONECTADO_MS,
  ESPERA_SIGUIENTE_MS,
  ErrorSala,
  asientoDeUsuario,
  avanzarSiProcede,
  decir,
  empezar,
  humanos,
  jugar,
  jugarAutomatico,
  levantar,
  marcarListo,
  nuevaSala,
  reconectar,
  sentar,
  turnoAutomatico,
  vistaPara,
  type Sala,
} from '../../src/engine/sala'
import type { Env } from './index'
import { aleatorio, rngSeguro } from './seguridad'

/** Pausa entre jugadas automáticas para que los humanos puedan seguir la mano. */
const PAUSA_BOT_MS = 900
/** Una mesa pública arranca sola con bots si nadie la llena en este tiempo. */
const ESPERA_PUBLICA_MS = 40_000

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

/**
 * Una mesa de mus online. Guarda la `Sala` en su almacenamiento, recibe a los
 * jugadores por WebSocket (con hibernación) y envía a cada uno sólo su vista.
 */
export class Mesa extends DurableObject<Env> {
  private sala: Sala | null = null
  private esperandoDesde: number | null = null

  private async cargar(): Promise<Sala | null> {
    if (!this.sala) this.sala = (await this.ctx.storage.get<Sala>('sala')) ?? null
    if (this.esperandoDesde === null) this.esperandoDesde = (await this.ctx.storage.get<number>('esperandoDesde')) ?? null
    return this.sala
  }

  private async guardar(s: Sala) {
    this.sala = s
    await this.ctx.storage.put('sala', s)
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname === '/iniciar' && req.method === 'POST') {
      const { codigo, publica, reglas } = (await req.json()) as { codigo: string; publica: boolean; reglas?: Partial<Reglas> }
      if (!(await this.cargar())) {
        await this.guardar(nuevaSala(codigo, { ...REGLAS_POR_DEFECTO, ...reglas }, publica))
        if (publica) {
          this.esperandoDesde = Date.now()
          await this.ctx.storage.put('esperandoDesde', this.esperandoDesde)
          await this.ctx.storage.setAlarm(Date.now() + ESPERA_PUBLICA_MS)
        }
      }
      return Response.json({ ok: true })
    }

    if (url.pathname === '/estado') {
      const s = await this.cargar()
      if (!s) return Response.json({ existe: false })
      return Response.json({ existe: true, fase: s.fase, humanos: humanos(s), publica: s.publica })
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
          return await this.cambiar(empezar(s, rng))
        case 'accion':
          if (asiento === null) return this.error(ws, 'No estás sentado en esta mesa')
          return await this.cambiar(jugar(s, asiento, m.accion, rng))
        case 'listo':
          if (asiento === null) return
          return await this.cambiar(avanzarSiProcede(marcarListo(s, asiento), rng))
        case 'chat':
          return await this.cambiar(decir(s, asiento, usuario.nombre, String(m.texto ?? '')))
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
    await this.cambiar(s.fase === 'esperando' ? levantar(s, usuario.id) : reconectar(s, usuario.id, false))
  }

  /** Avanza lo automático: bots, jugadores ausentes, siguiente mano y arranque de mesas públicas. */
  async alarm() {
    let s = await this.cargar()
    if (!s) return
    const ahora = Date.now()
    const rng = rngSeguro()

    if (s.fase === 'esperando' && s.publica && this.esperandoDesde !== null && ahora - this.esperandoDesde >= ESPERA_PUBLICA_MS && humanos(s) > 0) {
      s = empezar(s, rng)
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
    if (s.fase === 'esperando' && s.publica && humanos(s) === 4) {
      // Mesa pública llena: empieza ya.
      return this.cambiar(empezar(s, rngSeguro()))
    }
    if (s.fase === 'terminada' && anterior?.fase !== 'terminada') await this.registrarResultado(s)
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
    let cuando: number | null = null
    if (s.fase === 'esperando' && s.publica && this.esperandoDesde !== null) cuando = this.esperandoDesde + ESPERA_PUBLICA_MS
    if (s.fase === 'jugando' && s.partida) {
      const e = s.partida.mano
      if (turnoAutomatico(s, ahora) !== null) cuando = ahora + PAUSA_BOT_MS
      else if (e.fase === 'fin' && s.finManoEn !== null) cuando = s.finManoEn + ESPERA_SIGUIENTE_MS
      else {
        // Humano desconectado con el turno: se le espera un tiempo antes de que juegue un bot.
        const o = s.asientos.find((x) => x?.tipo === 'humano' && !x.conectado && x.desconectadoDesde !== null)
        if (o?.tipo === 'humano') cuando = o.desconectadoDesde! + ESPERA_DESCONECTADO_MS
      }
    }
    if (cuando === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(Math.max(cuando, ahora + 50))
  }

  private async registrarResultado(s: Sala) {
    const r = s.resultado
    if (!r || r.humanos.length === 0) return
    const id = aleatorio(12)
    const ahora = Date.now()
    const sentencias = [
      this.env.DB.prepare('INSERT INTO partidas (id, modo, mesa, creada, juegos_0, juegos_1, ganador) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
        id,
        'online',
        s.codigo,
        ahora,
        r.juegos[0],
        r.juegos[1],
        r.ganador,
      ),
      ...r.humanos.map((h) =>
        this.env.DB.prepare('INSERT OR IGNORE INTO partida_jugadores (partida_id, usuario_id, nombre, equipo, gano) VALUES (?, ?, ?, ?, ?)').bind(
          id,
          h.id,
          h.nombre,
          h.asiento % 2,
          h.asiento % 2 === r.ganador ? 1 : 0,
        ),
      ),
    ]
    await this.env.DB.batch(sentencias)
  }
}
