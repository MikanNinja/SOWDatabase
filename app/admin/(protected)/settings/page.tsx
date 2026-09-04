import { getStore } from "@/lib/db/store"
import { updateSettingsAction } from "@/app/admin/actions"
import SubmitButton from "@/components/admin/SubmitButton"

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
        <div className="form-field">
          <label htmlFor="navLabel">导航栏副标题</label>
          <input type="text" id="navLabel" name="navLabel" defaultValue={settings.navLabel} />
          <p className="hint">显示在导航栏品牌名右侧的小字（如“资料索引”）。</p>
        </div>
        <div className="form-field">
          <label htmlFor="footerText">页脚文字</label>
          <textarea id="footerText" name="footerText" rows={2} defaultValue={settings.footerText} />
          <p className="hint">显示在每页页脚的说明文字。</p>
        </div>
        <div className="form-actions">
          <SubmitButton>保存设置</SubmitButton>
        </div>
      </form>
    </div>
  )
}
