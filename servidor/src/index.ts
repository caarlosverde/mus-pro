import { aleatorio, codigoMesa, codigoRecuperacion, hashContrasena, iguales, normalizarCodigo, sha256 } from './seguridad'

export { Mesa } from './mesa'
export { Vestibulo } from './vestibulo'

export interface Env {
  DB: D1Database
  MESAS: DurableObjectNamespace
  VESTIBULO: DurableObjectNamespace
  ORIGENES: string
}

interface Usuario {
  id: string
  nombre: string
  creado: number
}

const DIA = 86_400_000
const DURACION_SESION = 90 * DIA
const DURACION_BILLETE = 60_000
const VENTANA_INTENTOS = 15 * 60_000
const MAX_FALLOS = 10
const CLAVES_PROGRESO = new Set(['corte', 'problemas', 'decisiones', 'laboratorio'])
const RESERVADOS = new Set(['admin', 'administrador', 'root', 'bot', 'bots', 'sistema', 'mus', 'muspro', 'anonimo', 'invitado', 'moderador'])
const RE_NOMBRE = /^[A-Za-z0-9_]{3,20}$/
const RE_MESA = /^[A-Z0-9]{5}$/

class ErrorApi extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origen = req.headers.get('Origin')
    const permitidos = env.ORIGENES.split(',')
    const cors: Record<string, string> =
      origen && permitidos.includes(origen)
        ? {
            'Access-Control-Allow-Origin': origen,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin',
          }
        : {}
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    try {
      const r = await enrutar(req, env)
      if (r.status === 101) return r // WebSocket: sin cabeceras extra
      const h = new Headers(r.headers)
      for (const [k, v] of Object.entries(cors)) h.set(k, v)
      return new Response(r.body, { status: r.status, headers: h })
    } catch (e) {
      const estado = e instanceof ErrorApi ? e.estado : 500
      const mensaje = e instanceof ErrorApi ? e.message : 'Error interno del servidor'
      if (!(e instanceof ErrorApi)) console.error(e)
      return Response.json({ error: mensaje }, { status: estado, headers: cors })
    }
  },
} satisfies ExportedHandler<Env>

async function enrutar(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const ruta = url.pathname.replace(/\/+$/, '')
  const m = req.method

  if (ruta === '/api/salud') return Response.json({ ok: true })

  // Cuentas
  if (ruta === '/api/registro' && m === 'POST') return registro(req, env)
  if (ruta === '/api/login' && m === 'POST') return login(req, env)
  if (ruta === '/api/recuperar' && m === 'POST') return recuperar(req, env)
  if (ruta === '/api/logout' && m === 'POST') return logout(req, env)
  if (ruta === '/api/yo' && m === 'GET') return Response.json({ usuario: await requerirUsuario(req, env) })
  const disp = ruta.match(/^\/api\/nombre\/([^/]+)$/)
  if (disp && m === 'GET') return nombreDisponible(decodeURIComponent(disp[1]), env)

  // Progreso y perfil
  if (ruta === '/api/progreso' && m === 'GET') return leerProgreso(req, env)
  const prog = ruta.match(/^\/api\/progreso\/([a-z]+)$/)
  if (prog && m === 'PUT') return guardarProgreso(req, env, prog[1])
  if (ruta === '/api/partidas/bots' && m === 'POST') return partidaContraBots(req, env)
  const perfil = ruta.match(/^\/api\/perfil\/([^/]+)$/)
  if (perfil && m === 'GET') return verPerfil(decodeURIComponent(perfil[1]), env)

  // Ranking
  if (ruta === '/api/ranking/individual' && m === 'GET') return rankingIndividual(env)
  if (ruta === '/api/ranking/parejas' && m === 'GET') return rankingParejas(env)

  // Mesas
  if (ruta === '/api/mesas' && m === 'POST') return crearMesa(req, env)
  if (ruta === '/api/buscar' && m === 'POST') return buscarPartida(req, env)
  const billete = ruta.match(/^\/api\/mesas\/([A-Z0-9]{5})\/billete$/)
  if (billete && m === 'POST') return crearBillete(req, env, billete[1])
  const ws = ruta.match(/^\/api\/mesas\/([A-Z0-9]{5})\/ws$/)
  if (ws && m === 'GET') return conectarMesa(req, env, ws[1], url.searchParams.get('billete') ?? '')

  throw new ErrorApi(404, 'Ruta no encontrada')
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

async function cuerpo<T>(req: Request): Promise<T> {
  if ((Number(req.headers.get('Content-Length')) || 0) > 64_000) throw new ErrorApi(413, 'Petición demasiado grande')
  try {
    return (await req.json()) as T
  } catch {
    throw new ErrorApi(400, 'El cuerpo de la petición no es JSON válido')
  }
}

async function usuarioDe(req: Request, env: Env): Promise<Usuario | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const fila = await env.DB.prepare(
    'SELECT u.id, u.nombre, u.creado FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira > ?',
  )
    .bind(await sha256(token), Date.now())
    .first<Usuario>()
  return fila ?? null
}

async function requerirUsuario(req: Request, env: Env): Promise<Usuario> {
  const u = await usuarioDe(req, env)
  if (!u) throw new ErrorApi(401, 'Tienes que iniciar sesión')
  return u
}

async function abrirSesion(env: Env, usuario: Usuario) {
  const token = aleatorio()
  const ahora = Date.now()
  await env.DB.prepare('INSERT INTO sesiones (token_hash, usuario_id, creado, expira) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), usuario.id, ahora, ahora + DURACION_SESION)
    .run()
  return { token, usuario }
}

function validarNombre(nombre: unknown): string {
  if (typeof nombre !== 'string' || !RE_NOMBRE.test(nombre))
    throw new ErrorApi(400, 'El nombre de usuario debe tener de 3 a 20 caracteres: letras sin acentos, números o guion bajo')
  if (RESERVADOS.has(nombre.toLowerCase())) throw new ErrorApi(400, 'Ese nombre está reservado')
  return nombre
}

function validarContrasena(c: unknown): string {
  if (typeof c !== 'string' || c.length < 6 || c.length > 100) throw new ErrorApi(400, 'La contraseña debe tener al menos 6 caracteres')
  return c
}

async function comprobarIntentos(env: Env, clave: string) {
  const f = await env.DB.prepare('SELECT fallos, desde FROM intentos WHERE clave = ?').bind(clave).first<{ fallos: number; desde: number }>()
  if (f && Date.now() - f.desde < VENTANA_INTENTOS && f.fallos >= MAX_FALLOS)
    throw new ErrorApi(429, 'Demasiados intentos. Espera unos minutos y vuelve a probar')
}

async function anotarFallo(env: Env, clave: string) {
  const ahora = Date.now()
  await env.DB.prepare(
    `INSERT INTO intentos (clave, fallos, desde) VALUES (?, 1, ?)
     ON CONFLICT(clave) DO UPDATE SET
       fallos = CASE WHEN ? - desde > ? THEN 1 ELSE fallos + 1 END,
       desde = CASE WHEN ? - desde > ? THEN ? ELSE desde END`,
  )
    .bind(clave, ahora, ahora, VENTANA_INTENTOS, ahora, VENTANA_INTENTOS, ahora)
    .run()
}

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

async function registro(req: Request, env: Env) {
  const b = await cuerpo<{ nombre?: unknown; contrasena?: unknown }>(req)
  const nombre = validarNombre(b.nombre)
  const contrasena = validarContrasena(b.contrasena)
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local'
  await comprobarIntentos(env, `registro:${ip}`)

  const existe = await env.DB.prepare('SELECT 1 FROM usuarios WHERE nombre_min = ?').bind(nombre.toLowerCase()).first()
  if (existe) throw new ErrorApi(409, 'Ese nombre de usuario ya está cogido')

  const { hash, sal } = await hashContrasena(contrasena)
  const recuperacion = codigoRecuperacion()
  const usuario: Usuario = { id: aleatorio(12), nombre, creado: Date.now() }
  try {
    await env.DB.prepare('INSERT INTO usuarios (id, nombre, nombre_min, hash, sal, recuperacion_hash, creado) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(usuario.id, nombre, nombre.toLowerCase(), hash, sal, await sha256(normalizarCodigo(recuperacion)), usuario.creado)
      .run()
  } catch {
    throw new ErrorApi(409, 'Ese nombre de usuario ya está cogido')
  }
  // Se cuenta como "intento" para limitar la creación masiva de cuentas desde una misma IP.
  await anotarFallo(env, `registro:${ip}`)
  return Response.json({ ...(await abrirSesion(env, usuario)), codigoRecuperacion: recuperacion }, { status: 201 })
}

async function login(req: Request, env: Env) {
  const b = await cuerpo<{ nombre?: unknown; contrasena?: unknown }>(req)
  if (typeof b.nombre !== 'string' || typeof b.contrasena !== 'string') throw new ErrorApi(400, 'Escribe tu usuario y tu contraseña')
  const clave = `login:${b.nombre.toLowerCase()}`
  await comprobarIntentos(env, clave)
  const fila = await env.DB.prepare('SELECT id, nombre, creado, hash, sal FROM usuarios WHERE nombre_min = ?')
    .bind(b.nombre.toLowerCase())
    .first<Usuario & { hash: string; sal: string }>()
  const ok = fila ? iguales((await hashContrasena(b.contrasena, fila.sal)).hash, fila.hash) : false
  if (!fila || !ok) {
    await anotarFallo(env, clave)
    throw new ErrorApi(401, 'Usuario o contraseña incorrectos')
  }
  await env.DB.prepare('DELETE FROM intentos WHERE clave = ?').bind(clave).run()
  return Response.json(await abrirSesion(env, { id: fila.id, nombre: fila.nombre, creado: fila.creado }))
}

async function recuperar(req: Request, env: Env) {
  const b = await cuerpo<{ nombre?: unknown; codigo?: unknown; contrasena?: unknown }>(req)
  if (typeof b.nombre !== 'string' || typeof b.codigo !== 'string') throw new ErrorApi(400, 'Escribe tu usuario y tu código de recuperación')
  const contrasena = validarContrasena(b.contrasena)
  const clave = `recuperar:${b.nombre.toLowerCase()}`
  await comprobarIntentos(env, clave)
  const fila = await env.DB.prepare('SELECT id, nombre, creado, recuperacion_hash FROM usuarios WHERE nombre_min = ?')
    .bind(b.nombre.toLowerCase())
    .first<Usuario & { recuperacion_hash: string }>()
  if (!fila || !iguales(await sha256(normalizarCodigo(b.codigo)), fila.recuperacion_hash)) {
    await anotarFallo(env, clave)
    throw new ErrorApi(401, 'El usuario o el código de recuperación no son correctos')
  }
  const { hash, sal } = await hashContrasena(contrasena)
  const nuevoCodigo = codigoRecuperacion()
  // Se cierran todas las sesiones abiertas y se emite un código de recuperación nuevo.
  await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET hash = ?, sal = ?, recuperacion_hash = ? WHERE id = ?').bind(hash, sal, await sha256(normalizarCodigo(nuevoCodigo)), fila.id),
    env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(fila.id),
  ])
  const usuario = { id: fila.id, nombre: fila.nombre, creado: fila.creado }
  return Response.json({ ...(await abrirSesion(env, usuario)), codigoRecuperacion: nuevoCodigo })
}

async function logout(req: Request, env: Env) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (token) await env.DB.prepare('DELETE FROM sesiones WHERE token_hash = ?').bind(await sha256(token)).run()
  return Response.json({ ok: true })
}

async function nombreDisponible(nombre: string, env: Env) {
  if (!RE_NOMBRE.test(nombre) || RESERVADOS.has(nombre.toLowerCase())) return Response.json({ disponible: false, valido: false })
  const existe = await env.DB.prepare('SELECT 1 FROM usuarios WHERE nombre_min = ?').bind(nombre.toLowerCase()).first()
  return Response.json({ disponible: !existe, valido: true })
}

// ---------------------------------------------------------------------------
// Progreso, partidas y perfil
// ---------------------------------------------------------------------------

async function leerProgreso(req: Request, env: Env) {
  const u = await requerirUsuario(req, env)
  const { results } = await env.DB.prepare('SELECT clave, valor, actualizado FROM progreso WHERE usuario_id = ?')
    .bind(u.id)
    .all<{ clave: string; valor: string; actualizado: number }>()
  return Response.json({ progreso: Object.fromEntries(results.map((r) => [r.clave, { valor: JSON.parse(r.valor), actualizado: r.actualizado }])) })
}

async function guardarProgreso(req: Request, env: Env, clave: string) {
  const u = await requerirUsuario(req, env)
  if (!CLAVES_PROGRESO.has(clave)) throw new ErrorApi(400, 'Tipo de progreso desconocido')
  const b = await cuerpo<{ valor?: unknown }>(req)
  const texto = JSON.stringify(b.valor ?? null)
  if (texto.length > 32_000) throw new ErrorApi(413, 'Progreso demasiado grande')
  const ahora = Date.now()
  await env.DB.prepare(
    'INSERT INTO progreso (usuario_id, clave, valor, actualizado) VALUES (?, ?, ?, ?) ON CONFLICT(usuario_id, clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado',
  )
    .bind(u.id, clave, texto, ahora)
    .run()
  return Response.json({ ok: true, actualizado: ahora })
}

async function partidaContraBots(req: Request, env: Env) {
  const u = await requerirUsuario(req, env)
  const b = await cuerpo<{ juegos?: unknown; ganador?: unknown }>(req)
  const juegos = Array.isArray(b.juegos) ? b.juegos.map(Number) : []
  const ganador = Number(b.ganador)
  if (juegos.length !== 2 || juegos.some((j) => !Number.isInteger(j) || j < 0 || j > 9) || (ganador !== 0 && ganador !== 1))
    throw new ErrorApi(400, 'Resultado no válido')
  const id = aleatorio(12)
  await env.DB.batch([
    env.DB.prepare('INSERT INTO partidas (id, modo, mesa, creada, juegos_0, juegos_1, ganador) VALUES (?, ?, NULL, ?, ?, ?, ?)').bind(
      id,
      'bots',
      Date.now(),
      juegos[0],
      juegos[1],
      ganador,
    ),
    env.DB.prepare('INSERT INTO partida_jugadores (partida_id, usuario_id, nombre, equipo, gano) VALUES (?, ?, ?, 0, ?)').bind(
      id,
      u.id,
      u.nombre,
      ganador === 0 ? 1 : 0,
    ),
  ])
  return Response.json({ ok: true }, { status: 201 })
}

async function verPerfil(nombre: string, env: Env) {
  const u = await env.DB.prepare('SELECT id, nombre, creado, elo, partidas_elo, ganadas_elo FROM usuarios WHERE nombre_min = ?')
    .bind(nombre.toLowerCase())
    .first<Usuario & { elo: number; partidas_elo: number; ganadas_elo: number }>()
  if (!u) throw new ErrorApi(404, 'No existe ese usuario')
  const posicion = u.partidas_elo
    ? ((await env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE partidas_elo > 0 AND elo > ?').bind(u.elo).first<{ n: number }>())?.n ?? 0) + 1
    : null
  const parejas = await env.DB.prepare(
    `SELECT p.elo, p.partidas, p.ganadas, o.nombre AS companero,
       (SELECT COUNT(*) FROM parejas x WHERE x.elo > p.elo) + 1 AS posicion
     FROM parejas p JOIN usuarios o ON o.id = CASE WHEN p.usuario_a = ? THEN p.usuario_b ELSE p.usuario_a END
     WHERE p.usuario_a = ? OR p.usuario_b = ? ORDER BY p.elo DESC LIMIT 5`,
  )
    .bind(u.id, u.id, u.id)
    .all<{ elo: number; partidas: number; ganadas: number; companero: string; posicion: number }>()
  const totales = await env.DB.prepare(
    `SELECT p.modo, COUNT(*) AS jugadas, SUM(pj.gano) AS ganadas
     FROM partida_jugadores pj JOIN partidas p ON p.id = pj.partida_id
     WHERE pj.usuario_id = ? GROUP BY p.modo`,
  )
    .bind(u.id)
    .all<{ modo: string; jugadas: number; ganadas: number }>()
  const recientes = await env.DB.prepare(
    `SELECT p.id, p.modo, p.tipo, p.creada, p.juegos_0, p.juegos_1, pj.equipo, pj.gano, pj.elo_cambio,
       (SELECT group_concat(o.nombre || ':' || o.equipo) FROM partida_jugadores o WHERE o.partida_id = p.id AND o.usuario_id <> ?) AS otros
     FROM partida_jugadores pj JOIN partidas p ON p.id = pj.partida_id
     WHERE pj.usuario_id = ? ORDER BY p.creada DESC LIMIT 15`,
  )
    .bind(u.id, u.id)
    .all<{ id: string; modo: string; tipo: string; creada: number; juegos_0: number; juegos_1: number; equipo: number; gano: number; elo_cambio: number | null; otros: string | null }>()
  const progreso = await env.DB.prepare('SELECT clave, valor FROM progreso WHERE usuario_id = ?').bind(u.id).all<{ clave: string; valor: string }>()

  return Response.json({
    nombre: u.nombre,
    creado: u.creado,
    ranking: {
      individual: { elo: u.elo, partidas: u.partidas_elo, ganadas: u.ganadas_elo, posicion },
      parejas: parejas.results,
    },
    partidas: Object.fromEntries(totales.results.map((t) => [t.modo, { jugadas: t.jugadas, ganadas: t.ganadas ?? 0 }])),
    recientes: recientes.results.map((r) => {
      const otros = (r.otros ?? '').split(',').filter(Boolean).map((x) => x.split(':'))
      return {
        id: r.id,
        modo: r.modo,
        tipo: r.tipo,
        eloCambio: r.elo_cambio,
        creada: r.creada,
        gano: r.gano === 1,
        juegos: r.equipo === 0 ? [r.juegos_0, r.juegos_1] : [r.juegos_1, r.juegos_0],
        companeros: otros.filter(([, e]) => Number(e) === r.equipo).map(([n]) => n),
        rivales: otros.filter(([, e]) => Number(e) !== r.equipo).map(([n]) => n),
      }
    }),
    progreso: Object.fromEntries(progreso.results.map((p) => [p.clave, JSON.parse(p.valor)])),
  })
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

async function rankingIndividual(env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT nombre, elo, partidas_elo AS partidas, ganadas_elo AS ganadas FROM usuarios WHERE partidas_elo > 0 ORDER BY elo DESC, partidas_elo DESC LIMIT 100',
  ).all<{ nombre: string; elo: number; partidas: number; ganadas: number }>()
  return Response.json({ ranking: results.map((r, i) => ({ posicion: i + 1, ...r })) })
}

async function rankingParejas(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT a.nombre AS jugador1, b.nombre AS jugador2, p.elo, p.partidas, p.ganadas
     FROM parejas p JOIN usuarios a ON a.id = p.usuario_a JOIN usuarios b ON b.id = p.usuario_b
     WHERE p.partidas > 0 ORDER BY p.elo DESC, p.partidas DESC LIMIT 100`,
  ).all<{ jugador1: string; jugador2: string; elo: number; partidas: number; ganadas: number }>()
  return Response.json({ ranking: results.map((r, i) => ({ posicion: i + 1, ...r })) })
}

// ---------------------------------------------------------------------------
// Mesas
// ---------------------------------------------------------------------------

function mesa(env: Env, codigo: string) {
  return env.MESAS.get(env.MESAS.idFromName(codigo))
}

async function crearMesa(req: Request, env: Env) {
  await requerirUsuario(req, env)
  const b = await cuerpo<{ reglas?: { reyes?: unknown; piedras?: unknown; laReal?: unknown } }>(req).catch(() => ({}) as { reglas?: undefined })
  const r = b.reglas ?? {}
  const reglas = {
    reyes: r.reyes === 4 ? 4 : 8,
    piedras: r.piedras === 30 ? 30 : 40,
    laReal: r.laReal === true,
  }
  for (let intento = 0; intento < 5; intento++) {
    const codigo = codigoMesa()
    const estado = (await (await mesa(env, codigo).fetch('https://mesa/estado')).json()) as { existe: boolean }
    if (estado.existe) continue
    await mesa(env, codigo).fetch('https://mesa/iniciar', { method: 'POST', body: JSON.stringify({ codigo, publica: false, reglas, modo: 'amistosa' }) })
    return Response.json({ codigo }, { status: 201 })
  }
  throw new ErrorApi(503, 'No se pudo crear la mesa; vuelve a intentarlo')
}

async function buscarPartida(req: Request, env: Env) {
  await requerirUsuario(req, env)
  const v = env.VESTIBULO.get(env.VESTIBULO.idFromName('global'))
  return v.fetch('https://vestibulo/buscar', { method: 'POST' })
}

async function crearBillete(req: Request, env: Env, codigo: string) {
  const u = await requerirUsuario(req, env)
  if (!RE_MESA.test(codigo)) throw new ErrorApi(400, 'Código de mesa no válido')
  const estado = (await (await mesa(env, codigo).fetch('https://mesa/estado')).json()) as { existe: boolean }
  if (!estado.existe) throw new ErrorApi(404, 'No existe ninguna mesa con ese código')
  const billete = aleatorio()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM billetes WHERE expira < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO billetes (token_hash, usuario_id, mesa, expira) VALUES (?, ?, ?, ?)').bind(await sha256(billete), u.id, codigo, Date.now() + DURACION_BILLETE),
  ])
  return Response.json({ billete })
}

async function conectarMesa(req: Request, env: Env, codigo: string, billete: string) {
  if (req.headers.get('Upgrade') !== 'websocket') throw new ErrorApi(426, 'Se esperaba una conexión WebSocket')
  const hash = await sha256(billete)
  const fila = await env.DB.prepare(
    'SELECT b.usuario_id, u.nombre FROM billetes b JOIN usuarios u ON u.id = b.usuario_id WHERE b.token_hash = ? AND b.mesa = ? AND b.expira > ?',
  )
    .bind(hash, codigo, Date.now())
    .first<{ usuario_id: string; nombre: string }>()
  if (!fila) throw new ErrorApi(401, 'El acceso a la mesa ha caducado; vuelve a entrar')
  // El billete es de un solo uso.
  await env.DB.prepare('DELETE FROM billetes WHERE token_hash = ?').bind(hash).run()
  const h = new Headers(req.headers)
  h.set('x-usuario-id', fila.usuario_id)
  h.set('x-usuario-nombre', fila.nombre)
  return mesa(env, codigo).fetch(new Request(req, { headers: h }))
}
