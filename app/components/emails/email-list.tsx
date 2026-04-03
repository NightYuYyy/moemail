"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { CreateDialog } from "./create-dialog"
import { ShareDialog } from "./share-dialog"
import { Mail, RefreshCw, Trash2, Pin, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, SlidingTabsList, SlidingTabsTrigger } from "@/components/ui/tabs"
import { useThrottle } from "@/hooks/use-throttle"
import { EMAIL_CONFIG } from "@/config"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ROLES } from "@/lib/permissions"
import { useUserRole } from "@/hooks/use-user-role"
import { useConfig } from "@/hooks/use-config"

interface Email {
  id: string
  address: string
  createdAt: number
  expiresAt: number
  pinnedAt: number | null
}

interface EmailListProps {
  onEmailSelect: (email: Email | null) => void
  selectedEmailId?: string
}

interface EmailResponse {
  pinned: Email[]
  emails: Email[]
  nextCursor: string | null
  total: number
}

export function EmailList({ onEmailSelect, selectedEmailId }: EmailListProps) {
  const { data: session } = useSession()
  const { config } = useConfig()
  const { role } = useUserRole()
  const t = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const [emails, setEmails] = useState<Email[]>([])
  const [pinnedEmails, setPinnedEmails] = useState<Email[]>([])
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [permanentFilter, setPermanentFilter] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [emailToDelete, setEmailToDelete] = useState<Email | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const fetchEmails = useCallback(async (cursor?: string) => {
    try {
      const url = new URL("/api/emails", window.location.origin)
      if (cursor) url.searchParams.set('cursor', cursor)
      if (searchQuery) url.searchParams.set('search', searchQuery)
      if (permanentFilter) url.searchParams.set('permanent', 'true')

      const response = await fetch(url)
      const data = await response.json() as EmailResponse
      
      setPinnedEmails(data.pinned || [])

      if (!cursor) {
        setEmails(data.emails)
        setNextCursor(data.nextCursor)
        setTotal(data.total)
        return
      }
      setEmails(prev => [...prev, ...data.emails])
      setNextCursor(data.nextCursor)
      setTotal(data.total)
    } catch (error) {
      console.error("Failed to fetch emails:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [searchQuery, permanentFilter])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchEmails()
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold && nextCursor) {
      setLoadingMore(true)
      fetchEmails(nextCursor)
    }
  }, 200)

  useEffect(() => {
    if (session) {
      setLoading(true)
      fetchEmails()
    }
  }, [session, searchQuery, permanentFilter, fetchEmails])

  const handlePinToggle = async (email: Email) => {
    try {
      const isPinned = email.pinnedAt !== null
      const response = await fetch(`/api/emails/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !isPinned })
      })
      if (!response.ok) {
        toast({ title: t("error"), description: "Failed to update pin status", variant: "destructive" })
        return
      }
      fetchEmails()
    } catch {
      toast({ title: t("error"), description: "Failed to update pin status", variant: "destructive" })
    }
  }

  const handleDelete = async (email: Email) => {
    try {
      const response = await fetch(`/api/emails/${email.id}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: t("error"),
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      await fetchEmails()

      toast({
        title: t("success"),
        description: t("deleteSuccess")
      })
      
      if (selectedEmailId === email.id) {
        onEmailSelect(null)
      }
    } catch {
      toast({
        title: t("error"),
        description: t("deleteFailed"),
        variant: "destructive"
      })
    } finally {
      setEmailToDelete(null)
    }
  }

  if (!session) return null

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="p-2 flex justify-between items-center border-b border-primary/20">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className={cn("h-8 w-8", refreshing && "animate-spin")}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-500">
              {role === ROLES.EMPEROR ? (
                t("emailCountUnlimited", { count: pinnedEmails.length + total })
              ) : (
                t("emailCount", { count: pinnedEmails.length + total, max: config?.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS })
              )}
            </span>
          </div>
          <CreateDialog onEmailCreated={handleRefresh} />
        </div>
        
        <div className="px-2 pt-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("search")}
              className="w-full pl-8 pr-8 py-1.5 text-sm rounded-md border border-primary/20 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
        </div>

        <div className="px-2 pt-2">
          <Tabs value={permanentFilter ? "permanent" : "all"} onValueChange={(v) => setPermanentFilter(v === "permanent")} className="w-full">
            <SlidingTabsList className="w-full">
              <SlidingTabsTrigger value="all" className="flex-1">{t("filterAll")}</SlidingTabsTrigger>
              <SlidingTabsTrigger value="permanent" className="flex-1">{t("filterPermanent")}</SlidingTabsTrigger>
            </SlidingTabsList>
          </Tabs>
        </div>
        
        <div className="flex-1 overflow-auto p-2" onScroll={handleScroll}>
          {loading ? (
            <div className="text-center text-sm text-gray-500">{t("loading")}</div>
          ) : (pinnedEmails.length > 0 || emails.length > 0) ? (
            <div className="space-y-1">
              {pinnedEmails.length > 0 && (
                <>
                  {pinnedEmails.map(email => (
                    <div
                      key={email.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded cursor-pointer text-sm group",
                        "bg-primary/5 border border-primary/10",
                        selectedEmailId === email.id && "bg-primary/10"
                      )}
                      onClick={() => onEmailSelect(email)}
                    >
                      <Pin className="h-4 w-4 text-primary/60 shrink-0" />
                      <div className="truncate flex-1">
                        <div className="font-medium truncate">{email.address}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(email.expiresAt).getFullYear() === 9999 ? (
                            t("permanent")
                          ) : (
                            `${t("expiresAt")}: ${new Date(email.expiresAt).toLocaleString()}`
                          )}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <ShareDialog emailId={email.id} emailAddress={email.address} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handlePinToggle(email)}
                          title={t("unpin")}
                        >
                          <Pin className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEmailToDelete(email)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-primary/10 my-1" />
                </>
              )}
              {emails.map(email => (
                <div
                  key={email.id}
                  className={cn("flex items-center gap-2 p-2 rounded cursor-pointer text-sm group",
                    "hover:bg-primary/5",
                    selectedEmailId === email.id && "bg-primary/10"
                  )}
                  onClick={() => onEmailSelect(email)}
                >
                  <Mail className="h-4 w-4 text-primary/60" />
                  <div className="truncate flex-1">
                    <div className="font-medium truncate">{email.address}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(email.expiresAt).getFullYear() === 9999 ? (
                        t("permanent")
                      ) : (
                        `${t("expiresAt")}: ${new Date(email.expiresAt).toLocaleString()}`
                      )}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <ShareDialog emailId={email.id} emailAddress={email.address} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handlePinToggle(email)}
                      title={t("pin")}
                    >
                      <Pin className="h-4 w-4 text-gray-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEmailToDelete(email)
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {loadingMore && (
                <div className="text-center text-sm text-gray-500 py-2">
                  {t("loadingMore")}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500">
              {t("noEmails")}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!emailToDelete} onOpenChange={() => setEmailToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { email: emailToDelete?.address || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => emailToDelete && handleDelete(emailToDelete)}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
} 