// El proceso que presta las capas de esta máquina: el ggml-rpc-server de llama.cpp.
//
// Lo levanta la app. Antes había que abrir otra terminal y arrancarlo a mano, y si te
// olvidabas el nodo se anunciaba igual, prometiendo capas que nadie servía: la pregunta
// fallaba con un "Failed to connect" que ni siquiera llegaba a la pantalla.

const { spawn: spawnReal, net: netReal, EventEmitter } = require('./runtime.js')

const BINARIO = './llama.cpp/build/bin/ggml-rpc-server'
const INTENTO = 500 // ms entre golpes a la puerta
const PACIENCIA = 120000 // ms hasta darlo por muerto: compilar los kernels de Metal tarda

// 0.0.0.0 y no 127.0.0.1: si escucha solo en loopback, las otras máquinas no pueden usarlo.
// El propio binario avisa que esto no tiene autenticación; está documentado como límite.
function servirCapas({
  puerto,
  binario = BINARIO,
  spawn = spawnReal,
  net = netReal,
  ahora = Date.now
}) {
  const emisor = new EventEmitter()
  const esperas = []

  let proc
  try {
    proc = spawn(binario, ['-H', '0.0.0.0', '-p', String(puerto)])
  } catch (err) {
    // En Bare spawn lanza de forma sincrona; en Node avisa por el evento 'error'. Sin este
    // try, un binario que no esta tumba la app entera con un stack trace.
    const detalle = err.code === 'ENOENT' ? `no encontre ${binario}` : err.message
    const fallo = new Error(`no se pudo levantar el servidor de capas: ${detalle}`)
    fallo.code = err.code
    setTimeout(() => {
      if (emisor.listenerCount('error') > 0) emisor.emit('error', fallo)
      else console.error('[servidor-capas]', fallo.message)
    }, 0)
    emisor.parar = () => {}
    return emisor
  }

  let listo = false
  let muerto = false

  // 'error' sin oyentes lanza excepcion y tumba el proceso. Un servidor de capas que se
  // cae es un problema para reportar, no para matar la app entera.
  const fallar = (err) => {
    muerto = true
    if (emisor.listenerCount('error') > 0) emisor.emit('error', err)
    else console.error('[servidor-capas]', err.message)
  }

  const registrar = (d) => emisor.emit('log', d.toString())
  proc.stdout.on('data', registrar)
  proc.stderr.on('data', registrar)

  proc.on('error', (err) => fallar(err))

  proc.on('exit', (code) => {
    const detalle = listo ? 'se cayo' : 'no llego a arrancar'
    fallar(new Error(`el servidor de capas ${detalle} (codigo ${code})`))
  })

  // No leemos su salida para saber si arrancó: el binario es C y cuando su stdout es un
  // pipe (y no una terminal) se bufferea en bloques, así que el aviso nunca llega.
  // Golpeamos el puerto, que además es lo que de verdad importa: que acepte conexiones.
  const desde = ahora()
  const golpear = () => {
    if (listo || muerto) return

    const zocalo = net.connect(puerto, '127.0.0.1')
    zocalo.on('connect', () => {
      zocalo.destroy()
      if (listo) return
      listo = true
      emisor.emit('listo', puerto)
    })
    zocalo.on('error', () => {
      zocalo.destroy()
      if (ahora() - desde > PACIENCIA) {
        fallar(new Error(`el servidor de capas no abrio el puerto ${puerto}`))
        return
      }
      esperas.push(setTimeout(golpear, INTENTO))
    })
  }
  esperas.push(setTimeout(golpear, INTENTO))

  emisor.parar = () => {
    muerto = true
    for (const e of esperas) clearTimeout(e)
    proc.kill()
  }
  return emisor
}

module.exports = servirCapas
module.exports.BINARIO = BINARIO
