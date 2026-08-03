"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  /** Known tags shown as one-click suggestions (already-added ones are hidden) */
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
  id?: string
}

// Chips-style tag editor: Enter/comma adds, × or Backspace on empty removes.
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add tag…",
  disabled,
  id,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("")

  const addTag = (raw: string) => {
    const tag = raw.trim()
    if (!tag || value.includes(tag)) return
    onChange([...value, tag])
  }

  const removeTag = (tag: string) => onChange(value.filter(t => t !== tag))

  const commitDraft = () => {
    if (draft.trim()) {
      addTag(draft)
      setDraft("")
    }
  }

  const available = suggestions.filter(s => !value.includes(s))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No tags</span>
        )}
        {value.map(tag => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            <span className="text-xs">{tag}</span>
            <button
              type="button"
              className="ml-0.5 rounded hover:bg-muted-foreground/20 px-1 text-xs leading-none"
              onClick={() => removeTag(tag)}
              disabled={disabled}
              title="Remove"
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            commitDraft()
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            removeTag(value[value.length - 1])
          }
        }}
        onBlur={commitDraft}
      />
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.slice(0, 12).map(s => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-6 px-2 text-xs"
              onClick={() => addTag(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
