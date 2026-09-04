import { _electron, test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

interface LaunchOptions {
  script?: 'tool' | 'permission'
}

/** 统一的 E2E 装配：mock 模型 + 隔离 TINYCODE_HOME/userData + 可选工具脚本注入口。 */
async function launchApp(
  opts: LaunchOptions = {}
): Promise<{ app: ElectronApplication; win: Page; workdir: string; home: string }> {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-ws-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-home-'))
  const app: ElectronApplication = await _electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      TINYCODE_MODEL: 'mock',
      TINYCODE_HOME: home,
      HCODE_TEST_USERDATA: fs.mkdtempSync(path.join(os.tmpdir(), 'hcode-e2e-ud-')),
      HCODE_TEST_WORKSPACE: workdir,
      ...(opts.script ? { HCODE_TEST_MOCK_SCRIPT: opts.script } : {})
    }
  })
  const win: Page = await app.firstWindow()
  await expect(win).toHaveTitle('HCode')
  await win.getByTestId('open-workspace').click()
  await expect(win.getByTestId('workspace')).toContainText(workdir, { timeout: 15000 })
  return { app, win, workdir, home }
}

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
  const { app, win, home } = await launchApp()
  try {
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
  const { app, win, workdir } = await launchApp({ script: 'tool' })
  try {
    fs.writeFileSync(path.join(workdir, 'package.json'), '{"name":"fixture"}\n')

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

test('E2E 冒烟 ③：权限 ASK 对话框 round-trip（once / always / Esc=deny）', async () => {
  const { app, win, workdir } = await launchApp({ script: 'permission' })
  try {
    // ① once：放行写盘（once 不记忆 → 同文本下次仍会问）
    await win.getByTestId('input').fill('写一次')
    await win.getByTestId('send').click()
    await expect(win.getByTestId('perm-dialog')).toBeVisible({ timeout: 20000 })
    await win.getByTestId('perm-once').click()
    await expect(win.getByTestId('tool-card')).toHaveCount(1, { timeout: 15000 })
    await expect(win.getByTestId('tool-card').first()).toHaveAttribute('data-state', 'ok')
    expect(fs.existsSync(path.join(workdir, 'hcode-perm-3.txt'))).toBe(true)

    // ② 同文本再次弹（once 不记忆）→ 点 always 记住本族
    await win.getByTestId('input').fill('写一次')
    await win.getByTestId('send').click()
    await expect(win.getByTestId('perm-dialog')).toBeVisible({ timeout: 20000 })
    await win.getByTestId('perm-always').click()
    await expect(win.getByTestId('tool-card')).toHaveCount(2, { timeout: 15000 })
    await expect(win.getByTestId('tool-card').nth(1)).toHaveAttribute('data-state', 'ok')

    // ③ 同族第三次：不再弹，直接放行
    await win.getByTestId('input').fill('写一次')
    await win.getByTestId('send').click()
    await expect(win.getByTestId('tool-card')).toHaveCount(3, { timeout: 15000 })
    await expect(win.getByTestId('tool-card').nth(2)).toHaveAttribute('data-state', 'ok')
    await expect(win.getByTestId('perm-dialog')).toHaveCount(0)

    // ④ 换审批族 → 新对话框；Esc 关闭 = deny → 工具结果错误卡片
    await win.getByTestId('input').fill('换个更长的文件名来写')
    await win.getByTestId('send').click()
    await expect(win.getByTestId('perm-dialog')).toBeVisible({ timeout: 20000 })
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('tool-card')).toHaveCount(4, { timeout: 15000 })
    await expect(win.getByTestId('tool-card').last()).toHaveAttribute('data-state', 'error')
  } finally {
    await app.close()
  }
})
