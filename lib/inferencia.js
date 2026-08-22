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
const COLA_STDERR = 2000
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

// La ultima linea con contenido de stderr: es donde llama.cpp dice que se rompio.
function ultimaQueja(texto) {
  const lineas = texto.split('\n').filter((l) => l.trim())
  return lineas.length ? lineas[lineas.length - 1].trim() : ''
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

  let proc
  try {
    proc = lanzar(binario, args)
  } catch (err) {
    // En Bare spawn lanza de forma sincrona. Sin esto, preguntar sin llama.cpp instalado
    // no da un "sin respuesta": mata la app.
    const detalle = err.code === 'ENOENT' ? `no encontre ${binario}` : err.message
    setTimeout(() => emisor.emit('error', new Error(`no se pudo lanzar el modelo: ${detalle}`)), 0)
    return emisor
  }

  const filtro = new Filtro(opciones.prompt)

  let contesto = false
  let quejas = '' // lo ultimo que dijo llama.cpp por stderr, para poder explicar un fallo
  let cola = '' // y la cola de stdout, por si se murio sin quejarse

  proc.stdout.on('data', (d) => {
    const crudo = d.toString()
    cola = (cola + crudo).slice(-COLA_STDERR)
    emisor.emit('crudo', crudo) // la salida sin tocar, para depurar
    const limpio = filtro.procesar(crudo)
    if (limpio) {
      contesto = true
      emisor.emit('salida', limpio)
    }
  })

  proc.stderr.on('data', (d) => {
    const texto = d.toString()
    quejas = (quejas + texto).slice(-COLA_STDERR)
    emisor.emit('log', texto)
  })

  proc.on('error', (err) => emisor.emit('error', err))

  proc.on('exit', (code) => {
    if (code !== 0) {
      const err = new Error(`llama-cli termino con codigo ${code}: ${ultimaQueja(quejas)}`)
      emisor.emit('error', err)
      return
    }
    // llama-cli sale con codigo 0 aunque no haya podido conectarse a un rpc-server. Si no
    // hubo respuesta fue un fallo: darlo por bueno deja al panel mudo, sin decir por que.
    if (!contesto) {
      // Sin esto el fallo dice "sin detalle" y no hay forma de saber que paso: llama.cpp
      // puede morirse sin escribir una linea en stderr.
      const detalle = ultimaQueja(quejas) || ultimaQueja(cola) || 'no escribio nada'
      const err = new Error(`el modelo no devolvio nada: ${detalle}`)
      err.crudo = cola
      emisor.emit('error', err)
      return
    }
    emisor.emit('fin')
  })

  emisor.matar = () => proc.kill()
  return emisor
}

module.exports = inferir
module.exports.construirArgs = construirArgs
module.exports.BINARIO = BINARIO
module.exports.Filtro = Filtro
