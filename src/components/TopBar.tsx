import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "@tanstack/react-router";
import { Pickaxe, Trophy, ShieldCheck, ShoppingBag, Gauge } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { useIsAdmin, usePendingRewards, usePoolInfo } from "@/lib/onchain";
import { fmtBig } from "@/lib/bigformat";

export function TopBar() {
  const { address } = useAccount();
  const { data: bal } = useBalance({ address, query: { refetchInterval: 5000 } });
  const { pending } = usePendingRewards();
  const { rewardPool, treasury } = usePoolInfo();
  const { isAdmin } = useIsAdmin();

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-orange-500 shadow-lg shadow-sky-500/30">
            <Pickaxe className="h-5 w-5 text-slate-900" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wide">LiteMiner</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              LiteForge · 4441 · on-chain
            </div>
          </div>
        </Link>

        <nav className="ml-4 hidden gap-1 md:flex">
          <NavLink to="/" label="Home" />
          <NavLink to="/shop" label="Shop" icon={<ShoppingBag className="h-3.5 w-3.5" />} />
          <NavLink to="/dashboard" label="Dashboard" icon={<Gauge className="h-3.5 w-3.5" />} />
          <NavLink to="/leaderboard" label="Leaderboard" icon={<Trophy className="h-3.5 w-3.5" />} />
          {isAdmin && (
            <NavLink to="/admin" label="Admin" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
          )}
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
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, label, icon }: { to: string; label: string; icon?: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      activeProps={{ className: "bg-white/10 text-foreground" }}
    >
      {icon}
      {label}
    </Link>
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
