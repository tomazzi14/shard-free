// Un nodo de Shard: presta capas, descubre a los demás y sabe si el modelo está completo.
//
// Junta el descubrimiento con el planificador y es lo único que necesitan conocer el CLI,
// las herramientas y (más adelante) el panel web. Emite 'estado' con el plan cada vez que
// algo cambia: eso es lo que pinta la banda.

const LanDiscovery = require('./lan-discovery.js')
const planificar = require('./shard-plan.js')
const inferir = require('./inferencia.js')

let os, EventEmitter
try {
  os = require('bare-os')
  EventEmitter = require('bare-events')
} catch {
  os = require('os')
  EventEmitter = require('events')
}

// El modelo y el motor no viajan con la app: pesan 2.9GB y el binario de Pear pesa 77MB.
// Se esperan en la máquina, y estas rutas se pueden cambiar por flag.
const MODELO = './models/Llama-3.2-3B-Instruct-Q4_K_M.gguf'
const BINARIO = require('./inferencia.js').BINARIO

class Nodo extends EventEmitter {
  // discovery e inferir son inyectables para poder probar el nodo sin red ni modelo.
  constructor({
    etiqueta,
    rpcPort = 50052,
    ofreceGB,
    modelo = MODELO,
    binario = BINARIO,
    discovery,
    inferir: inf
  }) {
    super()
    const ramGB = +(os.totalmem() / 1073741824).toFixed(1)

    this.modelo = modelo
    this.binario = binario
    this.ficha = {
      etiqueta: etiqueta || os.hostname(),
      ramGB,
      cores: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
      rpcPort,
      // La mitad de la RAM deja aire para el resto del sistema.
      ofreceGB: ofreceGB || +(ramGB / 2).toFixed(1)
    }

    this.id = `${os.hostname()}-${rpcPort}`
    this._inferir = inf || inferir
    this.disco = discovery || new LanDiscovery({ id: this.id, ficha: this.ficha })
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
    this.disco.on('error', (err) => this.emit('error', err))

    this.disco.on('peer', (peer) => {
      this.emit('peer', peer)
      this.emit('estado', this.plan())
    })
    this.disco.on('peer-lost', (peer) => {
      this.emit('peer-lost', peer)
      this.emit('estado', this.plan())
    })

    this.disco.start()
  }

  // Devuelve el emisor de inferencia. Si faltan capas se niega: no es tarea nuestra decidir
  // qué hacer con eso, sólo reportarlo.
  preguntar(texto, opciones = {}) {
    return this._inferir(this.plan(), {
      modelo: this.modelo,
      binario: this.binario,
      prompt: texto,
      ...opciones
    })
  }

  stop() {
    this.disco.stop()
  }
}

module.exports = Nodo
module.exports.MODELO = MODELO
module.exports.BINARIO = BINARIO
