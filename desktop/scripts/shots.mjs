// 视觉审查截图生成器（不进 CI；手动运行：node scripts/shots.mjs）
import { _electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const outDir = 'shots'
fs.mkdirSync(outDir, { recursive: true })

const baseEnv = {
  ...process.env,
  TINYCODE_MODEL: 'mock',
  TINYCODE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-shots-home-')),
  HCODE_TEST_USERDATA: fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-shots-ud-'))
}

async function launch(extra = {}) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-shots-ws-'))
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...baseEnv,
      HCODE_TEST_WORKSPACE: workdir,
      ...extra
    }
  })
  const win = await app.firstWindow()
  await win.waitForTimeout(800)
  return { app, win, workdir }
}

// 状态0：未选择工作区（空态）
{
  const { app, win } = await launch()
  await win.screenshot({ path: `${outDir}/0-initial.png` })
  await app.close()
}

// 状态1：聊天（用户/助手气泡 + 定稿）
{
  const { app, win } = await launch()
  await win.getByTestId('open-workspace').click()
  await win.getByTestId('input').fill('帮我把这个项目的 README 重写一遍')
  await win.getByTestId('send').click()
  await win.waitForTimeout(1800)
  await win.screenshot({ path: `${outDir}/1-chat.png` })
  await app.close()
}

// 状态2：工具卡片（read 成功终态）
{
  const { app, win, workdir } = await launch({ HCODE_TEST_MOCK_SCRIPT: 'tool' })
  fs.writeFileSync(path.join(workdir, 'package.json'), '{"name":"fixture"}\n')
  await win.getByTestId('open-workspace').click()
  await win.getByTestId('input').fill('看看 package.json')
  await win.getByTestId('send').click()
  await win.waitForSelector('[data-testid="tool-card"][data-state="ok"]', { timeout: 20000 })
  await win.waitForTimeout(300)
  await win.screenshot({ path: `${outDir}/2-tool-card.png` })
  await app.close()
}

// 状态3：权限对话框（ASK 挂起）
{
  const { app, win } = await launch({ HCODE_TEST_MOCK_SCRIPT: 'permission' })
  await win.getByTestId('open-workspace').click()
  await win.getByTestId('input').fill('写一次')
  await win.getByTestId('send').click()
  await win.waitForSelector('[data-testid="perm-dialog"]', { timeout: 20000 })
  await win.waitForTimeout(300)
  await win.screenshot({ path: `${outDir}/3-permission.png` })
  await app.close()
}

console.log('shots done:', fs.readdirSync(outDir).join(', '))

// 状态4：edit 卡片 diff 展开态
{
  const { app, win, workdir } = await launch({ HCODE_TEST_MOCK_SCRIPT: 'edit' })
  await win.getByTestId('open-workspace').click()
  await win.waitForSelector('[data-testid="input"]:not([disabled])', { timeout: 15000 })
  fs.writeFileSync(path.join(workdir, 'calc.js'), 'const add = (a, b) => a - b;\n')
  await win.getByTestId('input').fill('修复 calc.js')
  await win.getByTestId('send').click()
  await win.getByTestId('perm-dialog').waitFor({ state: 'visible', timeout: 20000 })
  await win.getByTestId('perm-once').click()
  await win.waitForSelector('[data-testid="tool-card"][data-state="ok"]', { timeout: 20000 })
  await win.getByTestId('diff-toggle').click()
  await win.waitForTimeout(300)
  await win.screenshot({ path: `${outDir}/4-diff-expanded.png` })
  await app.close()
}
console.log('shot 4 done')

// 状态5：MCP 面板（工作区 config 装配 mock server）
{
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-shots-mcp-'))
  fs.mkdirSync(path.join(workdir, '.tinycode'), { recursive: true })
  fs.writeFileSync(
    path.join(workdir, '.tinycode', 'config.json'),
    JSON.stringify({ mcpServers: { 'test-mcp': { command: process.execPath, args: [path.resolve('..', 'fixtures', 'mock-mcp', 'server.mjs')] } } })
  )
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: { ...baseEnv, HCODE_TEST_WORKSPACE: workdir }
  })
  const win = await app.firstWindow()
  await win.waitForTimeout(800)
  await win.getByTestId('open-workspace').click()
  await win.waitForSelector('[data-testid="input"]:not([disabled])', { timeout: 15000 })
  await win.getByTestId('mcp-toggle').click()
  await win.getByTestId('mcp-server').first().waitFor({ state: 'visible', timeout: 15000 })
  await win.waitForTimeout(300)
  await win.screenshot({ path: `${outDir}/5-mcp-panel.png` })
  await app.close()
}

// 状态6：搜索结果面板（先造带标记文本的会话）
{
  const app = await _electron.launch({
    args: ['out/main/index.js'],
    env: { ...baseEnv, HCODE_TEST_WORKSPACE: fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-shots-s-')) }
  })
  const win = await app.firstWindow()
  await win.getByTestId('open-workspace').click()
  await win.waitForSelector('[data-testid="input"]:not([disabled])', { timeout: 15000 })
  await win.getByTestId('input').fill('P2截图标记：权限模型上下文')
  await win.getByTestId('send').click()
  await win.waitForTimeout(1800)
  await win.getByTestId('new-session').click()
  await win.getByTestId('search-input').fill('P2截图标记')
  await win.getByTestId('search-run').click()
  await win.getByTestId('search-hit').first().waitFor({ state: 'visible', timeout: 15000 })
  await win.waitForTimeout(300)
  await win.screenshot({ path: `${outDir}/6-search.png` })
  await app.close()
}
console.log('shots 5/6 done')
