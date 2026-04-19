import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  LogOut, PanelLeft, Database, History, Waves, TrendingUp,
  DollarSign, Layers, BarChart2, SkipForward, Settings, Activity, Star
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663462741230/HcX4UDwzBfpzVCpAhKdyq4/boatrace-logo-LfzFqKSCNLvg2WXLjrstZi.webp";

const menuItems = [
  { icon: Waves,      label: "予想実行",       path: "/" },
  { icon: Star,       label: "おすすめレース", path: "/recommended" },
  { icon: Layers,     label: "一括予想",       path: "/batch" },
  { icon: Database,   label: "データ管理",     path: "/data" },
  { icon: History,    label: "予想履歴",       path: "/history" },
  { icon: DollarSign, label: "収支管理",       path: "/bankroll" },
  { icon: BarChart2,  label: "予想分析",       path: "/analytics" },
  { icon: SkipForward,label: "見送り履歴",     path: "/skip-history" },
  { icon: Activity,   label: "オッズモニター", path: "/odds-monitor" },
  { icon: Settings,   label: "設定",           path: "/settings" },
];

/** サイドバー当日成績ウィジェット */
function DailyStatsWidget() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const today = new Date();
  const raceDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const { data, isLoading, isError } = trpc.predict.getDailySummary.useQuery(
    { raceDate },
    { refetchInterval: 30_000 }
  );

  if (isCollapsed) {
    return (
      <div className="px-2 py-2">
        <div className="flex justify-center">
          <div className="h-8 w-8 flex items-center justify-center rounded-xl"
            style={{ background: "linear-gradient(135deg, oklch(0.62 0.18 200 / 0.25), oklch(0.62 0.18 200 / 0.1))", border: "1px solid oklch(0.62 0.18 200 / 0.3)" }}>
            <TrendingUp className="h-4 w-4" style={{ color: "oklch(0.75 0.18 200)" }} />
          </div>
        </div>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const hits = data?.hits ?? 0;
  const hitRate = data?.hitRate ?? null;
  const totalPayout = data?.totalPayout ?? 0;

  return (
    <div className="mx-2 my-2 rounded-2xl p-3 text-xs"
      style={{
        background: "linear-gradient(135deg, oklch(0.22 0.05 230 / 0.8), oklch(0.20 0.04 235 / 0.8))",
        border: "1px solid oklch(0.62 0.18 200 / 0.2)",
        boxShadow: "0 2px 12px oklch(0.62 0.18 200 / 0.08)"
      }}>
      <div className="flex items-center gap-1.5 mb-2.5">
        <TrendingUp className="h-3.5 w-3.5" style={{ color: "oklch(0.75 0.18 200)" }} />
        <span className="font-bold text-[11px] tracking-wide" style={{ color: "oklch(0.75 0.18 200)" }}>本日の成績</span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-[11px] text-center py-1">読み込み中...</p>
      ) : isError ? (
        <p className="text-muted-foreground text-[11px] text-center py-1">取得失敗</p>
      ) : total === 0 ? (
        <p className="text-muted-foreground text-[11px] text-center py-1">本日の予想はまだありません</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: "予想数", value: `${total}件`, color: "text-foreground" },
            { label: "的中", value: `${hits}件`, color: "text-primary" },
            {
              label: "的中率",
              value: hitRate !== null ? `${hitRate}%` : "-",
              color: hitRate !== null
                ? hitRate >= 30 ? "text-green-400" : hitRate >= 15 ? "text-yellow-400" : "text-muted-foreground"
                : "text-muted-foreground"
            },
            {
              label: "払戻",
              value: totalPayout > 0 ? `${totalPayout.toLocaleString()}円` : "0円",
              color: totalPayout > 0 ? "text-green-400" : "text-muted-foreground"
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl px-2 py-1.5 text-center"
              style={{ background: "oklch(0.16 0.04 230 / 0.7)" }}>
              <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
              <div className={`font-bold text-sm ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
          style={{
            background: "linear-gradient(180deg, oklch(0.16 0.05 230) 0%, oklch(0.14 0.04 235) 100%)",
            borderRight: "1px solid oklch(0.62 0.18 200 / 0.15)"
          }}
        >
          {/* ── ヘッダー（ロゴ） ── */}
          <SidebarHeader className="h-16 justify-center"
            style={{ borderBottom: "1px solid oklch(0.62 0.18 200 / 0.1)" }}>
            <div className="flex items-center gap-2.5 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 hover:scale-105"
                style={{ background: "oklch(0.22 0.05 230 / 0.8)", border: "1px solid oklch(0.62 0.18 200 / 0.2)" }}
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={LOGO_URL}
                    alt="競艇予想AI"
                    className="h-8 w-8 rounded-lg object-cover wave-float shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-extrabold text-sm truncate gradient-text leading-tight">
                      競艇予想AI
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate leading-tight">
                      3連単×6点予想
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* ── メニュー ── */}
          <SidebarContent className="gap-0 py-2">
            <SidebarMenu className="px-2 py-1 gap-0.5">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 rounded-xl font-medium transition-all duration-150"
                      style={isActive ? {
                        background: "linear-gradient(135deg, oklch(0.62 0.18 200 / 0.25), oklch(0.62 0.18 200 / 0.1))",
                        border: "1px solid oklch(0.62 0.18 200 / 0.35)",
                        color: "oklch(0.80 0.18 200)",
                      } : {}}
                    >
                      <item.icon
                        className="h-4 w-4 shrink-0"
                        style={isActive ? { color: "oklch(0.75 0.18 200)" } : {}}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* 当日成績ウィジェット */}
            <DailyStatsWidget />
          </SidebarContent>

          {/* ── フッター（ユーザー） ── */}
          <SidebarFooter className="p-3"
            style={{ borderTop: "1px solid oklch(0.62 0.18 200 / 0.1)" }}>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 rounded-xl px-2 py-2 w-full text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center hover:bg-sidebar-accent/50">
                    <Avatar className="h-8 w-8 shrink-0 rounded-xl"
                      style={{ border: "2px solid oklch(0.62 0.18 200 / 0.4)" }}>
                      <AvatarFallback className="text-xs font-bold rounded-xl"
                        style={{ background: "linear-gradient(135deg, oklch(0.62 0.18 200 / 0.3), oklch(0.70 0.18 20 / 0.2))", color: "oklch(0.80 0.18 200)" }}>
                        {user.name?.charAt(0).toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                      <p className="text-sm font-semibold truncate leading-none text-foreground">
                        {user.name || "-"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {user.email || "-"}
                      </p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  <DropdownMenuItem
                    onClick={logout}
                    className="cursor-pointer text-destructive focus:text-destructive rounded-lg"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>サインアウト</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <a
                href={getLoginUrl()}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all w-full justify-center group-data-[collapsible=icon]:justify-center"
                style={{
                  background: "linear-gradient(135deg, oklch(0.62 0.18 200 / 0.2), oklch(0.62 0.18 200 / 0.1))",
                  border: "1px solid oklch(0.62 0.18 200 / 0.3)",
                  color: "oklch(0.80 0.18 200)"
                }}
              >
                <span className="group-data-[collapsible=icon]:hidden">ログイン</span>
              </a>
            )}
          </SidebarFooter>
        </Sidebar>

        {/* リサイズハンドル */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50, background: isResizing ? "oklch(0.62 0.18 200 / 0.4)" : "transparent" }}
          onMouseEnter={e => { (e.target as HTMLElement).style.background = "oklch(0.62 0.18 200 / 0.2)"; }}
          onMouseLeave={e => { if (!isResizing) (e.target as HTMLElement).style.background = "transparent"; }}
        />
      </div>

      {/* ── メインコンテンツ ── */}
      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between px-3 sticky top-0 z-40 backdrop-blur-md"
            style={{
              background: "oklch(0.14 0.03 230 / 0.95)",
              borderBottomColor: "oklch(0.62 0.18 200 / 0.15)"
            }}>
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-xl" />
              <span className="font-bold text-foreground">
                {activeMenuItem?.label ?? "メニュー"}
              </span>
            </div>
            <img src={LOGO_URL} alt="logo" className="h-7 w-7 rounded-lg object-cover" />
          </div>
        )}
        <main className="flex-1 p-4 md:p-5">{children}</main>
      </SidebarInset>
    </>
  );
}
