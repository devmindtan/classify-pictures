const { spawn } = require('node:child_process')
const gpu = require('./gpu-classifier.cjs')

let stopping = false
const web = spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' })

gpu.start().then((result) => {
  if (result.available) console.log(`\n✓ GPU local sẵn sàng: ${result.gpu} · ${result.model}\n`)
  else console.log(`\n○ GPU chưa dùng được (${result.reason}); app sẽ tự dùng CPU/WASM trong trình duyệt.\n`)
}).catch((error) => console.error(`\n○ Không khởi động được GPU: ${error.message}\n`))

async function shutdown(signal) {
  if (stopping) return
  stopping = true
  if (!web.killed) web.kill(signal)
  try { gpu.stop() } catch {}
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { void shutdown(signal) })
}
web.on('exit', async (code) => {
  await shutdown('SIGTERM')
  process.exit(code ?? 0)
})
