import type { Evaluacion } from '../engine/evaluador'
import type { PeticionEvaluacion } from '../engine/evaluador.worker'

type Respuesta = { id: number; resultado: Evaluacion | null; error?: string }

let worker: Worker | null = null
let contador = 0
const pendientes = new Map<number, { resolver: (r: Evaluacion | null) => void; rechazar: (e: Error) => void }>()

function obtenerWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../engine/evaluador.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<Respuesta>) => {
    const p = pendientes.get(e.data.id)
    if (!p) return
    pendientes.delete(e.data.id)
    if (e.data.error) p.rechazar(new Error(e.data.error))
    else p.resolver(e.data.resultado)
  }
  return worker
}

/** Evalúa una decisión en segundo plano (Web Worker compartido, peticiones en cola). */
export function evaluarEnSegundoPlano(peticion: Omit<PeticionEvaluacion, 'id'>): Promise<Evaluacion | null> {
  const id = ++contador
  return new Promise((resolver, rechazar) => {
    pendientes.set(id, { resolver, rechazar })
    obtenerWorker().postMessage({ id, ...peticion })
  })
}
