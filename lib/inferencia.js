// Lanza el modelo repartido entre los peers del plan.
//
// La regla del producto vive acá: si el plan está incompleto, la inferencia no arranca.
// No hay degradado silencioso ni respuesta a medias — faltan capas, no hay modelo.

const { spawn, EventEmitter } = require('./runtime.js')

const BINARIO = './llama.cpp/build/bin/llama-cli'

// llama-cli escupe por stdout su logo ASCII, un spinner de carga, la lista de comandos y
// al final las estadísticas. Todo mezclado con la respuesta. --log-disable no lo apaga:
// es la interfaz del propio CLI, no su log.
//
// La respuesta vive siempre entre el eco del prompt y la línea de estadísticas. Los
// pedazos llegan cortados por cualquier lado, así que esto guarda estado entre chunks.
const FINALES = ['[ Prompt:', 'Exiting...']
const GUARDA = 12 // no cortar un marcador por la mitad entre dos pedazos

class Filtro {
  constructor(prompt) {
    this.marca = `> ${prompt}`
    this.resto = ''
    this.arrancado = false
    this.terminado = false
  }

  procesar(pedazo) {
    if (this.terminado) return ''
    this.resto += pedazo

    if (!this.arrancado) {
      const i = this.resto.indexOf(this.marca)
      if (i === -1) {
        // Nos quedamos con la cola: el eco del prompt puede venir partido en dos.
        if (this.resto.length > this.marca.length) this.resto = this.resto.slice(-this.marca.length)
        return ''
      }
      const salto = this.resto.indexOf('\n', i)
      if (salto === -1) return ''
      this.resto = this.resto.slice(salto + 1)
      this.arrancado = true
    }

    for (const fin of FINALES) {
      const i = this.resto.indexOf(fin)
      if (i !== -1) {
        this.terminado = true
        const salida = this.resto.slice(0, i)
        this.resto = ''
        return salida
      }
    }

    if (this.resto.length <= GUARDA) return ''
    const salida = this.resto.slice(0, -GUARDA)
    this.resto = this.resto.slice(-GUARDA)
    return salida
  }
}

// Los argumentos salen del plan, no de la mano de nadie.
function construirArgs(plan, { modelo, prompt, ctx = 1024, nPredict = 64, fijarSplit = false }) {
  const args = ['-m', modelo, '--rpc', plan.rpc, '-c', String(ctx), '-n', String(nPredict)]

  // Cada rpc-server expone más de un dispositivo (Metal y BLAS), así que un split de un
  // valor por máquina no es correcto. Queda opcional hasta verificarlo con -v.
  if (fijarSplit) args.push('--tensor-split', plan.tensorSplit)

  // -st: una sola respuesta y termina. Sin esto abre un chat interactivo.
  args.push('-st', '--no-warmup', '-p', prompt)
  return args
}

// Devuelve un emisor: 'salida' con lo que va generando, 'log' con lo de llama.cpp,
// 'fin' al terminar bien, 'error' si algo falla. Nada se traga en silencio.
function inferir(plan, opciones) {
  const emisor = new EventEmitter()

  if (!plan.completo) {
    const err = new Error(
      `modelo incompleto: faltan las capas ${plan.faltan.desde}-${plan.faltan.hasta}`
    )
    err.faltan = plan.faltan
    // En el próximo tick, para que quien llama alcance a suscribirse al 'error'.
    setTimeout(() => emisor.emit('error', err), 0)
    return emisor
  }

  const binario = opciones.binario || BINARIO
  const args = construirArgs(plan, opciones)
  const lanzar = opciones.spawn || spawn

  emisor.args = args
  const proc = lanzar(binario, args)
  const filtro = new Filtro(opciones.prompt)

  proc.stdout.on('data', (d) => {
    const crudo = d.toString()
    emisor.emit('crudo', crudo) // la salida sin tocar, para depurar
    const limpio = filtro.procesar(crudo)
    if (limpio) emisor.emit('salida', limpio)
  })
  proc.stderr.on('data', (d) => emisor.emit('log', d.toString()))
  proc.on('error', (err) => emisor.emit('error', err))
  proc.on('exit', (code) => {
    if (code === 0) emisor.emit('fin')
    else emisor.emit('error', new Error(`llama-cli termino con codigo ${code}`))
  })

  emisor.matar = () => proc.kill()
  return emisor
}

module.exports = inferir
module.exports.construirArgs = construirArgs
module.exports.BINARIO = BINARIO
module.exports.Filtro = Filtro
