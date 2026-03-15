import * as React from "react"
import { AppWindowMac } from "lucide-react"

type ProjectApplicationIconProps = {
  applicationId: string
  className?: string
}

function SvgIcon({
  applicationId,
  className,
  children,
  viewBox = "0 0 24 24",
}: React.PropsWithChildren<ProjectApplicationIconProps & { viewBox?: string }>) {
  return (
    <svg
      aria-hidden="true"
      data-project-application-icon={applicationId}
      viewBox={viewBox}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  )
}

export function ProjectApplicationIcon({
  applicationId,
  className = "size-4 shrink-0",
}: ProjectApplicationIconProps) {
  switch (applicationId) {
    // Cursor — dark hexagonal cube shape (from real icon)
    case "cursor":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 167 191">
          <path d="M80.88 0H85.89C110.23 14.16 134.65 28.16 159 42.29C161.65 44.01 164.72 45.57 166.29 48.45C167.12 52.23 166.75 56.13 166.81 59.97C166.76 84.84 166.77 109.71 166.81 134.57C166.76 137.12 166.85 139.72 166.31 142.24C164.71 144.72 162 146.16 159.57 147.69C138.71 159.63 117.93 171.73 97.13 183.77C92.71 186.24 88.48 189.21 83.65 190.89C80.68 190.47 78.09 188.76 75.49 187.39C54.41 174.96 33.09 162.96 12 150.56C7.8 148.21 3.72 145.64 0 142.57V48.13C5.11 43.09 11.75 40.16 17.79 36.44C38.8 24.25 59.76 11.97 80.88 0ZM7.49 50.72C11.04 54.19 15.84 55.77 19.95 58.4C40.8 70.75 62 82.52 82.73 95.07C83.81 101.09 83.33 107.24 83.4 113.33C83.43 134.19 83.35 155.05 83.39 175.91C83.39 178.25 83.63 180.59 84.01 182.89C85.57 180.8 87.05 178.64 88.32 176.36C110.76 137.44 133.24 98.56 155.53 59.56C157.19 56.83 158.45 53.89 159.43 50.85C151.21 50.2 142.97 50.55 134.75 50.49C98.28 50.47 61.8 50.47 25.32 50.49C19.39 50.69 13.43 50.04 7.49 50.72Z" fill="#26241E"/>
        </SvgIcon>
      )
    // Antigravity — Google-colored gradient swoosh (from real icon)
    case "antigravity":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 434 400">
          <defs>
            <linearGradient id="ag-grad" x1="0" y1="0.5" x2="1" y2="0.5">
              <stop offset="0%" stopColor="#4285F4"/>
              <stop offset="33%" stopColor="#34A853"/>
              <stop offset="66%" stopColor="#FBBC04"/>
              <stop offset="100%" stopColor="#EA4335"/>
            </linearGradient>
          </defs>
          <path d="M392.71,390.14c24.17,18.13,60.42,6.04,27.19-27.2C320.21,266.25,341.35.34,217.5.34S114.79,266.25,15.1,362.94c-36.25,36.26,3.02,45.33,27.19,27.2C135.93,326.68,129.89,214.88,217.5,214.88s81.56,111.8,175.21,175.26Z" fill="url(#ag-grad)"/>
        </SvgIcon>
      )
    // Zed — bold blue Z with crossbar
    case "zed":
      return (
        <SvgIcon applicationId={applicationId} className={className}>
          <path d="M6 6.5h12L6.5 17.5H18.5" stroke="#3B82F6" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="6" y1="12" x2="18" y2="12" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" />
        </SvgIcon>
      )
    // Sublime Text — dark square with orange S swoosh (from real icon)
    case "sublime-text":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 32 32">
          <rect width="32" height="32" rx="5" fill="#4D4D4E"/>
          <path d="M7 9.5l18-5.5v5.5L14 12.5 7 9.5Z" fill="#F89820"/>
          <path d="M7 9.5c0 0-.5.2-.5 1.5v5s-.1.8 1.2 1.2l17.3 5.5c0 0 .6.3.5-.5v-5.7c0 0 .2-.6-.9-1L14 12.5 7 9.5Z" fill="#F89820"/>
          <path d="M14.5 19l-7.5 2c0 0-.9 0-.8 1.8v5c0 0 0 .7 1 .3l18-5.5c0 0 .6-.2.1-.4L14.5 19Z" fill="#C27818"/>
        </SvgIcon>
      )
    // Xcode — blue rounded square with hammer (simplified from real icon)
    case "xcode":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 128 128">
          <defs>
            <linearGradient id="xc-bg" x1="64" y1="114" x2="64" y2="14" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1578E4"/>
              <stop offset="1" stopColor="#00C3F2"/>
            </linearGradient>
          </defs>
          <path d="M35.7 13.8h56.5c12.1 0 21.9 9.8 21.9 21.9v56.5c0 12.1-9.8 21.9-21.9 21.9H35.7c-12.1 0-21.9-9.8-21.9-21.9V35.7c0-12.1 9.8-21.9 21.9-21.9z" fill="url(#xc-bg)"/>
          <path d="M90.5 19.2H37.4c-10.1 0-18.3 8.2-18.3 18.3v53.1c0 10.1 8.2 18.3 18.3 18.3h53.1c10.1 0 18.3-8.2 18.3-18.3V37.4c0-10.1-8.2-18.2-18.3-18.2zm16.8 71.6c0 9.2-7.4 16.6-16.6 16.6H37.2c-9.1 0-16.6-7.4-16.6-16.6V37.2c0-9.2 7.4-16.6 16.6-16.6h53.6c9.1 0 16.6 7.4 16.6 16.6v53.6z" fill="#FFF"/>
          <path fill="#FFF" d="M62 34.1l31.2 54c1.3 2.2.5 5-1.7 6.3-2.2 1.3-5 .5-6.3-1.7L54 38.7c-1.3-2.2-.5-5 1.7-6.3 2.2-1.3 5-.5 6.3 1.7z"/>
          <path fill="#FFF" d="M55.5 71.3c8.7-15 18.7-32.4 18.7-32.4 1.3-2.2.5-5-1.7-6.3-2.2-1.3-5-.5-6.3 1.7 0 0-12.2 21.2-21.4 37h10.7zm-5.4 9.2c-4.2 7.2-7.1 12.4-7.1 12.4-1.3 2.2-4.1 3-6.3 1.7s-3-4.1-1.7-6.3c0 0 1.7-3.1 4.4-7.7 3.4-.1 9.6-.1 10.7-.1z"/>
          <rect x="28.2" y="72.2" width="71.6" height="7.5" rx="3.7" fill="#0A93E9"/>
        </SvgIcon>
      )
    // iTerm — dark terminal with traffic lights and green prompt
    case "iterm":
      return (
        <SvgIcon applicationId={applicationId} className={className}>
          <rect x="3" y="4" width="18" height="16" rx="3" fill="#1E293B" />
          <rect x="3" y="4" width="18" height="4" rx="3" fill="#334155" />
          <circle cx="6.5" cy="6" r=".8" fill="#EF4444" />
          <circle cx="9" cy="6" r=".8" fill="#F59E0B" />
          <circle cx="11.5" cy="6" r=".8" fill="#22C55E" />
          <path d="M7 12l2.5 2-2.5 2" stroke="#22C55E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="11" y1="16" x2="16" y2="16" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
        </SvgIcon>
      )
    // Warp — black square with cyan/blue angular shapes (from real icon)
    case "warp":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 400 400">
          <rect width="400" height="400" fill="#000"/>
          <path d="M200 97c0 0-6 0-6 3.5v229c0 3.5 6 3.5 6 3.5s6 0 6-3.5V100.5c0-3.5-6-3.5-6-3.5z" fill="#00CBE4" transform="translate(0,-3)"/>
          <path d="M70 262.5c0 0-5.1-43 0-75s22-64 47-87S175 62 200 57c25-5 55 0 82 20s47 50 53 82 2 64 2 64" fill="none" stroke="#006CA7" strokeWidth="28" strokeLinecap="round"/>
          <path d="M70 262.5c0 0-5.1-43 0-75s22-64 47-87S175 62 200 57c25-5 55 0 82 20s47 50 53 82 2 64 2 64" fill="none" stroke="#00CBE4" strokeWidth="14" strokeLinecap="round"/>
        </SvgIcon>
      )
    // Terminal — macOS native terminal with traffic lights
    case "terminal":
      return (
        <SvgIcon applicationId={applicationId} className={className}>
          <rect x="3" y="4" width="18" height="16" rx="3" fill="#1C1C1E" />
          <rect x="3" y="4" width="18" height="4" rx="3" fill="#3A3A3C" />
          <circle cx="6.5" cy="6" r=".8" fill="#FF5F57" />
          <circle cx="9" cy="6" r=".8" fill="#FEBC2E" />
          <circle cx="11.5" cy="6" r=".8" fill="#28C840" />
          <path d="M7 12l2.5 2-2.5 2" stroke="#F8FAFC" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="11" y1="16" x2="16" y2="16" stroke="#636366" strokeWidth="1.5" strokeLinecap="round" />
        </SvgIcon>
      )
    // Ghostty — blue/white ghost with terminal prompt (from real icon)
    case "ghostty":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 27 32">
          <path d="M20.3955 32C19.1436 32 17.9152 31.6249 16.879 30.9333C15.8428 31.6249 14.6121 32 13.3625 32C12.113 32 10.8822 31.6249 9.84606 30.9333C8.8169 31.6249 7.62598 31.9906 6.37177 32H6.33426C4.63228 32 3.0358 31.3225 1.83316 30.0941C0.64928 28.8844-0.00244141 27.2926-0.00244141 25.6117V13.3626C-9.70841e-05 5.99443 5.99433 0 13.3625 0C20.7307 0 26.7252 5.99443 26.7252 13.3626V25.6164C26.7252 29.0086 24.0995 31.8078 20.7472 31.9906C20.6299 31.9977 20.5127 32 20.3955 32Z" fill="#3551F3"/>
          <path d="M20.3955 30.5934C19.2773 30.5934 18.1848 30.209 17.3151 29.5104C17.165 29.3884 17.0033 29.365 16.8954 29.365C16.7243 29.365 16.5508 29.426 16.4078 29.5408C15.5451 30.2207 14.4644 30.5958 13.3625 30.5958C12.2607 30.5958 11.18 30.2207 10.3173 29.5408C10.1789 29.4306 10.0148 29.3744 9.84605 29.3744C9.67726 29.3744 9.51316 29.433 9.37485 29.5408C8.50979 30.223 7.46891 30.5864 6.36474 30.5958H6.33192C5.01675 30.5958 3.7766 30.0706 2.84122 29.1142C1.91756 28.1694 1.40649 26.9269 1.40649 25.6164V13.3673C1.40649 6.77043 6.7703 1.40662 13.3625 1.40662C19.9548 1.40662 25.3186 6.77043 25.3186 13.3627V25.6164C25.3186 28.2608 23.2767 30.4434 20.6698 30.5864C20.5784 30.5911 20.4869 30.5934 20.3955 30.5934Z" fill="black"/>
          <path d="M23.9119 13.3627V25.6165C23.9119 27.4919 22.4654 29.079 20.5923 29.1822C19.6827 29.2314 18.8435 28.936 18.1941 28.4132C17.4158 27.7873 16.321 27.8154 15.5356 28.4343C14.9378 28.9055 14.183 29.1869 13.3601 29.1869C12.5372 29.1869 11.7847 28.9055 11.1869 28.4343C10.3922 27.8084 9.29738 27.8084 8.50266 28.4343C7.90954 28.9009 7.16405 29.1822 6.35291 29.1869C4.40478 29.2009 2.81299 27.5599 2.81299 25.6118V13.3627C2.81299 7.53704 7.5368 2.81323 13.3624 2.81323C19.1881 2.81323 23.9119 7.53704 23.9119 13.3627Z" fill="white"/>
          <path d="M11.2808 12.4366L7.3494 10.1673C6.83833 9.87192 6.18192 10.0477 5.88654 10.5588C5.59115 11.0699 5.76698 11.7263 6.27804 12.0217L8.60361 13.365L6.27804 14.7083C5.76698 15.0036 5.59115 15.6577 5.88654 16.1711C6.18192 16.6822 6.83599 16.858 7.3494 16.5626L11.2808 14.2933C11.9935 13.8807 11.9935 12.8516 11.2808 12.4389V12.4366Z" fill="black"/>
          <path d="M20.1822 12.2913H15.0176C14.4269 12.2913 13.9463 12.7695 13.9463 13.3626C13.9463 13.9557 14.4245 14.434 15.0176 14.434H20.1822C20.773 14.434 21.2535 13.9557 21.2535 13.3626C21.2535 12.7695 20.7753 12.2913 20.1822 12.2913Z" fill="black"/>
        </SvgIcon>
      )
    // VS Code — official logo shape (simplified from real SVG)
    case "vs-code":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 100 100">
          <path d="M96.46 10.8L75.86.87c-2.39-1.15-5.24-.66-7.11 1.21L1.3 63.58c-1.81 1.65-1.81 4.51.01 6.16l5.51 5.01c1.49 1.35 3.72 1.45 5.32.23L93.36 13.37c2.73-2.07 6.64-.12 6.64 3.3v-.24c0-2.4-1.38-4.59-3.54-5.63z" fill="#0065A9"/>
          <path d="M96.46 89.2L75.86 99.12c-2.39 1.15-5.24.66-7.11-1.21L1.3 36.42c-1.81-1.65-1.81-4.51.01-6.16l5.51-5.01c1.49-1.35 3.72-1.45 5.32-.23l81.23 61.62c2.73 2.07 6.64.12 6.64-3.3v.24c0 2.4-1.38 4.59-3.54 5.63z" fill="#007ACC"/>
          <path d="M75.86 99.13c-2.39 1.15-5.24.66-7.11-1.21 2.31 2.31 6.25.7 6.25-2.59V4.67c0-3.26-3.94-4.9-6.25-2.58 1.87-1.87 4.72-2.36 7.11-1.21l20.6 9.91C98.62 11.82 100 14.01 100 16.41v67.17c0 2.4-1.38 4.59-3.54 5.63l-20.6 9.91z" fill="#1F9CF0"/>
        </SvgIcon>
      )
    // JetBrains Toolbox — gradient rounded shape + black square + white bar (from real icon)
    case "jetbrains":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 32 32">
          <defs>
            <linearGradient id="jb-grad" x1=".425" x2="31.31" y1="31.36" y2=".905" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF9419"/>
              <stop offset=".43" stopColor="#FF021D"/>
              <stop offset=".99" stopColor="#E600FF"/>
            </linearGradient>
          </defs>
          <path fill="url(#jb-grad)" d="m10.17 1.83-8.34 8.34C.66 11.34 0 12.93 0 14.59V29.5C0 30.88 1.12 32 2.5 32h14.91c1.66 0 3.245-.66 4.42-1.83l8.34-8.34c1.17-1.17 1.83-2.76 1.83-4.42V2.5C32 1.12 30.88 0 29.5 0H14.59c-1.66 0-3.245.66-4.42 1.83Z"/>
          <path fill="#000" d="M24 8H4v20h20V8Z"/>
          <path fill="#fff" d="M7 23h8v2H7z"/>
        </SvgIcon>
      )
    // Windsurf — W-shaped wave form (from real icon)
    case "windsurf":
      return (
        <SvgIcon applicationId={applicationId} className={className} viewBox="0 0 512 297">
          <path d="M507.28 0.142623H502.4C476.721 0.10263 455.882 20.899 455.882 46.5745V150.416C455.882 171.153 438.743 187.95 418.344 187.95C406.224 187.95 394.125 181.851 386.945 171.613L280.889 20.1391C272.089 7.56133 257.77 0.0626373 242.271 0.0626373C218.091 0.0626373 196.332 20.6191 196.332 45.9946V150.436C196.332 171.173 179.333 187.97 158.794 187.97C146.634 187.97 134.555 181.871 127.375 171.633L8.69966 2.12228C6.01976-1.71705 0 0.182617 0 4.8618V95.426C0 100.005 1.39995 104.444 4.01984 108.204L120.815 274.995C127.715 284.853 137.895 292.172 149.634 294.831C179.013 301.51 206.052 278.894 206.052 250.079V145.697C206.052 124.961 222.851 108.164 243.59 108.164H243.65C256.15 108.164 267.87 114.263 275.049 124.501L381.125 275.955C389.945 288.552 403.524 296.031 419.724 296.031C444.443 296.031 465.622 275.455 465.622 250.099V145.677C465.622 124.941 482.421 108.144 503.16 108.144H507.3C509.9 108.144 512 106.044 512 103.445V4.8418C512 2.24226 509.9 0.142623 507.3 0.142623H507.28Z" fill="currentColor"/>
        </SvgIcon>
      )
    // Trae — blue rounded square with white T
    case "trae":
      return (
        <SvgIcon applicationId={applicationId} className={className}>
          <rect x="3" y="3" width="18" height="18" rx="4" fill="#4F46E5" />
          <path d="M8 8.5h8M12 8.5v9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </SvgIcon>
      )
    default:
      return <AppWindowMac aria-hidden="true" data-project-application-icon={applicationId} className={className} />
  }
}
