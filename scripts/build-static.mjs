import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const stashDir = path.join(root, ".static-build")

const stashItems = [
  { src: path.join(root, "app", "admin"), name: "admin" },
  { src: path.join(root, "proxy.ts"), name: "proxy.ts" },
  { src: path.join(root, "components", "admin"), name: "components-admin" },
]

function pathExists(target) {
  try {
    fs.lstatSync(target)
    return true
  } catch {
    return false
  }
}

function restore() {
  let restored = false
  for (const item of stashItems) {
    const stashed = path.join(stashDir, item.name)
    if (!pathExists(stashed)) continue
    if (pathExists(item.src)) {
      throw new Error(
        `${item.src} 与暂存目录同时存在，请手动处理 .static-build 目录`
      )
    }
    fs.renameSync(stashed, item.src)
    console.log(`[build-static] 已还原 ${path.relative(root, item.src)}`)
    restored = true
  }
  if (pathExists(stashDir) && fs.readdirSync(stashDir).length === 0) {
    fs.rmdirSync(stashDir)
  }
  return restored
}

function stash() {
  if (pathExists(stashDir)) {
    if (restore()) {
      console.log("[build-static] 检测到上次中断的暂存，已先还原")
    } else {
      fs.rmSync(stashDir, { recursive: true, force: true })
    }
  }
  fs.mkdirSync(stashDir, { recursive: true })
  for (const item of stashItems) {
    if (pathExists(item.src)) {
      fs.renameSync(item.src, path.join(stashDir, item.name))
      console.log(`[build-static] 已临时移出 ${path.relative(root, item.src)}`)
    }
  }
}

function main() {
  if (!pathExists(path.join(root, "node_modules"))) {
    throw new Error("缺少 node_modules，请先执行 npm install")
  }
  if (pathExists(path.join(root, ".next"))) {
    fs.rmSync(path.join(root, ".next"), { recursive: true, force: true })
    console.log("[build-static] 已清理 .next 缓存")
  }
  let code = 1
  let stashed = false
  try {
    stash()
    stashed = true
    const result = spawnSync("npx", ["next", "build"], {
      stdio: "inherit",
      cwd: root,
      shell: process.platform === "win32",
      env: { ...process.env, STATIC_EXPORT: "1" },
    })
    code = result.status ?? 1
  } finally {
    try {
      if (stashed || pathExists(stashDir)) restore()
    } catch (restoreError) {
      console.error("[build-static] 还原失败，请手动处理 .static-build 目录")
      console.error(restoreError)
      code = 1
    }
  }
  if (code === 0) {
    console.log("[build-static] 静态产物已生成于 out/")
  } else {
    console.error("[build-static] 构建失败")
  }
  process.exit(code)
}

main()
