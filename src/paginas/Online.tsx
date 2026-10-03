import { useState, type FormEvent } from 'react'
import { Etiqueta, Panel } from '../componentes/ui'
import { api, hayServidor } from '../estado/api'
import { irA } from '../estado/ruta'
import { useSesion } from '../estado/sesion'
import { useAjustes } from '../estado/ajustes'
import './Inicio.css'
import './Cuenta.css'

/** Elegir cómo jugar: contra bots u online. */
export function Jugar() {
  return (
    <>
      <div className="titulo-pagina">
        <h1>Jugar</h1>
        <p>Una vaca completa contra bots con carácter o una mesa online con amigos o con gente que no conoces.</p>
      </div>
      <div className="rejilla">
        <a className="modulo panel modulo--activo" href="#/jugar/bots">
          <div className="modulo__cabecera">
            <h2>Contra bots</h2>
            <Etiqueta tono="ok">Sin conexión</Etiqueta>
          </div>
          <p className="texto-suave">Elige compañero y rivales (el bravo, el conservador, el farolero…) y revisa tus decisiones al acabar cada mano.</p>
        </a>
        {hayServidor ? (
          <a className="modulo panel modulo--activo" href="#/online">
            <div className="modulo__cabecera">
              <h2>Online</h2>
              <Etiqueta tono="oro">Con gente</Etiqueta>
            </div>
            <p className="texto-suave">Crea una mesa para tus amigos o busca partida con otros jugadores. Los huecos se rellenan con bots.</p>
          </a>
        ) : (
          <div className="modulo panel modulo--pronto">
            <div className="modulo__cabecera">
              <h2>Online</h2>
              <Etiqueta>Próximamente</Etiqueta>
            </div>
            <p className="texto-suave">Mesas con amigos y con gente nueva, con cuenta y perfil de progreso.</p>
          </div>
        )}
      </div>
    </>
  )
}

export function Online() {
  const { usuario, cargando } = useSesion()
  const { reglas } = useAjustes()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<null | 'crear' | 'buscar' | 'unirse'>(null)

  if (!hayServidor)
    return (
      <Panel titulo="Online">
        <p className="texto-suave">El juego online todavía no está activado en esta versión de la app.</p>
      </Panel>
    )
  if (cargando) return <p className="texto-suave">Comprobando tu sesión…</p>
  if (!usuario)
    return (
      <div className="cuenta">
        <Panel titulo="Jugar online">
          <p>Para jugar con otras personas necesitas una cuenta. Sólo te pedimos un nombre de usuario y una contraseña.</p>
          <a className="boton boton--primario" href="#/cuenta">
            Entrar o crear cuenta
          </a>
        </Panel>
      </div>
    )

  const ejecutar = async (que: 'crear' | 'buscar', llamada: () => Promise<{ codigo: string }>) => {
    setError(null)
    setOcupado(que)
    try {
      irA(`mesa/${(await llamada()).codigo}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo ha fallado')
    } finally {
      setOcupado(null)
    }
  }

  const unirse = (e: FormEvent) => {
    e.preventDefault()
    const c = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (c.length !== 5) return setError('El código de mesa tiene 5 caracteres')
    irA(`mesa/${c}`)
  }

  return (
    <>
      <div className="titulo-pagina">
        <a href="#/jugar" className="volver">
          ← Jugar
        </a>
        <h1>Jugar online</h1>
        <p>Juegas como {usuario.nombre}. Tu compañero se sienta enfrente; si falta gente, los huecos los ocupan bots.</p>
      </div>
      {error && <p className="aviso aviso--mal">{error}</p>}
      <div className="rejilla">
        <Panel titulo="Con amigos">
          <p className="texto-suave">Crea una mesa y pásales el enlace o el código. Tú decides cuándo empezar.</p>
          <button
            type="button"
            className="boton boton--primario"
            disabled={ocupado !== null}
            onClick={() => ejecutar('crear', () => api('/api/mesas', { metodo: 'POST', cuerpo: { reglas } }))}
          >
            {ocupado === 'crear' ? 'Creando…' : 'Crear mesa'}
          </button>
          <form className="unirse" onSubmit={unirse}>
            <label htmlFor="codigo-mesa" className="campo__titulo">
              ¿Te han pasado un código?
            </label>
            <div className="unirse__fila">
              <input id="codigo-mesa" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} maxLength={6} placeholder="ABCDE" autoComplete="off" spellCheck={false} />
              <button type="submit" className="boton">
                Unirme
              </button>
            </div>
          </form>
        </Panel>
        <Panel titulo="Con gente nueva">
          <p className="texto-suave">
            Te sentamos en una mesa pública con otros jugadores que estén buscando. Empieza en cuanto se llena o, si no, a los 40 segundos con
            bots en los huecos. Se juega a 40 con 8 reyes.
          </p>
          <button type="button" className="boton boton--primario" disabled={ocupado !== null} onClick={() => ejecutar('buscar', () => api('/api/buscar', { metodo: 'POST' }))}>
            {ocupado === 'buscar' ? 'Buscando…' : 'Buscar partida'}
          </button>
        </Panel>
      </div>
    </>
  )
}
