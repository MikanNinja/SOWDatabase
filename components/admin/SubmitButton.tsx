"use client"

import type { ReactNode } from "react"
import { useFormStatus } from "react-dom"

/**
 * 提交按钮：所在表单的 server action 在途期间禁用并显示“提交中…”，
 * 防止 Supabase 高延迟下的重复提交。须渲染在 <form> 内部。
 */
export default function SubmitButton({
  children,
  className = "btn primary",
  pendingLabel = "提交中…",
}: {
  children: ReactNode
  className?: string
  pendingLabel?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
