import { getStore } from "@/lib/db/store"
import { updateSettingsAction } from "@/app/admin/actions"

export const dynamic = "force-dynamic"

export default async function AdminSettingsPage() {
  const store = await getStore()
  const settings = await store.getSettings()

  return (
    <div>
      <header className="record-header">
        <p className="page-kicker">管理后台 / 配置</p>
        <h1>站点设置</h1>
      </header>
      <form action={updateSettingsAction} className="form-grid">
        <div className="form-field">
          <label htmlFor="siteName">站点名称</label>
          <input type="text" id="siteName" name="siteName" defaultValue={settings.siteName} />
        </div>
        <div className="form-field">
          <label htmlFor="siteDescription">站点说明</label>
          <textarea id="siteDescription" name="siteDescription" rows={3} defaultValue={settings.siteDescription} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn primary">
            保存设置
          </button>
        </div>
      </form>
    </div>
  )
}
