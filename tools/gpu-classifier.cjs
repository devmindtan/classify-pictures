const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const STATE_DIR = path.join(ROOT, '.gpu')
const CONFIG_FILE = path.join(STATE_DIR, 'host.json')
const PID_FILE = path.join(STATE_DIR, 'classifier-tunnel.pid')
const LOG_FILE = path.join(STATE_DIR, 'classifier.log')
const LOCAL_PORT = 3911
const REMOTE_PORT = 3910
const REMOTE_DIR = '~/localens-gpu'
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5']

function config() {
  if (!fs.existsSync(CONFIG_FILE)) throw new Error('Thiếu .gpu/host.json. Chạy npm run gpu:deploy để tạo cấu hình mặc định.')
  const value = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  if (!/^[A-Za-z0-9._@-]+$/.test(value.host || '')) throw new Error('Tên SSH host không hợp lệ.')
  return value
}

function remoteArgs(command) {
  return [config().host, 'wsl', '-e', 'bash', '-lc', `"${command}"`]
}

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

function tunnelPid() {
  const pid = Number(fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf8'))
  return pid && alive(pid) ? pid : null
}

function probe(timeout = 1800) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${LOCAL_PORT}/health`, (response) => {
      let body = ''
      response.on('data', (chunk) => { if (body.length < 20_000) body += chunk })
      response.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(null) }
      })
    })
    request.setTimeout(timeout, () => request.destroy())
    request.on('error', () => resolve(null))
  })
}

function remoteState() {
  const command = `ss -ltnH; test -x ${REMOTE_DIR}/run.sh && echo LOCALENS_INSTALLED || true`
  const result = spawnSync('ssh', [...SSH_OPTIONS, ...remoteArgs(command)], { encoding: 'utf8', timeout: 15_000 })
  if (result.status !== 0) return { reachable: false, reason: `không kết nối được ${config().host}` }
  const output = result.stdout || ''
  const listens = (port) => new RegExp(`127\\.0\\.0\\.1:${port}\\s`).test(output)
  return {
    reachable: true,
    installed: output.includes('LOCALENS_INSTALLED'),
    classifier: listens(REMOTE_PORT),
    voiceStudio: listens(3900),
    ollama: listens(11434),
  }
}

async function start({ wait = true } = {}) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  const current = await probe()
  if (current?.status === 'ok') return { available: true, ...current }
  const state = remoteState()
  if (!state.reachable) return { available: false, reason: state.reason }
  if (!state.installed) return { available: false, reason: 'dịch vụ Localens chưa được deploy trên máy GPU' }
  if (!state.classifier && (state.voiceStudio || state.ollama)) {
    return { available: false, reason: `GPU đang bận với ${state.voiceStudio ? 'VoiceStudio' : 'Ollama'}` }
  }
  if (!tunnelPid()) {
    const log = fs.openSync(LOG_FILE, 'a')
    const remoteCommand = state.classifier ? 'sleep infinity' : `${REMOTE_DIR}/run.sh`
    const child = spawn('ssh', [
      ...SSH_OPTIONS,
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30',
      '-L', `127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}`,
      ...remoteArgs(remoteCommand),
    ], { detached: true, stdio: ['ignore', log, log] })
    fs.closeSync(log)
    child.unref()
    fs.writeFileSync(PID_FILE, String(child.pid))
  }
  if (!wait) return { available: false, reason: 'GPU đang khởi động' }
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const health = await probe()
    if (health?.status === 'ok') return { available: true, ...health }
    if (!tunnelPid()) return { available: false, reason: `dịch vụ GPU dừng khi khởi động; xem ${path.relative(ROOT, LOG_FILE)}` }
  }
  return { available: false, reason: 'model GPU chưa sẵn sàng sau 10 phút' }
}

function stop() {
  let remote = null
  try {
    remote = spawnSync('ssh', [...SSH_OPTIONS, ...remoteArgs(`${REMOTE_DIR}/stop.sh`)], { encoding: 'utf8', timeout: 60_000 })
  } catch {}
  const pid = tunnelPid()
  if (pid) { try { process.kill(pid, 'SIGTERM') } catch {} }
  fs.rmSync(PID_FILE, { force: true })
  return { stopped: true, remoteStatus: remote?.status ?? null }
}

function deploy() {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, `${JSON.stringify({ host: 'desktop-kndgm60' }, null, 2)}\n`)
  const archive = spawnSync('tar', ['-C', path.join(ROOT, 'gpu'), '-cf', '-', '.'], { maxBuffer: 20 * 1024 * 1024 })
  if (archive.status !== 0) throw new Error('Không thể đóng gói dịch vụ GPU.')
  const command = `mkdir -p ${REMOTE_DIR}; tar -C ${REMOTE_DIR} -xf -; chmod +x ${REMOTE_DIR}/run.sh ${REMOTE_DIR}/stop.sh`
  const result = spawnSync('ssh', [...SSH_OPTIONS, ...remoteArgs(command)], { input: archive.stdout, encoding: null, timeout: 60_000 })
  if (result.status !== 0) throw new Error('Không thể deploy dịch vụ lên máy GPU.')
  return { deployed: true, host: config().host, remoteDir: REMOTE_DIR }
}

async function status() {
  const health = await probe()
  return { tunnel: Boolean(tunnelPid()), health, remote: remoteState() }
}

async function main() {
  const command = process.argv[2] || 'status'
  const result = command === 'deploy' ? deploy()
    : command === 'start' ? await start()
      : command === 'stop' ? stop()
        : command === 'status' ? await status()
          : (() => { throw new Error(`Lệnh không hỗ trợ: ${command}`) })()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (command === 'start' && !result.available) process.exitCode = 2
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1 })

module.exports = { start, stop, status, deploy, probe }
