"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Plus, Trash2, Pencil, Loader2, UserCheck, UserX,
  ShieldCheck, Link2, ChevronDown, ChevronUp, Copy, Eye, EyeOff,
  Download, ExternalLink, KeyRound, Check
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { PROXY_PORT } from "@/lib/config"
import { ProxyUser, ProxyPool, CreateProxyUserRequest } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_FORM: CreateProxyUserRequest = {
  username: "",
  password: "",
  enabled: true,
  allow_working_proxies_export: false,
  main_pool_id: null,
  fallback_pool_ids: [],
  max_retries: 5,
  requests_per_minute: 0,
}

export default function UsersPage() {
  const [users, setUsers] = useState<ProxyUser[]>([])
  const [pools, setPools] = useState<ProxyPool[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<ProxyUser | null>(null)
  const [form, setForm] = useState<CreateProxyUserRequest>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)

  // Working Proxies API Link Modal State
  const [apiLinkUser, setApiLinkUser] = useState<ProxyUser | null>(null)
  const [apiLinkPool, setApiLinkPool] = useState<string>("default")
  const [apiLinkCount, setApiLinkCount] = useState<string>("")
  const [apiLinkFormat, setApiLinkFormat] = useState<string>("raw")
  const [copiedLink, setCopiedLink] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, poolsRes] = await Promise.all([
        api.getProxyUsers(),
        api.getPools(),
      ])
      setUsers(usersRes.users)
      setPools(poolsRes.pools)
    } catch {
      toast.error("Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const poolName = (id?: number | null) => {
    if (!id) return "—"
    return pools.find(p => p.id === id)?.name ?? `Pool #${id}`
  }

  const openCreate = () => {
    setEditUser(null)
    setForm(DEFAULT_FORM)
    setShowPass(false)
    setDialogOpen(true)
  }

  const openEdit = (u: ProxyUser) => {
    setEditUser(u)
    setForm({
      username: u.username,
      password: "",
      enabled: u.enabled,
      allow_working_proxies_export: u.allow_working_proxies_export ?? false,
      main_pool_id: u.main_pool_id ?? null,
      fallback_pool_ids: u.fallback_pool_ids ?? [],
      max_retries: u.max_retries,
      requests_per_minute: u.requests_per_minute ?? 0,
    })
    setShowPass(false)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.username.trim()) { toast.error("Username is required"); return }
    if (!editUser && !form.password) { toast.error("Password is required"); return }
    setSaving(true)
    try {
      if (editUser) {
        const upd: any = {
          enabled: form.enabled,
          allow_working_proxies_export: form.allow_working_proxies_export,
          main_pool_id: form.main_pool_id,
          fallback_pool_ids: form.fallback_pool_ids,
          max_retries: form.max_retries,
          requests_per_minute: form.requests_per_minute,
        }
        if (form.password) upd.password = form.password
        await api.updateProxyUser(editUser.id, upd)
        toast.success("User updated")
      } else {
        await api.createProxyUser(form)
        toast.success("User created")
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message || "Failed to save user")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return
    try {
      await api.deleteProxyUser(id)
      toast.success("User deleted")
      load()
    } catch {
      toast.error("Failed to delete user")
    }
  }

  const toggleEnabled = async (u: ProxyUser) => {
    try {
      await api.updateProxyUser(u.id, { enabled: !u.enabled })
      load()
    } catch { toast.error("Failed to toggle user") }
  }

  const toggleAllowExport = async (u: ProxyUser) => {
    try {
      await api.updateProxyUser(u.id, { allow_working_proxies_export: !u.allow_working_proxies_export })
      toast.success(`Working proxy export ${!u.allow_working_proxies_export ? "enabled" : "disabled"} for ${u.username}`)
      load()
    } catch { toast.error("Failed to toggle export permission") }
  }

  const toggleFallback = (poolId: number) => {
    const current = form.fallback_pool_ids ?? []
    if (current.includes(poolId)) {
      setForm({ ...form, fallback_pool_ids: current.filter(x => x !== poolId) })
    } else {
      setForm({ ...form, fallback_pool_ids: [...current, poolId] })
    }
  }

  const copyProxyURL = (u: ProxyUser) => {
    const host = window.location.hostname
    const url = `http://${u.username}:***@${host}:${PROXY_PORT}`
    navigator.clipboard.writeText(url)
    toast.success("Proxy URL copied (replace *** with password)")
  }

  const openApiLinkModal = (u: ProxyUser) => {
    setApiLinkUser(u)
    setApiLinkPool("default")
    setApiLinkCount("")
    setApiLinkFormat("raw")
    setCopiedLink(false)
  }

  const generateExportUrl = (u: ProxyUser) => {
    const protocol = window.location.protocol
    const host = window.location.hostname
    const port = process.env.NEXT_PUBLIC_API_PORT || (window.location.port ? window.location.port : (protocol === "https:" ? "443" : "80"))
    const portSuffix = (port === "80" || port === "443") ? "" : `:${port}`
    const baseUrl = `${protocol}//${host}${portSuffix}/api/v1/proxy-users/export-working-proxies`
    const params = new URLSearchParams()
    params.set("username", u.username)
    params.set("password", "YOUR_PASSWORD")

    if (apiLinkPool && apiLinkPool !== "default") {
      params.set("pool", apiLinkPool)
    }
    if (apiLinkCount && parseInt(apiLinkCount) > 0) {
      params.set("count", apiLinkCount)
    }
    if (apiLinkFormat === "url") {
      params.set("format", "url")
    }
    return `${baseUrl}?${params.toString()}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proxy Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each user authenticates to <code className="text-xs bg-muted px-1 rounded">:{PROXY_PORT}</code> and is routed
            through their assigned pool chain. Requests auto-fail over to backup pools.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* How it works */}
      <Card className="border-dashed">
        <CardContent className="py-4 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-6">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-foreground">Auth via Proxy-Authorization</div>
                <div>Use <code className="text-xs">http://user:pass@&lt;your-host&gt;:{PROXY_PORT}</code> in your client</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Link2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-foreground">Pool chain with fallback</div>
                <div>Main pool → fallback pools in order. Per-pool rotation: roundrobin / random / sticky</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <UserCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <div className="font-medium text-foreground">Max retries across chain</div>
                <div>Each retry picks a fresh proxy. Failed proxies removed until next pool refresh</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{users.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Enabled</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-500">{users.filter(u => u.enabled).length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">With Main Pool</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{users.filter(u => u.main_pool_id).length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pools Available</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{pools.length}</div></CardContent>
        </Card>
      </div>

      {/* Table */}
      {users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <UserX className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No proxy users yet.</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add User</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Main Pool</TableHead>
                  <TableHead>Fallback Pools</TableHead>
                  <TableHead>Max Retries</TableHead>
                  <TableHead>Rate Limit</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Export API</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono font-medium">{u.username}</TableCell>
                    <TableCell>
                      {u.main_pool_id ? (
                        <Badge variant="secondary">{u.main_pool_name || poolName(u.main_pool_id)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No pool assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.fallback_pool_ids && u.fallback_pool_ids.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.fallback_pool_ids.map((id, i) => (
                            <Badge key={id} variant="outline" className="text-xs">
                              {i + 1}. {poolName(id)}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{u.max_retries}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {u.requests_per_minute > 0 ? `${u.requests_per_minute}/min` : "∞"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Switch checked={u.enabled} onCheckedChange={() => toggleEnabled(u)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={u.allow_working_proxies_export ?? false}
                          onCheckedChange={() => toggleAllowExport(u)}
                        />
                        {u.allow_working_proxies_export ? (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 bg-green-50">Allowed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Disabled</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {u.allow_working_proxies_export && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openApiLinkModal(u)}
                            title="Working Proxies API Link"
                            className="text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => copyProxyURL(u)} title="Copy proxy URL">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => handleDelete(u.id, u.username)}
                          className="text-red-500 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editUser ? `Edit User: ${editUser.username}` : "Add Proxy User"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <Label>Username</Label>
              <Input
                placeholder="e.g. alice"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                disabled={!!editUser}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <Label>{editUser ? "New password (leave blank to keep current)" : "Password"}</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder={editUser ? "Leave blank to keep" : "min 6 characters"}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPass(v => !v)}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Main pool */}
            <div className="flex flex-col gap-1.5">
              <Label>Main Pool</Label>
              <Select
                value={form.main_pool_id?.toString() ?? "none"}
                onValueChange={v => setForm({ ...form, main_pool_id: v === "none" ? null : parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select main pool…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No pool (global rotation) —</SelectItem>
                  {pools.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                      {" "}
                      <span className="text-muted-foreground text-xs">
                        ({p.active_proxies}/{p.total_proxies} active)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                All requests from this user go through the main pool first.
              </p>
            </div>

            {/* Fallback pools */}
            <div className="flex flex-col gap-2">
              <Label>Fallback Pools (in priority order)</Label>
              {pools.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pools available</p>
              ) : (
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {pools
                    .filter(p => p.id !== form.main_pool_id)
                    .map(p => {
                      const checked = (form.fallback_pool_ids ?? []).includes(p.id)
                      const idx = (form.fallback_pool_ids ?? []).indexOf(p.id)
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleFallback(p.id)}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleFallback(p.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.active_proxies} active · {p.rotation_method}
                            </div>
                          </div>
                          {checked && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              #{idx + 1}
                            </Badge>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                If main pool has no alive IPs, requests cascade to fallbacks in order.
              </p>
            </div>

            {/* Max retries */}
            <div className="flex flex-col gap-1.5">
              <Label>Max retries (across all pools)</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.max_retries}
                onChange={e => setForm({ ...form, max_retries: parseInt(e.target.value) || 5 })}
              />
              <p className="text-xs text-muted-foreground">
                Each retry picks a different IP. Failed IPs are excluded from subsequent retries within the same request.
              </p>
            </div>
            {/* Rate limit */}
            <div className="flex flex-col gap-1.5">
              <Label>Rate limit (requests/minute)</Label>
              <Input
                type="number"
                min={0}
                value={form.requests_per_minute ?? 0}
                onChange={e => setForm({ ...form, requests_per_minute: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">
                0 = no limit. When exceeded, proxy returns 429.
              </p>
            </div>

            {/* Allow Working Proxies Export */}
            <div className="flex items-center justify-between border p-3 rounded-lg bg-muted/20">
              <div className="space-y-0.5">
                <Label htmlFor="user-export-toggle" className="font-medium text-sm cursor-pointer">
                  Allow Working Proxies Export
                </Label>
                <p className="text-xs text-muted-foreground">
                  Allows querying working pool proxies via API link with user auth & pool parameters.
                </p>
              </div>
              <Switch
                id="user-export-toggle"
                checked={form.allow_working_proxies_export ?? false}
                onCheckedChange={v => setForm({ ...form, allow_working_proxies_export: v })}
              />
            </div>

            {/* Enabled */}
            <div className="flex items-center gap-2">
              <Switch
                id="user-enabled"
                checked={form.enabled}
                onCheckedChange={v => setForm({ ...form, enabled: v })}
              />
              <Label htmlFor="user-enabled">Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editUser ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Working Proxies Export Link Modal */}
      <Dialog open={!!apiLinkUser} onOpenChange={open => !open && setApiLinkUser(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Working Proxies API Link
            </DialogTitle>
            <DialogDescription>
              Generate API query link to fetch line-delimited working proxies for <strong>{apiLinkUser?.username}</strong>.
            </DialogDescription>
          </DialogHeader>

          {apiLinkUser && (
            <div className="flex flex-col gap-4 py-2 text-sm">
              {/* Pool Selection */}
              <div className="flex flex-col gap-1.5">
                <Label>Target Pool</Label>
                <Select value={apiLinkPool} onValueChange={setApiLinkPool}>
                  <SelectTrigger>
                    <SelectValue placeholder="Default (Main Pool)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (User's Main Pool: {apiLinkUser.main_pool_id ? poolName(apiLinkUser.main_pool_id) : "None"})</SelectItem>
                    {pools.map(p => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name} (ID: {p.id} · {p.active_proxies} active)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Specified via <code className="text-xs bg-muted px-1 rounded">?pool=name</code> or <code className="text-xs bg-muted px-1 rounded">?pool_id=id</code>. Omit to default to user's main pool.
                </p>
              </div>

              {/* Count Limit & Format */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Count Limit (Optional)</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g. 50 (empty = all)"
                    value={apiLinkCount}
                    onChange={e => setApiLinkCount(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Proxy Format</Label>
                  <Select value={apiLinkFormat} onValueChange={setApiLinkFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raw">address[:user:pass]</SelectItem>
                      <SelectItem value="url">protocol://[user:pass@]address</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Generated URL */}
              <div className="flex flex-col gap-1.5">
                <Label className="font-semibold">API Endpoint URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={generateExportUrl(apiLinkUser)}
                    className="font-mono text-xs bg-muted/50 select-all"
                  />
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(generateExportUrl(apiLinkUser))
                      setCopiedLink(true)
                      toast.success("API link copied to clipboard")
                      setTimeout(() => setCopiedLink(false), 2000)
                    }}
                  >
                    {copiedLink ? <Check className="h-4 w-4 mr-1 text-green-500" /> : <Copy className="h-4 w-4 mr-1" />}
                    {copiedLink ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  ⚠️ Note: Replace <code>YOUR_PASSWORD</code> in the URL with {apiLinkUser.username}'s actual proxy password.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApiLinkUser(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
