// Prueba del ranking y las señas con avatar contra el servidor en marcha.
// Juega vacas completas con 4 jugadores reales (sin bots, para que sea rápido).
// Uso: node pruebas/ranking.mjs [url-base]
import assert from 'node:assert/strict'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787'
const sufijo = Math.random().toString(36).slice(2, 6)
const ok = (t) => console.log(`  ✓ ${t}`)

async function api(ruta, { metodo = 'GET', token, cuerpo } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  return { estado: r.status, datos: await r.json().catch(() => null) }
}

async function usuario(nombre) {
  const r = await api('/api/registro', { metodo: 'POST', cuerpo: { nombre: `${nombre}_${sufijo}`, contrasena: 'clave123' } })
  assert.equal(r.estado, 201, JSON.stringify(r.datos))
  return { nombre: r.datos.usuario.nombre, token: r.datos.token }
}

/** Cliente que juega solo: corta, pasa o quiere, y hace una seña al principio de cada mano. */
function jugador(u) {
  const c = { u, ws: null, vista: null, codigo: null, gestosVistos: 0, errores: [], hizoSena: false }
  c.conectar = async (codigo) => {
    c.codigo = codigo
    const b = await api(`/api/mesas/${codigo}/billete`, { metodo: 'POST', token: u.token })
    assert.equal(b.estado, 200, JSON.stringify(b.datos))
    c.ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/mesas/${codigo}/ws?billete=${b.datos.billete}`)
    c.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.tipo === 'error') c.errores.push(m.mensaje)
      if (m.tipo === 'mover') {
        c.ws.close()
        c.conectar(m.codigo)
        return
      }
      if (m.tipo !== 'vista') return
      c.vista = m.vista
      c.gestosVistos = Math.max(c.gestosVistos, m.vista.gestos.length)
      actuar(c)
    })
    await new Promise((res, rej) => {
      c.ws.addEventListener('open', res)
      c.ws.addEventListener('error', rej)
    })
  }
  c.enviar = (m) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(m))
  return c
}

function actuar(c) {
  const v = c.vista
  if (!v?.mano || v.fase !== 'jugando') return
  if (v.mano.fase === 'fin') return c.enviar({ tipo: 'listo' })
  if (!c.hizoSena && v.misSenas.length) {
    c.hizoSena = true
    c.enviar({ tipo: 'sena', sena: v.misSenas[0] })
  }
  if (v.mano.turno !== v.miAsiento) return
  if (v.mano.fase === 'mus') return c.enviar({ tipo: 'accion', accion: { tipo: 'corto' } })
  if (v.mano.fase === 'descarte') return c.enviar({ tipo: 'accion', accion: { tipo: 'descarte', cartas: [v.mano.cartas[v.miAsiento][0]] } })
  const legales = v.mano.envite?.legales ?? []
  const accion = v.mano.envite?.fase === 'apertura' ? { tipo: 'envido', piedras: 2 } : legales.includes('quiero') ? { tipo: 'quiero' } : { tipo: 'paso' }
  c.enviar({ tipo: 'accion', accion: { tipo: 'envite', accion } })
}

const esperar = async (cond, ms, que) => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`Tiempo agotado esperando: ${que}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

console.log(`Probando ${BASE}`)
const [a, b, c, d] = await Promise.all(['ana', 'beto', 'carla', 'dani'].map(usuario))

// --- Individual: los cuatro buscan partida y caen en la misma mesa pública ----------
const codigos = []
for (const u of [a, b, c, d]) codigos.push((await api('/api/buscar', { metodo: 'POST', token: u.token })).datos.codigo)
// Puede haber mesas públicas de pruebas anteriores: se usa la del primero.
const mesaInd = codigos[0]
const ind = [a, b, c, d].map(jugador)
for (const j of ind) await j.conectar(mesaInd)
await esperar(() => ind.every((j) => j.vista?.fase === 'jugando'), 10000, 'que empiece la mesa individual')
assert.equal(ind[0].vista.modo, 'individual')
assert.equal(ind[0].vista.modoSenas, 'avatar')
ok(`mesa individual ${mesaInd}: 4 humanos, empieza sola, señas con avatar`)

await esperar(() => ind.some((j) => j.gestosVistos > 0), 15000, 'algún gesto de seña')
const conSena = ind.find((j) => j.hizoSena)
assert.ok(conSena, 'alguien debía hacer una seña')
ok('las señas hechas con el avatar llegan a toda la mesa')

await esperar(() => ind.every((j) => j.vista?.fase === 'terminada' && j.vista.resultado?.cambios?.length === 4), 240000, 'el final de la vaca individual')
const res = ind[0].vista.resultado
for (const cambio of res.cambios) {
  const gano = cambio.asiento % 2 === res.ganador
  assert.equal(gano, cambio.despues > cambio.antes, 'los ganadores suben y los perdedores bajan')
}
ok(`vaca individual terminada ${res.juegos.join('-')}: puntos ${res.cambios.map((x) => `${x.antes}→${x.despues}`).join(', ')}`)
for (const j of ind) j.ws.close()

let r = await api('/api/ranking/individual')
const nombres = r.datos.ranking.map((x) => x.nombre)
for (const u of [a, b, c, d]) assert.ok(nombres.includes(u.nombre))
ok('los cuatro aparecen en el ranking individual')

// --- Parejas: ana+beto contra carla+dani -----------------------------------------
const mesa1 = (await api('/api/mesas', { metodo: 'POST', token: a.token, cuerpo: {} })).datos.codigo
const mesa2 = (await api('/api/mesas', { metodo: 'POST', token: c.token, cuerpo: {} })).datos.codigo
const [pa, pb, pc, pd] = [a, b, c, d].map(jugador)
await pa.conectar(mesa1)
await pb.conectar(mesa1)
await pc.conectar(mesa2)
await pd.conectar(mesa2)
await esperar(() => pa.vista?.jugadores[2].tipo === 'humano' && pc.vista?.jugadores[2].tipo === 'humano', 5000, 'parejas sentadas')
pa.enviar({ tipo: 'buscarRivales' })
await esperar(() => pa.vista?.buscandoDesde !== null && pa.vista?.modo === 'parejas', 5000, 'que la pareja 1 busque')
pc.enviar({ tipo: 'buscarRivales' })
await esperar(() => [pc, pd].every((j) => j.codigo === mesa1) && pa.vista?.fase === 'jugando', 15000, 'el emparejamiento y el traslado de la pareja 2')
assert.deepEqual(
  pa.vista.jugadores.map((j) => j.nombre),
  [a.nombre, c.nombre, b.nombre, d.nombre],
)
ok(`emparejamiento de parejas: ${c.nombre} y ${d.nombre} se trasladan a la mesa ${mesa1} (Este y Oeste)`)

await esperar(() => pa.vista?.fase === 'terminada' && pa.vista.resultado?.cambios?.length === 4, 240000, 'el final de la vaca de parejas')
const rp = pa.vista.resultado
ok(`vaca de parejas terminada ${rp.juegos.join('-')}: ${rp.cambios.map((x) => `${x.antes}→${x.despues}`).join(', ')}`)
for (const j of [pa, pb, pc, pd]) j.ws.close()

r = await api('/api/ranking/parejas')
const duo = (x, y) => r.datos.ranking.some((p) => [p.jugador1, p.jugador2].sort().join() === [x.nombre, y.nombre].sort().join())
assert.ok(duo(a, b) && duo(c, d))
ok('las dos parejas aparecen en el ranking de parejas')

r = await api(`/api/perfil/${a.nombre}`)
assert.ok(r.datos.ranking.individual.partidas >= 1)
assert.equal(r.datos.ranking.parejas[0].companero, b.nombre)
ok('el perfil muestra la puntuación individual y la de pareja')

console.log('\nRanking y señas: todo correcto.')
process.exit(0)
