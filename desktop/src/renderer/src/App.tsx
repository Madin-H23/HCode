const styles = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: '#e6e6ea',
    backgroundColor: '#1b1b1f',
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
  },
  h1: { fontSize: 40, margin: 0, letterSpacing: 2 },
  p: { color: '#9a9aa4', margin: 0 }
}

export default function App() {
  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>HCode</h1>
      <p style={styles.p}>桌面端骨架已就位 —— 一个 Harness，第三张面。</p>
    </main>
  )
}
