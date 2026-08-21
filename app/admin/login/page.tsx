import { loginAction } from "../actions"

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await props.searchParams
  const nextPath = next && next.startsWith("/admin") ? next : "/admin"

  return (
    <div className="container login-page">
      <header className="record-header">
        <p className="page-kicker">维护界面 / 身份验证</p>
        <h1 className="page-title">管理后台登录</h1>
      </header>
      {error === "1" && <div className="alert danger">用户名或密码错误。</div>}
      <LoginForm nextPath={nextPath} />
    </div>
  )
}

function LoginForm({ nextPath }: { nextPath: string }) {
  return (
    <form action={loginAction} className="form-grid">
      <div className="form-field">
        <label htmlFor="username">用户名</label>
        <input type="text" id="username" name="username" autoComplete="username" required />
      </div>
      <div className="form-field">
        <label htmlFor="password">密码</label>
        <input type="password" id="password" name="password" autoComplete="current-password" required />
      </div>
      <input type="hidden" name="next" value={nextPath} />
      <div className="form-actions">
        <button type="submit" className="btn primary">
          登录
        </button>
      </div>
    </form>
  )
}
