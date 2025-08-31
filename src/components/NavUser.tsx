import React from "react"
import {
  BadgeCheck,
  ChevronsUpDown,
  LogOut,
  Settings,
} from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavUser({
  user,
  setIsSettingsOpen,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  setIsSettingsOpen?: (open: boolean) => void
}) {
  const { isMobile } = useSidebar()

  // Derive a GitHub username if possible for robust fallbacks
  const githubUsername = React.useMemo(() => {
    // Try to extract from avatar URL like https://github.com/<user>.png
    const m = user.avatar.match(/github\.com\/(?:u\/)?([^\/?#.]+)(?:\.png)?/i)
    if (m && m[1] && m[1] !== 'u') return m[1]
    // Fallback to email local part if exists
    const emailPart = user.email?.split('@')[0]
    return emailPart || ''
  }, [user.avatar, user.email])

  const [imgSrc, setImgSrc] = React.useState<string>(user.avatar)
  React.useEffect(() => setImgSrc(user.avatar), [user.avatar])

  const handleImgError = React.useCallback(() => {
    // Attempt alternate sources before giving up to fallback initials
    if (githubUsername && !imgSrc.includes('avatars.githubusercontent.com')) {
      setImgSrc(`https://avatars.githubusercontent.com/${githubUsername}`)
    } else if (githubUsername && !imgSrc.includes('github.com')) {
      setImgSrc(`https://github.com/${githubUsername}.png?size=128`)
    }
    // If both fail, AvatarFallback will show initials
  }, [githubUsername, imgSrc])

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage
                  src={imgSrc}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  onError={handleImgError}
                />
                <AvatarFallback className="rounded-lg">
                  {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={imgSrc}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    onError={handleImgError}
                  />
                  <AvatarFallback className="rounded-lg">
                    {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setIsSettingsOpen?.(true)}>
                <Settings />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
