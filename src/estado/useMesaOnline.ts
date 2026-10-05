import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sena } from '../engine/informacion'
import type { AccionMano } from '../engine/mano'
import type { Asiento } from '../engine/partida'
import type { VistaMesa } from '../engine/sala'
import { api, urlWebSocket } from './api'
import { irA } from './ruta'

export type MensajeMesa =
  | { tipo: 'sentarse'; asiento?: Asiento }
  | { tipo: 'levantarse' }
  | { tipo: 'empezar' }
  | { tipo: 'accion'; accion: AccionMano }
  | { tipo: 'listo' }
  | { tipo: 'chat'; texto: string }
  | { tipo: 'sena'; sena: Sena }
  | { tipo: 'buscarRivales' }
  | { tipo: 'dejarDeBuscar' }

export type EstadoConexion = 'conectando' | 'conectado' | 'reconectando' | 'error'

/**
 * Conexión en tiempo real con una mesa online. Pide un billete de un solo uso,
 * abre el WebSocket y se reconecta solo (con esperas crecientes) si se corta.
 */
export function useMesaOnline(codigo: string) {
  const [vista, setVista] = useState<VistaMesa | null>(null)
  const [estado, setEstado] = useState<EstadoConexion>('conectando')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    let cerrada = false
    let intentos = 0
    let temporizador: ReturnType<typeof setTimeout> | undefined

    const conectar = async () => {
      try {
        const { billete } = await api<{ billete: string }>(`/api/mesas/${codigo}/billete`, { metodo: 'POST' })
        if (cerrada) return
        const s = new WebSocket(urlWebSocket(`/api/mesas/${codigo}/ws?billete=${encodeURIComponent(billete)}`))
        ws.current = s
        s.onopen = () => {
          intentos = 0
          setEstado('conectado')
          setError(null)
        }
        s.onmessage = (ev) => {
          const m = JSON.parse(ev.data as string) as { tipo: 'vista'; vista: VistaMesa } | { tipo: 'error'; mensaje: string } | { tipo: 'mover'; codigo: string }
          if (m.tipo === 'vista') setVista(m.vista)
          else if (m.tipo === 'mover') {
            // Emparejados con otra pareja: nos vamos a su mesa.
            cerrada = true
            s.close()
            irA(`mesa/${m.codigo}`)
          } else {
            setAviso(m.mensaje)
            setTimeout(() => setAviso(null), 4000)
          }
        }
        s.onclose = () => {
          if (cerrada) return
          setEstado('reconectando')
          reintentar()
        }
      } catch (e) {
        if (cerrada) return
        const mensaje = e instanceof Error ? e.message : 'No se pudo conectar'
        // Mesa inexistente o sesión caducada: no tiene sentido reintentar.
        if (/no existe|iniciar sesión|caducado/i.test(mensaje)) {
          setEstado('error')
          setError(mensaje)
          return
        }
        setEstado('reconectando')
        reintentar()
      }
    }

    const reintentar = () => {
      intentos++
      temporizador = setTimeout(conectar, Math.min(15000, 800 * 2 ** Math.min(intentos, 5)))
    }

    conectar()
    return () => {
      cerrada = true
      clearTimeout(temporizador)
      ws.current?.close()
      ws.current = null
    }
  }, [codigo])

  const enviar = useCallback((m: MensajeMesa) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m))
    else {
      setAviso('Sin conexión con la mesa: reconectando…')
      setTimeout(() => setAviso(null), 3000)
    }
  }, [])

  return { vista, estado, error, aviso, enviar }
}
