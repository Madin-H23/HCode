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
