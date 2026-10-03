import { PERSONALIDAD_POR_ID } from '../engine/bots'
import { evaluarDecision, type Evaluacion } from '../engine/evaluador'
import type { PeticionEvaluacion } from '../engine/evaluador.worker'

type Respuesta = { id: number; resultado: Evaluacion | null; error?: string }
type Pendiente = { peticion: PeticionEvaluacion; resolver: (r: Evaluacion | null) => void; rechazar: (e: Error) => void }

let worker: Worker | null = null
/** Si el entorno no permite workers, se calcula en el hilo principal. */
let sinWorker = false
let contador = 0
const pendientes = new Map<number, Pendiente>()

function calcularAqui(p: Pendiente) {
  // Se cede un instante para que la interfaz se pinte antes del cálculo.
  setTimeout(() => {
    try {
      const { estado, heroe, opciones, personalidades, muestras, id } = p.peticion
      p.resolver(
        evaluarDecision(estado, heroe, opciones, {
          personalidades: personalidades.map((x) => PERSONALIDAD_POR_ID[x] ?? PERSONALIDAD_POR_ID.equilibrado),
          muestras,
          semilla: id * 7919 + 13,
        }),
      )
    } catch (e) {
      p.rechazar(e instanceof Error ? e : new Error(String(e)))
    }
  }, 30)
}

function pasarAHiloPrincipal() {
  sinWorker = true
  worker?.terminate()
  worker = null
  for (const [id, p] of pendientes) {
    pendientes.delete(id)
    calcularAqui(p)
  }
}

function obtenerWorker(): Worker | null {
  if (worker || sinWorker) return worker
  try {
    worker = new Worker(new URL('../engine/evaluador.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    sinWorker = true
    return null
  }
  worker.onmessage = (e: MessageEvent<Respuesta>) => {
    const p = pendientes.get(e.data.id)
    if (!p) return
    pendientes.delete(e.data.id)
    if (e.data.error) p.rechazar(new Error(e.data.error))
    else p.resolver(e.data.resultado)
  }
  worker.onerror = pasarAHiloPrincipal
  return worker
}

/** Evalúa una decisión en segundo plano (Web Worker compartido, peticiones en cola). */
export function evaluarEnSegundoPlano(datos: Omit<PeticionEvaluacion, 'id'>): Promise<Evaluacion | null> {
  const peticion: PeticionEvaluacion = { id: ++contador, ...datos }
  return new Promise((resolver, rechazar) => {
    const p: Pendiente = { peticion, resolver, rechazar }
    const w = obtenerWorker()
    if (!w) return calcularAqui(p)
    pendientes.set(peticion.id, p)
    w.postMessage(peticion)
  })
}
