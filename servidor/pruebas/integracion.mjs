// Prueba de integración contra el servidor en marcha (por defecto, wrangler dev en local).
// Uso: node pruebas/integracion.mjs [url-base]
import assert from 'node:assert/strict'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787'
const sufijo = Math.random().toString(36).slice(2, 7)
let pasos = 0
const ok = (texto) => console.log(`  ✓ ${texto}`) || pasos++

async function api(ruta, { metodo = 'GET', token, cuerpo } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Origin: process.env.ORIGEN ?? 'http://localhost:5173', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const datos = await r.json().catch(() => null)
  return { estado: r.status, datos, cabeceras: r.headers }
}

console.log(`Probando ${BASE}`)

// --- Cuentas -----------------------------------------------------------------
const ana = `ana_${sufijo}`
const luis = `luis_${sufijo}`
let r = await api(`/api/nombre/${ana}`)
assert.equal(r.datos.disponible, true)
ok('nombre disponible')

r = await api('/api/registro', { metodo: 'POST', cuerpo: { nombre: ana, contrasena: 'secreta1' } })
assert.equal(r.estado, 201, JSON.stringify(r.datos))
assert.match(r.datos.codigoRecuperacion, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)
assert.equal(r.cabeceras.get('access-control-allow-origin'), process.env.ORIGEN ?? 'http://localhost:5173')
const recuperacionAna = r.datos.codigoRecuperacion
let tokenAna = r.datos.token
ok('registro con código de recuperación y CORS')

r = await api('/api/registro', { metodo: 'POST', cuerpo: { nombre: ana.toUpperCase(), contrasena: 'otraclave' } })
assert.equal(r.estado, 409)
ok('nombre único sin distinguir mayúsculas')

r = await api('/api/registro', { metodo: 'POST', cuerpo: { nombre: 'admin', contrasena: 'secreta1' } })
assert.equal(r.estado, 400)
r = await api('/api/registro', { metodo: 'POST', cuerpo: { nombre: 'a b', contrasena: 'secreta1' } })
assert.equal(r.estado, 400)
ok('nombres reservados o no válidos rechazados')

r = await api('/api/login', { metodo: 'POST', cuerpo: { nombre: ana, contrasena: 'mal' } })
assert.equal(r.estado, 401)
r = await api('/api/login', { metodo: 'POST', cuerpo: { nombre: ana, contrasena: 'secreta1' } })
assert.equal(r.estado, 200)
tokenAna = r.datos.token
ok('login correcto e incorrecto')

r = await api('/api/yo', { token: tokenAna })
assert.equal(r.datos.usuario.nombre, ana)
r = await api('/api/yo')
assert.equal(r.estado, 401)
ok('sesión por token')

r = await api('/api/registro', { metodo: 'POST', cuerpo: { nombre: luis, contrasena: 'secreta2' } })
const tokenLuis = r.datos.token

// --- Progreso ------------------------------------------------------------------
r = await api('/api/progreso/corte', { metodo: 'PUT', token: tokenAna, cuerpo: { valor: { intentos: 5, aciertos: 4 } } })
assert.equal(r.estado, 200)
r = await api('/api/progreso', { token: tokenAna })
assert.deepEqual(r.datos.progreso.corte.valor, { intentos: 5, aciertos: 4 })
r = await api('/api/progreso/inventado', { metodo: 'PUT', token: tokenAna, cuerpo: { valor: 1 } })
assert.equal(r.estado, 400)
ok('progreso guardado y leído')

// --- Mesa privada con dos jugadores -----------------------------------------------
r = await api('/api/mesas', { metodo: 'POST', token: tokenAna, cuerpo: {} })
assert.equal(r.estado, 201)
const codigo = r.datos.codigo
assert.match(codigo, /^[A-Z0-9]{5}$/)
ok(`mesa creada (${codigo})`)

async function conectar(token) {
  const b = await api(`/api/mesas/${codigo}/billete`, { metodo: 'POST', token })
  assert.equal(b.estado, 200)
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/mesas/${codigo}/ws?billete=${b.datos.billete}`)
  const cliente = { ws, vista: null, errores: [], fugas: 0, manos: 0 }
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.tipo === 'error') cliente.errores.push(m.mensaje)
    if (m.tipo !== 'vista') return
    const v = m.vista
    if (v.mano && v.mano.fase !== 'fin') {
      v.mano.cartas.forEach((c, a) => {
        if (a !== v.miAsiento && c !== null) cliente.fugas++
      })
    }
    if (cliente.vista?.mano?.fase !== 'fin' && v.mano?.fase === 'fin') cliente.manos++
    cliente.vista = v
    actuar(cliente)
  })
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  return cliente
}

/** Política simple: corta, y en los lances pasa o quiere. */
function actuar(c) {
  const v = c.vista
  if (!v?.mano || v.fase !== 'jugando') return
  const enviar = (m) => c.ws.send(JSON.stringify(m))
  if (v.mano.fase === 'fin') return enviar({ tipo: 'listo' })
  if (v.mano.turno !== v.miAsiento) return
  if (v.mano.fase === 'mus') return enviar({ tipo: 'accion', accion: { tipo: 'corto' } })
  if (v.mano.fase === 'descarte') return enviar({ tipo: 'accion', accion: { tipo: 'descarte', cartas: [v.mano.cartas[v.miAsiento][0]] } })
  const legales = v.mano.envite?.legales ?? []
  const accion = legales.includes('paso') && v.mano.envite.fase === 'apertura' ? { tipo: 'paso' } : legales.includes('quiero') ? { tipo: 'quiero' } : { tipo: 'paso' }
  enviar({ tipo: 'accion', accion: { tipo: 'envite', accion } })
}

const cAna = await conectar(tokenAna)
const cLuis = await conectar(tokenLuis)
const esperar = async (cond, ms = 20000) => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Tiempo de espera agotado')
    await new Promise((r) => setTimeout(r, 50))
  }
}
await esperar(() => cAna.vista?.jugadores.filter((j) => j.tipo === 'humano').length === 2 && cLuis.vista !== null && cLuis.vista.miAsiento !== null)
assert.equal(cAna.vista.miAsiento, 0)
assert.equal(cLuis.vista.miAsiento, 2)
ok('los dos se sientan como compañeros')

cAna.ws.send(JSON.stringify({ tipo: 'chat', texto: 'Te pongo pares' }))
cAna.ws.send(JSON.stringify({ tipo: 'empezar' }))
await esperar(() => cLuis.vista?.fase === 'jugando' && cLuis.vista.chat.some((m) => m.texto === 'Te pongo pares'))
ok('chat y comienzo de la partida con bots en los huecos')

// Una acción fuera de turno debe rechazarse.
const vistaAhora = cAna.vista
if (vistaAhora.mano.turno !== 0) {
  cAna.ws.send(JSON.stringify({ tipo: 'accion', accion: { tipo: 'corto' } }))
  await esperar(() => cAna.errores.length > 0)
  assert.match(cAna.errores[0], /turno/)
  ok('acción fuera de turno rechazada')
}

await esperar(() => cAna.manos >= 2 && cLuis.manos >= 2, 90000)
assert.equal(cAna.fugas + cLuis.fugas, 0, 'Se han filtrado cartas de otros jugadores')
ok(`se juegan ${cAna.manos} manos completas sin filtrar cartas ajenas`)
cAna.ws.close()
cLuis.ws.close()

// --- Recuperación de contraseña -----------------------------------------------------------
r = await api('/api/recuperar', { metodo: 'POST', cuerpo: { nombre: ana, codigo: 'XXXX-XXXX-XXXX-XXXX', contrasena: 'nueva123' } })
assert.equal(r.estado, 401)
r = await api('/api/recuperar', { metodo: 'POST', cuerpo: { nombre: ana, codigo: recuperacionAna.toLowerCase(), contrasena: 'nueva123' } })
assert.equal(r.estado, 200)
assert.notEqual(r.datos.codigoRecuperacion, recuperacionAna)
r = await api('/api/yo', { token: tokenAna })
assert.equal(r.estado, 401, 'Las sesiones antiguas deben cerrarse')
r = await api('/api/login', { metodo: 'POST', cuerpo: { nombre: ana, contrasena: 'nueva123' } })
assert.equal(r.estado, 200)
ok('recuperación con código: nueva contraseña, sesiones antiguas cerradas')
tokenAna = r.datos.token

// --- Partida contra bots y perfil ------------------------------------------------------------
r = await api('/api/partidas/bots', { metodo: 'POST', token: tokenAna, cuerpo: { juegos: [3, 1], ganador: 0 } })
assert.equal(r.estado, 201)
r = await api(`/api/perfil/${ana}`)
assert.equal(r.datos.nombre, ana)
assert.equal(r.datos.partidas.bots.jugadas, 1)
assert.equal(r.datos.partidas.bots.ganadas, 1)
assert.equal(r.datos.progreso.corte.intentos, 5)
ok('perfil con partidas y progreso')

// --- Buscar partida con desconocidos -----------------------------------------------------------
r = await api('/api/buscar', { metodo: 'POST', token: tokenAna })
assert.equal(r.estado, 200)
const publica = r.datos.codigo
r = await api('/api/buscar', { metodo: 'POST', token: tokenLuis })
assert.equal(r.datos.codigo, publica, 'Dos búsquedas seguidas deben ir a la misma mesa pública')
ok(`emparejamiento: ambos van a la mesa pública ${publica}`)

console.log(`\nTodo correcto: ${pasos} comprobaciones.`)
