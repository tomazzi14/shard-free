// Un nodo de Shard: presta capas, descubre a los demás y sabe si el modelo está completo.
//
// Junta el descubrimiento con el planificador y es lo único que necesitan conocer el CLI,
// las herramientas y (más adelante) el panel web. Emite 'estado' con el plan cada vez que
// algo cambia: eso es lo que pinta la banda.

const LanDiscovery = require('./lan-discovery.js')
const planificar = require('./shard-plan.js')
const inferir = require('./inferencia.js')
const servirCapas = require('./servidor-capas.js')

const { os, EventEmitter } = require('./runtime.js')

const rutas = require('./rutas.js')

class Nodo extends EventEmitter {
  // discovery e inferir son inyectables para poder probar el nodo sin red ni modelo.
  constructor({
    etiqueta,
    rpcPort = 50052,
    ofreceGB,
    modelo,
    binario,
    servidor = servirCapas,
    buscar = rutas.buscar,
    discovery,
    inferir: inf
  }) {
    super()
    const ramGB = +(os.totalmem() / 1073741824).toFixed(1)

    // El modelo y el motor no viajan con la app: 2.9GB contra un binario de 77MB. Se
    // buscan en la máquina, y se pueden fijar por flag.
    this.modelo = modelo || buscar(rutas.MODELO)
    this.binario = binario || buscar(rutas.CLI)
    this.rpc = buscar(rutas.RPC)
    this.ficha = {
      etiqueta: etiqueta || os.hostname(),
      ramGB,
      cores: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
      rpcPort,
      ofreceGB: 0
    }

    // Lo que prestamos cuando el servidor de capas este listo. Hasta entonces ofrecemos
    // cero: anunciar capas antes de poder servirlas es la misma mentira, pero al reves.
    this.ofrecido = this.rpc === null ? 0 : ofreceGB || +(ramGB / 2).toFixed(1)
    this.id = `${os.hostname()}-${rpcPort}`
    this._inferir = inf || inferir
    this._servirCapas = servidor
    this.capas = null
    this.disco = discovery || new LanDiscovery({ id: this.id, ficha: this.ficha })
  }

  // 'error' sin oyentes lanza excepcion y tumba la app. Estos errores son para mostrar.
  _fallo(err) {
    if (this.listenerCount('error') > 0) this.emit('error', err)
    else console.error('[nodo]', err.message)
  }

  // Esta máquina también sirve capas: entra al plan como un peer más, por loopback.
  plan() {
    const propio = { id: this.id, address: '127.0.0.1', ficha: this.ficha }
    return planificar({ peers: [propio, ...this.disco.peers.values()] })
  }

  start() {
    this.disco.on('listening', (info) => {
      this.emit('listening', info)
      this.emit('estado', this.plan()) // estado inicial: esta máquina sola
    })
    this.disco.on('sweep', (info) => this.emit('sweep', info))
    this.disco.on('error', (err) => this._fallo(err))

    this.disco.on('peer', (peer) => {
      this.emit('peer', peer)
      this.emit('estado', this.plan())
    })
    this.disco.on('peer-cambio', (peer) => {
      this.emit('peer-cambio', peer)
      this.emit('estado', this.plan())
    })
    this.disco.on('peer-lost', (peer) => {
      this.emit('peer-lost', peer)
      this.emit('estado', this.plan())
    })

    // Levantamos nuestro propio servidor de capas: la app tiene que servir lo que promete,
    // sin depender de que alguien abra otra terminal.
    if (this.rpc === null) {
      this._fallo(
        new Error(
          'llama.cpp is not here: this machine cannot serve layers. ' +
            'Build it with -DGGML_RPC=ON, or point at it with --llama <path>'
        )
      )
    } else {
      this.capas = this._servirCapas({ puerto: this.ficha.rpcPort, binario: this.rpc })
      this.capas.on('listo', (puerto) => {
        this.ficha.ofreceGB = this.ofrecido
        this.emit('capas-listas', puerto)
        this.emit('estado', this.plan())
      })
      // Si el servidor de capas se cae, dejamos de ofrecer memoria. Seguir anunciandola
      // hace que las otras maquinas planifiquen contra capas que ya nadie sirve: la banda
      // dice COMPLETE y la pregunta falla igual.
      this.capas.on('error', (err) => {
        this.ficha.ofreceGB = 0
        this._fallo(err)
        this.emit('estado', this.plan())
      })
    }

    this.disco.start()
  }

  // Devuelve el emisor de inferencia. Si faltan capas se niega: no es tarea nuestra decidir
  // qué hacer con eso, sólo reportarlo.
  preguntar(texto, opciones = {}) {
    if (this.modelo === null) {
      const emisor = new EventEmitter()
      const err = new Error('the .gguf model is not on this machine')
      setTimeout(() => emisor.emit('error', err), 0)
      return emisor
    }
    return this._inferir(this.plan(), {
      modelo: this.modelo,
      binario: this.binario,
      prompt: texto,
      ...opciones
    })
  }

  stop() {
    this.capas?.parar()
    this.disco.stop()
  }
}

module.exports = Nodo
