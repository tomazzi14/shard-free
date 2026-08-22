// Bare no es Node: los módulos nativos se llaman distinto y no son intercambiables.
//
// La app corre en Bare. Las herramientas y los tests corren en Node. Este es el único
// lugar donde se decide cuál cargar.
//
// El require de Node va por otro nombre a propósito. bare-pack recorre el árbol de forma
// estática al empaquetar el binario: si ve un `require('os')` literal intenta resolverlo
// contra Bare, no lo encuentra y falla el build, aunque esa rama jamás se ejecute ahí.

const nodeRequire = require
const enBare = typeof Bare !== 'undefined'

module.exports = enBare
  ? {
      dgram: require('bare-dgram'),
      os: require('bare-os'),
      EventEmitter: require('bare-events'),
      spawn: require('bare-subprocess').spawn,
      http: require('bare-http1'),
      net: require('bare-tcp'),
      fs: require('bare-fs'),
      proc: require('bare-process')
    }
  : {
      dgram: nodeRequire('dgram'),
      os: nodeRequire('os'),
      EventEmitter: nodeRequire('events'),
      spawn: nodeRequire('child_process').spawn,
      http: nodeRequire('http'),
      net: nodeRequire('net'),
      fs: nodeRequire('fs'),
      proc: nodeRequire('process')
    }
