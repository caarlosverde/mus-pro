import { DurableObject } from 'cloudflare:workers'
import type { Env } from './index'
import { codigoMesa } from './seguridad'

interface ParejaEsperando {
  codigo: string
  elo: number
  desde: number
}

/**
 * Emparejamiento. Hay una única instancia:
 *
 * - Individual: guarda las mesas públicas puntuables que se están llenando y
 *   sienta a quien busca en la primera con sitio (si no hay, abre una).
 * - Parejas: cada pareja busca desde su propia mesa. Cuando hay dos, se unen
 *   las de puntuación más parecida: la que llegó después se traslada a la mesa
 *   de la otra, que le reserva los asientos de Este y Oeste.
 */
export class Vestibulo extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const ruta = new URL(req.url).pathname
    if (ruta === '/buscar') return this.buscarIndividual()
    if (ruta === '/parejas/registrar') return this.registrarPareja((await req.json()) as { codigo: string; elo: number })
    if (ruta === '/parejas/quitar') {
      const { codigo } = (await req.json()) as { codigo: string }
      const lista = ((await this.ctx.storage.get<ParejaEsperando[]>('parejas')) ?? []).filter((p) => p.codigo !== codigo)
      await this.ctx.storage.put('parejas', lista)
      return Response.json({ ok: true })
    }
    return new Response('No encontrado', { status: 404 })
  }

  private stub(codigo: string) {
    return this.env.MESAS.get(this.env.MESAS.idFromName(codigo))
  }

  private async estado(codigo: string) {
    return (await (await this.stub(codigo).fetch('https://mesa/estado')).json()) as {
      existe: boolean
      fase?: string
      humanos?: number
      buscando?: boolean
      modo?: string
    }
  }

  private async buscarIndividual(): Promise<Response> {
    const abiertas = (await this.ctx.storage.get<string[]>('abiertas')) ?? []
    const vigentes: string[] = []
    let elegida: string | null = null

    for (const codigo of abiertas) {
      const e = await this.estado(codigo)
      if (!e.existe || e.fase !== 'esperando' || e.modo !== 'individual') continue
      vigentes.push(codigo)
      if (elegida === null && (e.humanos ?? 0) < 4) elegida = codigo
    }

    if (elegida === null) {
      elegida = codigoMesa()
      await this.stub(elegida).fetch('https://mesa/iniciar', {
        method: 'POST',
        body: JSON.stringify({ codigo: elegida, publica: true, modo: 'individual' }),
      })
      vigentes.push(elegida)
    }

    await this.ctx.storage.put('abiertas', vigentes.slice(-20))
    return Response.json({ codigo: elegida })
  }

  private async registrarPareja(nueva: { codigo: string; elo: number }): Promise<Response> {
    const lista = (await this.ctx.storage.get<ParejaEsperando[]>('parejas')) ?? []
    // Se descartan las que ya no buscan (se fueron, empezaron con bots...).
    const vigentes: ParejaEsperando[] = []
    for (const p of lista) {
      if (p.codigo === nueva.codigo) continue
      const e = await this.estado(p.codigo)
      if (e.existe && e.fase === 'esperando' && e.buscando) vigentes.push(p)
    }

    // La rival más parecida en puntuación.
    const rival = [...vigentes].sort((a, b) => Math.abs(a.elo - nueva.elo) - Math.abs(b.elo - nueva.elo))[0]
    if (!rival) {
      vigentes.push({ ...nueva, desde: Date.now() })
      await this.ctx.storage.put('parejas', vigentes.slice(-50))
      return Response.json({ emparejada: false })
    }

    const { pareja } = (await (await this.stub(nueva.codigo).fetch('https://mesa/pareja')).json()) as { pareja: { id: string }[] | null }
    if (!pareja) {
      await this.ctx.storage.put('parejas', vigentes)
      return Response.json({ emparejada: false })
    }
    // La mesa que esperaba recibe a la nueva pareja en Este y Oeste.
    await this.stub(rival.codigo).fetch('https://mesa/reservar', {
      method: 'POST',
      body: JSON.stringify({
        reservas: [
          { id: pareja[0].id, asiento: 1 },
          { id: pareja[1].id, asiento: 3 },
        ],
      }),
    })
    await this.stub(nueva.codigo).fetch('https://mesa/mover', { method: 'POST', body: JSON.stringify({ destino: rival.codigo }) })
    await this.ctx.storage.put(
      'parejas',
      vigentes.filter((p) => p.codigo !== rival.codigo),
    )
    return Response.json({ emparejada: true, codigo: rival.codigo })
  }
}
