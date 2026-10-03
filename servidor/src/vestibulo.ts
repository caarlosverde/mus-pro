import { DurableObject } from 'cloudflare:workers'
import type { Env } from './index'
import { codigoMesa } from './seguridad'

/**
 * Emparejamiento con desconocidos. Hay una única instancia: guarda las mesas
 * públicas que se están llenando y reparte a quien busca partida en la primera
 * con sitio. Si no hay ninguna, abre una nueva.
 */
export class Vestibulo extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname !== '/buscar') return new Response('No encontrado', { status: 404 })

    const abiertas = (await this.ctx.storage.get<string[]>('abiertas')) ?? []
    const vigentes: string[] = []
    let elegida: string | null = null

    for (const codigo of abiertas) {
      const estado = (await (await this.stub(codigo).fetch('https://mesa/estado')).json()) as { existe: boolean; fase?: string; humanos?: number }
      if (!estado.existe || estado.fase !== 'esperando') continue
      vigentes.push(codigo)
      if (elegida === null && (estado.humanos ?? 0) < 4) elegida = codigo
    }

    if (elegida === null) {
      elegida = codigoMesa()
      await this.stub(elegida).fetch('https://mesa/iniciar', {
        method: 'POST',
        body: JSON.stringify({ codigo: elegida, publica: true }),
      })
      vigentes.push(elegida)
    }

    await this.ctx.storage.put('abiertas', vigentes.slice(-20))
    return Response.json({ codigo: elegida })
  }

  private stub(codigo: string) {
    return this.env.MESAS.get(this.env.MESAS.idFromName(codigo))
  }
}
