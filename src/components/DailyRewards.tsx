import { useState } from "react";
import { Gift, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fmtZk } from "@/lib/format";
import { SPIN_SLOTS } from "@/lib/miners";
import type { PlayerState } from "@/lib/mining-state";

interface Props {
  player: PlayerState | null;
  openChest: () => number;
  spin: () => { label: string; amount: number };
}

const todayUTC = () => new Date().toISOString().slice(0, 10);

export function DailyRewards({ player, openChest, spin }: Props) {
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const chestUsed = player?.chestDate === todayUTC();
  const spinUsed = player?.spinDate === todayUTC();

  const handleSpin = () => {
    if (spinning || spinUsed) return;
    setSpinning(true);
    try {
      const result = spin();
      const idx = SPIN_SLOTS.findIndex((s) => s.label === result.label);
      const perSlot = 360 / SPIN_SLOTS.length;
      const target = 360 * 5 + (360 - idx * perSlot) - perSlot / 2;
      setAngle((a) => a + target);
      setTimeout(() => {
        setSpinning(false);
        toast.success(`+${fmtZk(result.amount, 4)} zkLTC`, { description: `You spun ${result.label}` });
      }, 2400);
    } catch (e) {
      setSpinning(false);
      toast.error((e as Error).message);
    }
  };

  const handleChest = () => {
    try {
      const amt = openChest();
      toast.success(`Chest opened`, { description: `+${fmtZk(amt, 5)} zkLTC` });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 neon-blue" />
        <div className="font-display text-sm font-semibold">Daily Rewards</div>
      </div>

      <div className="grid grid-cols-[140px_1fr] items-center gap-4">
        {/* Wheel */}
        <div className="relative mx-auto aspect-square w-32">
          <div
            className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[8px] border-b-[12px] border-x-transparent border-b-orange-500"
            aria-hidden
          />
          <div
            className="h-full w-full rounded-full border-2 border-white/20"
            style={{
              transition: spinning ? "transform 2.4s cubic-bezier(.15,.7,.15,1)" : "none",
              transform: `rotate(${angle}deg)`,
              background: `conic-gradient(${SPIN_SLOTS.map((s, i) => {
                const colors = ["#38bdf8", "#22d3ee", "#a78bfa", "#f472b6", "#f97316", "#f59e0b"];
                const from = (i / SPIN_SLOTS.length) * 360;
                const to = ((i + 1) / SPIN_SLOTS.length) * 360;
                return `${colors[i % colors.length]} ${from}deg ${to}deg`;
              }).join(",")})`,
            }}
          />
          <div className="absolute inset-4 grid place-items-center rounded-full bg-background/80 backdrop-blur">
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Spin</div>
              <div className="font-mono text-xs neon-blue">1/day</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSpin}
            disabled={spinUsed || spinning}
            className="btn-neon w-full rounded-xl px-3 py-2 text-xs"
          >
            {spinUsed ? "Spun today · come back tomorrow" : spinning ? "Spinning…" : "Spin the wheel"}
          </button>
          <button
            onClick={handleChest}
            disabled={chestUsed}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-40"
          >
            <Gift className="h-3.5 w-3.5 neon-orange" />
            {chestUsed ? "Chest opened today" : "Open daily chest"}
          </button>
          <div className="text-[10px] text-muted-foreground">
            Chest: {fmtZk(0.005, 3)}–{fmtZk(0.05, 3)} zkLTC · Spin: up to 0.1 zkLTC
          </div>
        </div>
      </div>
    </div>
  );
}
