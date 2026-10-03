import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ErrorApi, guardarToken, hayServidor, leerToken } from './api'
import { sincronizarProgreso } from './progreso'

export interface Usuario {
  id: string
  nombre: string
  creado: number
}

interface RespuestaSesion {
  token: string
  usuario: Usuario
  codigoRecuperacion?: string
}

interface ContextoSesion {
  usuario: Usuario | null
  /** Comprobando la sesión guardada al abrir la app. */
  cargando: boolean
  registrar: (nombre: string, contrasena: string) => Promise<string>
  entrar: (nombre: string, contrasena: string) => Promise<void>
  recuperar: (nombre: string, codigo: string, contrasena: string) => Promise<string>
  salir: () => Promise<void>
}

const Contexto = createContext<ContextoSesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(() => hayServidor && !!leerToken())

  useEffect(() => {
    if (!hayServidor || !leerToken()) return
    api<{ usuario: Usuario }>('/api/yo')
      .then((r) => {
        setUsuario(r.usuario)
        return sincronizarProgreso()
      })
      .catch((e) => {
        // Sesión caducada: se olvida. Si es un fallo de red, se conserva para reintentar.
        if (e instanceof ErrorApi && e.estado === 401) guardarToken(null)
      })
      .finally(() => setCargando(false))
  }, [])

  const abrir = useCallback(async (r: RespuestaSesion) => {
    guardarToken(r.token)
    setUsuario(r.usuario)
    await sincronizarProgreso().catch(() => {})
  }, [])

  const registrar = useCallback(
    async (nombre: string, contrasena: string) => {
      const r = await api<RespuestaSesion>('/api/registro', { metodo: 'POST', cuerpo: { nombre, contrasena }, token: null })
      await abrir(r)
      return r.codigoRecuperacion!
    },
    [abrir],
  )

  const entrar = useCallback(
    async (nombre: string, contrasena: string) => {
      await abrir(await api<RespuestaSesion>('/api/login', { metodo: 'POST', cuerpo: { nombre, contrasena }, token: null }))
    },
    [abrir],
  )

  const recuperar = useCallback(
    async (nombre: string, codigo: string, contrasena: string) => {
      const r = await api<RespuestaSesion>('/api/recuperar', { metodo: 'POST', cuerpo: { nombre, codigo, contrasena }, token: null })
      await abrir(r)
      return r.codigoRecuperacion!
    },
    [abrir],
  )

  const salir = useCallback(async () => {
    await api('/api/logout', { metodo: 'POST' }).catch(() => {})
    guardarToken(null)
    setUsuario(null)
  }, [])

  const valor = useMemo(() => ({ usuario, cargando, registrar, entrar, recuperar, salir }), [usuario, cargando, registrar, entrar, recuperar, salir])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useSesion(): ContextoSesion {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>')
  return c
}
