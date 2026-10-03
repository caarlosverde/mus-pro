import { useEffect, useState, type FormEvent } from 'react'
import { Panel, Segmentado } from '../componentes/ui'
import { api, hayServidor } from '../estado/api'
import { irA } from '../estado/ruta'
import { useSesion } from '../estado/sesion'
import './Cuenta.css'

type Modo = 'entrar' | 'crear' | 'recuperar'
const RE_NOMBRE = /^[A-Za-z0-9_]{3,20}$/

export function Cuenta() {
  const { usuario, cargando, salir } = useSesion()
  const [modo, setModo] = useState<Modo>('entrar')
  const [codigoNuevo, setCodigoNuevo] = useState<string | null>(null)

  if (!hayServidor)
    return (
      <Panel titulo="Cuentas">
        <p className="texto-suave">Las cuentas y el juego online todavía no están activados en esta versión de la app.</p>
      </Panel>
    )

  if (codigoNuevo) return <CodigoRecuperacion codigo={codigoNuevo} onSeguir={() => irA('perfil')} />

  if (cargando) return <p className="texto-suave">Comprobando tu sesión…</p>

  if (usuario)
    return (
      <div className="cuenta">
        <Panel titulo={`Hola, ${usuario.nombre}`}>
          <p className="texto-suave">Tu progreso se guarda en tu cuenta y se sincroniza entre tus dispositivos.</p>
          <div className="acciones">
            <a className="boton boton--primario" href="#/perfil">
              Ver mi perfil
            </a>
            <a className="boton" href="#/online">
              Jugar online
            </a>
            <button type="button" className="boton" onClick={() => salir()}>
              Cerrar sesión
            </button>
          </div>
        </Panel>
      </div>
    )

  return (
    <div className="cuenta">
      <div className="titulo-pagina">
        <h1>Tu cuenta</h1>
        <p>Sólo necesitas un nombre de usuario y una contraseña. Sin email ni datos personales.</p>
      </div>
      <Panel>
        <Segmentado
          etiqueta="Qué quieres hacer"
          valor={modo}
          onChange={setModo}
          opciones={[
            { valor: 'entrar', texto: 'Entrar' },
            { valor: 'crear', texto: 'Crear cuenta' },
            { valor: 'recuperar', texto: 'He olvidado la contraseña' },
          ]}
        />
        {modo === 'entrar' && <FormEntrar />}
        {modo === 'crear' && <FormCrear onCreada={setCodigoNuevo} />}
        {modo === 'recuperar' && <FormRecuperar onRecuperada={setCodigoNuevo} />}
      </Panel>
    </div>
  )
}

function useEnvio() {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = (accion: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await accion()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo ha fallado')
    } finally {
      setEnviando(false)
    }
  }
  return { error, enviando, enviar }
}

function FormEntrar() {
  const { entrar } = useSesion()
  const [nombre, setNombre] = useState('')
  const [contrasena, setContrasena] = useState('')
  const { error, enviando, enviar } = useEnvio()
  return (
    <form className="formulario" onSubmit={enviar(async () => {
      await entrar(nombre.trim(), contrasena)
      irA('perfil')
    })}>
      <Campo id="entrar-nombre" etiqueta="Nombre de usuario">
        <input id="entrar-nombre" autoComplete="username" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </Campo>
      <Campo id="entrar-contrasena" etiqueta="Contraseña">
        <input id="entrar-contrasena" type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
      </Campo>
      {error && <p className="aviso aviso--mal">{error}</p>}
      <button type="submit" className="boton boton--primario" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

function FormCrear({ onCreada }: { onCreada: (codigo: string) => void }) {
  const { registrar } = useSesion()
  const [nombre, setNombre] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [repetida, setRepetida] = useState('')
  const [disponible, setDisponible] = useState<boolean | null>(null)
  const { error, enviando, enviar } = useEnvio()
  const valido = RE_NOMBRE.test(nombre)

  // Comprueba si el nombre está libre mientras se escribe (con una pequeña pausa).
  useEffect(() => {
    if (!valido) return
    let vigente = true
    const t = setTimeout(() => {
      api<{ disponible: boolean }>(`/api/nombre/${encodeURIComponent(nombre)}`, { token: null })
        .then((r) => vigente && setDisponible(r.disponible))
        .catch(() => vigente && setDisponible(null))
    }, 350)
    return () => {
      vigente = false
      clearTimeout(t)
      setDisponible(null)
    }
  }, [nombre, valido])

  const coinciden = contrasena === repetida
  const estadoNombre = !nombre
    ? 'De 3 a 20 caracteres: letras sin acentos, números o guion bajo.'
    : !valido
      ? 'Sólo letras sin acentos, números o guion bajo (de 3 a 20).'
      : disponible === null
        ? 'Comprobando…'
        : disponible
          ? '¡Libre!'
          : 'Ese nombre ya está cogido.'

  return (
    <form className="formulario" onSubmit={enviar(async () => {
      if (!coinciden) throw new Error('Las contraseñas no coinciden')
      onCreada(await registrar(nombre, contrasena))
    })}>
      <Campo id="crear-nombre" etiqueta="Nombre de usuario" ayuda={estadoNombre} tono={valido && disponible === true ? 'ok' : valido && disponible === false ? 'mal' : undefined}>
        <input id="crear-nombre" autoComplete="username" value={nombre} onChange={(e) => setNombre(e.target.value.trim())} maxLength={20} required />
      </Campo>
      <Campo id="crear-contrasena" etiqueta="Contraseña" ayuda="Al menos 6 caracteres.">
        <input id="crear-contrasena" type="password" autoComplete="new-password" minLength={6} value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
      </Campo>
      <Campo id="crear-repetida" etiqueta="Repite la contraseña" ayuda={repetida && !coinciden ? 'No coinciden.' : undefined} tono={repetida && !coinciden ? 'mal' : undefined}>
        <input id="crear-repetida" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} required />
      </Campo>
      {error && <p className="aviso aviso--mal">{error}</p>}
      <button type="submit" className="boton boton--primario" disabled={enviando || !valido || disponible === false || !coinciden || contrasena.length < 6}>
        {enviando ? 'Creando…' : 'Crear cuenta'}
      </button>
    </form>
  )
}

function FormRecuperar({ onRecuperada }: { onRecuperada: (codigo: string) => void }) {
  const { recuperar } = useSesion()
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const { error, enviando, enviar } = useEnvio()
  return (
    <form className="formulario" onSubmit={enviar(async () => onRecuperada(await recuperar(nombre.trim(), codigo, contrasena)))}>
      <p className="texto-suave">Usa el código de recuperación que te dimos al crear la cuenta. Se cerrarán tus otras sesiones.</p>
      <Campo id="rec-nombre" etiqueta="Nombre de usuario">
        <input id="rec-nombre" autoComplete="username" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </Campo>
      <Campo id="rec-codigo" etiqueta="Código de recuperación" ayuda="Formato XXXX-XXXX-XXXX-XXXX">
        <input id="rec-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="off" spellCheck={false} required />
      </Campo>
      <Campo id="rec-contrasena" etiqueta="Contraseña nueva" ayuda="Al menos 6 caracteres.">
        <input id="rec-contrasena" type="password" autoComplete="new-password" minLength={6} value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
      </Campo>
      {error && <p className="aviso aviso--mal">{error}</p>}
      <button type="submit" className="boton boton--primario" disabled={enviando}>
        {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
      </button>
    </form>
  )
}

function Campo({ id, etiqueta, ayuda, tono, children }: { id: string; etiqueta: string; ayuda?: string; tono?: 'ok' | 'mal'; children: React.ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {ayuda && <span className={`campo__ayuda ${tono ? `campo__ayuda--${tono}` : ''}`}>{ayuda}</span>}
    </div>
  )
}

function CodigoRecuperacion({ codigo, onSeguir }: { codigo: string; onSeguir: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const copiar = () => {
    navigator.clipboard
      ?.writeText(codigo)
      .then(() => setCopiado(true))
      .catch(() => setCopiado(false))
  }
  return (
    <div className="cuenta">
      <Panel titulo="Guarda tu código de recuperación">
        <p>
          Como no usamos email, este código es la única forma de recuperar tu cuenta si olvidas la contraseña. Guárdalo en un sitio
          seguro (una nota del móvil, una foto…). No te lo volveremos a enseñar.
        </p>
        <div className="codigo-recuperacion" aria-label="Código de recuperación">
          {codigo}
        </div>
        <div className="acciones">
          <button type="button" className="boton" onClick={copiar}>
            {copiado ? 'Copiado ✓' : 'Copiar código'}
          </button>
        </div>
        <label className="casilla">
          <input id="codigo-guardado" type="checkbox" checked={guardado} onChange={(e) => setGuardado(e.target.checked)} />
          Lo he guardado
        </label>
        <button type="button" className="boton boton--primario" disabled={!guardado} onClick={onSeguir}>
          Continuar
        </button>
      </Panel>
    </div>
  )
}
