import { _electron, test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('E2E 冒烟 #0：应用启动，窗口标题为 HCode', async () => {
  const app: ElectronApplication = await _electron.launch({
    args: ['out/main/index.js']
  })
  try {
    const win: Page = await app.firstWindow()
    await expect(win).toHaveTitle('HCode')
    await expect(win.locator('#root')).toContainText('HCode')
  } finally {
    await app.close()
  }
})

test('E2E 冒烟 ①：选工作区 → 发消息 → 流式回复定稿', async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-ws-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-home-'))
  const app: ElectronApplication = await _electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      TINYCODE_MODEL: 'mock',
      TINYCODE_HOME: home,
      HCODE_TEST_USERDATA: fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-ud-')),
      HCODE_TEST_WORKSPACE: workdir
    }
  })
  try {
    const win: Page = await app.firstWindow()
    await expect(win).toHaveTitle('HCode')

    await win.getByTestId('open-workspace').click()
    await expect(win.getByTestId('workspace')).toContainText(workdir, { timeout: 15000 })
    await expect(win.getByTestId('status')).toContainText('idle')

    await win.getByTestId('input').fill('你好')
    await win.getByTestId('send').click()
    await expect(win.getByTestId('msg-user')).toContainText('你好', { timeout: 20000 })
    await expect(win.getByTestId('messages')).toContainText('（mock）收到')
    await expect(win.getByTestId('messages').locator('[data-streaming="true"]')).toHaveCount(0)

    // 会话落盘：JSONL 真相源已在 TINYCODE_HOME/sessions 下生成
    const sessions = fs.readdirSync(path.join(home, 'sessions'))
    expect(sessions.some((f) => f.endsWith('.jsonl'))).toBe(true)
  } finally {
    await app.close()
  }
})

test('E2E 冒烟 ②：工具调用 → 卡片渲染且终态正确', async () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-ws-'))
  fs.writeFileSync(path.join(workdir, 'package.json'), '{"name":"fixture"}\n')
  const app: ElectronApplication = await _electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      TINYCODE_MODEL: 'mock',
      TINYCODE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-home-')),
      HCODE_TEST_USERDATA: fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-ud-')),
      HCODE_TEST_WORKSPACE: workdir,
      HCODE_TEST_MOCK_SCRIPT: 'tool'
    }
  })
  try {
    const win: Page = await app.firstWindow()
    await expect(win).toHaveTitle('HCode')

    await win.getByTestId('open-workspace').click()
    await expect(win.getByTestId('workspace')).toContainText(workdir, { timeout: 15000 })

    await win.getByTestId('input').fill('看看 package.json')
    await win.getByTestId('send').click()

    const card = win.getByTestId('tool-card')
    await expect(card).toHaveCount(1, { timeout: 20000 })
    await expect(card).toContainText('read')
    await expect(card).toContainText('package.json')
    await expect(card).toHaveAttribute('data-state', 'ok')
    await expect(win.getByTestId('messages')).toContainText('读取完成')
  } finally {
    await app.close()
  }
})
