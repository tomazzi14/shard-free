// El panel: sirve una página y le empuja el estado del nodo en vivo.
//
// Va por SSE (Server-Sent Events) y no por websocket: el estado viaja en un solo sentido,
// el navegador reconecta solo si se corta, y no depende de una librería más. Las preguntas
// suben por un POST normal.

const { http, EventEmitter } = require('./runtime.js')
const pagina = require('./panel-html.js')

const PUERTO = 7777
const MAX_LOG = 50

class Panel extends EventEmitter {
  constructor({ nodo, puerto = PUERTO, version = '' }) {
    super()
    this.nodo = nodo
    this.puerto = puerto
    this.version = version
    this.clientes = new Set()
    this.log = []
    this.servidor = null
  }

  _anotar(nivel, texto) {
    this.log.push({ nivel, texto, t: Date.now() })
    if (this.log.length > MAX_LOG) this.log.shift()
    this._empujar({ tipo: 'log', nivel, texto })
  }

  _empujar(evento) {
    const linea = `data: ${JSON.stringify(evento)}\n\n`
    for (const res of this.clientes) res.write(linea)
  }

  // Todo lo que el panel necesita para pintarse de cero, para el que recién se conecta.
  _foto() {
    return { tipo: 'foto', plan: this.nodo.plan(), version: this.version, log: this.log }
  }

  start() {
    this.nodo.on('estado', (plan) => this._empujar({ tipo: 'estado', plan }))
    this.nodo.on('peer', (p) => this._anotar('ok', `${p.ficha.etiqueta} (${p.address}) entro`))
    this.nodo.on('peer-lost', (p) => this._anotar('mal', `${p.ficha.etiqueta} se cayo`))
    this.nodo.on('error', (err) => this._anotar('mal', err.message))
    this.nodo.on('capas-listas', (p) => this._anotar('ok', `sirviendo capas en :${p}`))

    this.servidor = http.createServer((req, res) => this._atender(req, res))
    // Un panel que no puede escuchar tiene que decirlo: si no, la app parece andar bien y
    // el navegador no muestra nada.
    this.servidor.on('error', (err) => {
      const detalle =
        err.code === 'EADDRINUSE' ? `el puerto ${this.puerto} ya esta ocupado` : err.message
      this.emit('error', new Error(`el panel no pudo escuchar: ${detalle}`))
    })
    this.servidor.listen(this.puerto, '127.0.0.1')
    return this.servidor
  }

  _atender(req, res) {
    if (req.url === '/eventos') return this._suscribir(res)
    if (req.url === '/preguntar' && req.method === 'POST') return this._preguntar(req, res)
    if (req.url === '/' || req.url === '/index.html') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(pagina)
      return
    }
    res.statusCode = 404
    res.end('no existe')
  }

  _suscribir(res) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write(`data: ${JSON.stringify(this._foto())}\n\n`)

    this.clientes.add(res)
    res.on('close', () => this.clientes.delete(res))
  }

  _preguntar(req, res) {
    let cuerpo = ''
    req.on('data', (d) => (cuerpo += d))
    req.on('end', () => {
      let pregunta
      try {
        pregunta = JSON.parse(cuerpo).pregunta
      } catch {
        res.statusCode = 400
        res.end('json ilegible')
        return
      }

      res.statusCode = 202
      res.end('ok')
      this._lanzar(pregunta)
    })
  }

  _lanzar(pregunta) {
    this._anotar('ok', `pregunta: ${pregunta}`)
    this._empujar({ tipo: 'pregunta', pregunta })

    this.nodo
      .preguntar(pregunta)
      .on('salida', (txt) => this._empujar({ tipo: 'token', txt }))
      .on('error', (err) => {
        this._anotar('mal', err.message)
        this._empujar({ tipo: 'sin-respuesta', motivo: err.message, faltan: err.faltan || null })
      })
      .on('fin', () => this._empujar({ tipo: 'fin' }))
  }

  stop() {
    for (const res of this.clientes) res.end()
    this.clientes.clear()
    this.servidor?.close()
  }
}

module.exports = Panel
module.exports.PUERTO = PUERTO
