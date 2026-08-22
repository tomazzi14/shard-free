const { test } = require('brittle')
const { buscar, candidatos, RPC } = require('../lib/rutas.js')

const opciones = (existentes) => ({
  existe: (p) => existentes.includes(p),
  home: '/Users/tomi'
})

test('primero mira la carpeta actual, para no romper el repo', (t) => {
  t.is(buscar(RPC, opciones([`./${RPC}`, `/Users/tomi/${RPC}`])), `./${RPC}`)
})

test('si no esta ahi, mira el home', (t) => {
  t.is(
    buscar(RPC, opciones([`/Users/tomi/${RPC}`])),
    `/Users/tomi/${RPC}`,
    'la app instalada se corre desde cualquier carpeta'
  )
})

test('si no esta en ningun lado devuelve null, no una ruta inventada', (t) => {
  t.is(buscar(RPC, opciones([])), null, 'devolver una ruta falsa termina en un ENOENT opaco')
})

test('los lugares donde busca no dependen de donde arrancaste', (t) => {
  const lugares = candidatos(RPC, '/Users/tomi')

  t.ok(
    lugares.some((l) => l.startsWith('/Users/tomi/')),
    'el home siempre esta'
  )
  t.is(lugares.length, 3)
})
