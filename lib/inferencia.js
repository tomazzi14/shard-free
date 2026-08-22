// Lanza el modelo repartido entre los peers del plan.
//
// La regla del producto vive acá: si el plan está incompleto, la inferencia no arranca.
// No hay degradado silencioso ni respuesta a medias — faltan capas, no hay modelo.

const { spawn, EventEmitter } = require('./runtime.js')

const BINARIO = './llama.cpp/build/bin/llama-cli'

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

  proc.stdout.on('data', (d) => emisor.emit('salida', d.toString()))
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
