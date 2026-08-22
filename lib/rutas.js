// Dónde están llama.cpp y el modelo.
//
// No viajan dentro de la app (2.9GB contra un binario de 77MB), así que hay que buscarlos
// en la máquina. Las rutas relativas no alcanzan: la app instalada se corre desde
// cualquier carpeta, y ahí `./llama.cpp` no existe.

const { fs, os } = require('./runtime.js')

const MODELO = 'models/Llama-3.2-3B-Instruct-Q4_K_M.gguf'
const RPC = 'llama.cpp/build/bin/ggml-rpc-server'
const CLI = 'llama.cpp/build/bin/llama-cli'

// Los lugares donde miramos, en orden. El primero es la carpeta actual, para que siga
// funcionando desde el repo; después el home, que es donde vive en una máquina instalada.
function candidatos(relativa, home) {
  return [`./${relativa}`, `${home}/${relativa}`, `${home}/Desktop/shard-free/${relativa}`]
}

function buscar(relativa, { existe = (p) => fs.existsSync(p), home = os.homedir() } = {}) {
  for (const ruta of candidatos(relativa, home)) {
    if (existe(ruta)) return ruta
  }
  return null
}

module.exports = { buscar, MODELO, RPC, CLI, candidatos }
