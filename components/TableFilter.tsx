"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"

export interface TableFilterSpec {
  /** 读取的 URL 参数名，如 "q"、"sourceName"、"category" */
  key: string
  /** 行上承载匹配数据的 data 属性名（不含 data- 前缀），如 "q"、"sourceName" */
  attr: string
  /** substring：大小写不敏感包含匹配；exact：整串相等 */
  mode: "substring" | "exact"
}

interface TableFilterProps {
  filters: TableFilterSpec[]
  /** 与服务端渲染的表格行一一对应（同顺序），仅用于派生匹配计数 */
  rows: { id: string; attrs: Record<string, string> }[]
  /** “清除筛选”指向的干净 URL */
  basePath: string
}

function TableFilterInner({ filters, rows, basePath }: TableFilterProps) {
  const searchParams = useSearchParams()

  const values = filters.map((f) => ({
    ...f,
    raw: searchParams.get(f.key) ?? "",
    needle: (searchParams.get(f.key) ?? "").trim().toLowerCase(),
  }))
  const active = values.some((v) => v.needle !== "")
  const activeValues = values.filter((v) => v.needle !== "").map((v) => v.raw.trim())
  const matched = active
    ? rows.filter((row) =>
        values
          .filter((v) => v.needle !== "")
          .every((v) => {
            const hay = (row.attrs[v.attr] ?? "").toLowerCase()
            return v.mode === "exact" ? hay === v.needle : hay.includes(v.needle)
          })
      ).length
    : rows.length

  const depsKey = `${searchParams.toString()}|${JSON.stringify(filters)}`

  useEffect(() => {
    const form = document.querySelector("form.search-form")
    if (form) {
      for (const f of filters) {
        const raw = searchParams.get(f.key) ?? ""
        let input = form.querySelector<HTMLInputElement>(`input[name="${f.key}"]`)
        if (!input) {
          input = document.createElement("input")
          input.type = "hidden"
          input.name = f.key
          form.appendChild(input)
        }
        input.value = raw
      }
    }

    const table = document.querySelector("table[data-filter-table]")
    if (!table) return
    const domRows = table.querySelectorAll("tbody tr")
    domRows.forEach((row) => {
      let ok = true
      if (active) {
        for (const v of values) {
          if (v.needle === "") continue
          const hay = (row.getAttribute(`data-${v.attr}`) ?? "").toLowerCase()
          const hit = v.mode === "exact" ? hay === v.needle : hay.includes(v.needle)
          if (!hit) {
            ok = false
            break
          }
        }
      }
      ;(row as HTMLElement).hidden = !ok
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey])

  if (!active) return null

  return (
    <p className="muted filter-status">
      {matched === 0 ? (
        <>没有匹配的记录。</>
      ) : (
        <>
          匹配 {matched} / {rows.length} 条
        </>
      )}
      {activeValues.length > 0 && <>（{activeValues.join(" · ")}）</>}{" "}
      <a href={basePath}>清除筛选</a>
    </p>
  )
}

export default function TableFilter(props: TableFilterProps) {
  return (
    <Suspense fallback={null}>
      <TableFilterInner {...props} />
    </Suspense>
  )
}
