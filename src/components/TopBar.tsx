import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link, NavLink as RRNavLink } from "react-router-dom";
import {
  Pickaxe,
  Trophy,
  ShieldCheck,
  ShoppingBag,
  Gauge,
  Home as HomeIcon,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { useIsAdmin, usePendingRewards, usePoolInfo } from "@/lib/onchain";
import { fmtBig } from "@/lib/bigformat";
import { useMobileNavVariant } from "@/lib/mobile-nav";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
};

const BASE_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: <HomeIcon className="h-4 w-4" /> },
  { to: "/shop", label: "Shop", icon: <ShoppingBag className="h-4 w-4" /> },
  { to: "/dashboard", label: "Dashboard", icon: <Gauge className="h-4 w-4" /> },
  { to: "/leaderboard", label: "Leaderboard", icon: <Trophy className="h-4 w-4" /> },
  { to: "/admin", label: "Admin", icon: <ShieldCheck className="h-4 w-4" />, adminOnly: true },
];

export function TopBar() {
  const { address } = useAccount();
  const { data: bal } = useBalance({ address, query: { refetchInterval: 5000 } });
  const { pending } = usePendingRewards();
  const { rewardPool, treasury } = usePoolInfo();
  const { isAdmin } = useIsAdmin();
  const [variant] = useMobileNavVariant();

  const navItems = BASE_NAV.filter((i) => !i.adminOnly || isAdmin);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/5 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-orange-500 shadow-lg shadow-sky-500/30">
              <Pickaxe className="h-5 w-5 text-slate-900" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-wide">LiteMiner</div>
              <div className="hidden text-[10px] uppercase tracking-widest text-muted-foreground sm:block">
                LiteForge · 4441 · on-chain
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="ml-4 hidden gap-1 md:flex">
            {navItems.map((i) => (
              <TopNavLink key={i.to} to={i.to} label={i.label} icon={i.icon} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <Stat label="Balance" value={`${fmtBig(bal?.value ?? 0n, 3)} zkLTC`} />
              <Stat label="Pending" value={`${fmtBig(pending, 4)} zkLTC`} accent="orange" />
              {isAdmin && <Stat label="Pool" value={`${fmtBig(rewardPool, 2)}`} />}
              {isAdmin && <Stat label="Treasury" value={`${fmtBig(treasury, 2)}`} />}
            </div>
            <ConnectButton
              chainStatus={{ smallScreen: "icon", largeScreen: "full" }}
              accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
              showBalance={false}
            />
            {/* Hamburger button on mobile only when hamburger variant is active */}
            {variant === "hamburger" && (
              <HamburgerButton items={navItems} />
            )}
          </div>
        </div>
      </header>

      {/* Mobile floating dock */}
      {variant === "floating" && <FloatingDock items={navItems} />}
      {/* Mobile bottom tabbar */}
      {variant === "tabbar" && <TabBar items={navItems} />}
    </>
  );
}

function TopNavLink({ to, label, icon }: { to: string; label: string; icon?: React.ReactNode }) {
  return (
    <RRNavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
          isActive
            ? "bg-white/10 text-foreground"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        }`
      }
    >
      {icon}
      {label}
    </RRNavLink>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "orange" | "blue";
}) {
  return (
    <div className="glass rounded-xl px-3 py-1.5 text-right">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`font-mono text-xs font-semibold ${
          accent === "orange" ? "neon-orange" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* --------- Mobile variant: Floating dock (bottom center, glass) --------- */
function FloatingDock({ items }: { items: NavItem[] }) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="glass pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-background/50 px-2 py-2 shadow-2xl shadow-sky-500/10 backdrop-blur-2xl">
        {items.map((i) => (
          <RRNavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            className={({ isActive }) =>
              `grid h-10 w-10 place-items-center rounded-full transition ${
                isActive
                  ? "bg-gradient-to-br from-sky-400/90 to-orange-500/80 text-slate-900 shadow-lg shadow-sky-500/40"
                  : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`
            }
            title={i.label}
          >
            {i.icon}
          </RRNavLink>
        ))}
      </div>
    </nav>
  );
}

/* --------- Mobile variant: Bottom tab bar (labels always visible) --------- */
function TabBar({ items }: { items: NavItem[] }) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-flow-col auto-cols-fr">
        {items.map((i) => (
          <RRNavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] transition ${
                isActive
                  ? "neon-blue"
                  : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            {i.icon}
            <span className="truncate">{i.label}</span>
          </RRNavLink>
        ))}
      </div>
    </nav>
  );
}

/* --------- Mobile variant: Hamburger sheet (top) --------- */
function HamburgerButton({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-foreground transition hover:bg-white/10 md:hidden"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-3 top-16 z-50 md:hidden">
            <div className="glass rounded-2xl border border-white/10 bg-background/90 p-2 shadow-2xl">
              {items.map((i) => (
                <RRNavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                      isActive
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    }`
                  }
                >
                  {i.icon}
                  <span>{i.label}</span>
                </RRNavLink>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
