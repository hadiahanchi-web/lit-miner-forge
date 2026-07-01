import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Ticker } from "pixi.js";
import { MINERS } from "@/lib/miners";

interface Props {
  minerCounts: number[];
  running: boolean;
}

// Lightweight PixiJS mining facility: conveyor belt, rigs w/ fans, particles, LEDs.
export function MiningScene({ minerCounts, running }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const stateRef = useRef({ minerCounts, running });

  useEffect(() => {
    stateRef.current = { minerCounts, running };
  }, [minerCounts, running]);

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current!;
    const app = new Application();
    (async () => {
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);
      appRef.current = app;
      build(app);
    })();
    return () => {
      disposed = true;
      const a = appRef.current;
      if (a) {
        a.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  function build(app: Application) {
    const world = new Container();
    app.stage.addChild(world);

    // Background grid
    const grid = new Graphics();
    world.addChild(grid);

    // Conveyor belt
    const belt = new Graphics();
    world.addChild(belt);
    let beltOffset = 0;

    // Rigs container
    const rigs = new Container();
    world.addChild(rigs);

    // Particles
    const particles: {
      g: Graphics;
      vx: number;
      vy: number;
      life: number;
      max: number;
      color: number;
    }[] = [];
    const fx = new Container();
    world.addChild(fx);

    function drawBackground(w: number, h: number) {
      grid.clear();
      grid.rect(0, 0, w, h).fill({ color: 0x0b1120, alpha: 0.0 });
      const step = 40;
      for (let x = 0; x < w; x += step) {
        grid.moveTo(x, 0).lineTo(x, h).stroke({ color: 0x1e293b, width: 1, alpha: 0.35 });
      }
      for (let y = 0; y < h; y += step) {
        grid.moveTo(0, y).lineTo(w, y).stroke({ color: 0x1e293b, width: 1, alpha: 0.35 });
      }
    }

    function drawBelt(w: number, h: number) {
      const y = h - 60;
      belt.clear();
      belt
        .roundRect(20, y, w - 40, 32, 8)
        .fill({ color: 0x0f172a })
        .stroke({ color: 0x334155, width: 2 });
      // moving stripes
      const stripeW = 24;
      for (let x = 20 - stripeW; x < w - 20; x += stripeW * 2) {
        belt
          .rect(x + (beltOffset % (stripeW * 2)), y + 8, stripeW, 16)
          .fill({ color: 0x1e293b });
      }
    }

    const rigNodes: {
      c: Container;
      fan: Graphics;
      led: Graphics;
      color: number;
      accent: number;
      x: number;
      y: number;
    }[] = [];

    function rebuildRigs() {
      rigs.removeChildren();
      rigNodes.length = 0;
      const counts = stateRef.current.minerCounts;
      const w = app.renderer.width;
      const h = app.renderer.height;
      // total rigs, capped visually
      const total = counts.reduce((a, b) => a + Math.min(b, 8), 0);
      const displayList: number[] = [];
      counts.forEach((n, idx) => {
        const shown = Math.min(n, 8);
        for (let i = 0; i < shown; i++) displayList.push(idx);
      });
      if (displayList.length === 0) return;

      const beltY = h - 60;
      const spacing = Math.min(140, (w - 80) / displayList.length);
      const startX = (w - spacing * displayList.length) / 2 + spacing / 2;

      displayList.forEach((minerIdx, i) => {
        const m = MINERS[minerIdx];
        const color = parseInt(m.color.replace("#", ""), 16);
        const accent = parseInt(m.accent.replace("#", ""), 16);
        const x = startX + i * spacing;
        const y = beltY - 8;
        const c = new Container();
        c.x = x;
        c.y = y;

        // body
        const body = new Graphics();
        body
          .roundRect(-32, -70, 64, 70, 8)
          .fill({ color: 0x1e293b })
          .stroke({ color: accent, width: 2, alpha: 0.9 });
        // vent lines
        for (let v = 0; v < 3; v++) {
          body
            .rect(-24, -60 + v * 8, 48, 3)
            .fill({ color: 0x0f172a });
        }
        c.addChild(body);

        // fan
        const fan = new Graphics();
        for (let b = 0; b < 4; b++) {
          const ang = (b * Math.PI) / 2;
          fan
            .moveTo(0, 0)
            .lineTo(Math.cos(ang) * 12, Math.sin(ang) * 12)
            .lineTo(Math.cos(ang + 0.6) * 4, Math.sin(ang + 0.6) * 4)
            .fill({ color });
        }
        fan.circle(0, 0, 3).fill({ color: 0x0b1120 });
        fan.x = 0;
        fan.y = -35;
        c.addChild(fan);

        // LED
        const led = new Graphics();
        led.circle(22, -62, 3).fill({ color });
        c.addChild(led);

        rigs.addChild(c);
        rigNodes.push({ c, fan, led, color, accent, x, y });
      });

      // count total for external HUD (via CustomEvent optional)
      total;
    }

    function spawnParticle(x: number, y: number, color: number) {
      const g = new Graphics();
      g.circle(0, 0, 2).fill({ color });
      g.x = x;
      g.y = y;
      fx.addChild(g);
      particles.push({
        g,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -1 - Math.random() * 1.5,
        life: 0,
        max: 40 + Math.random() * 30,
        color,
      });
    }

    function onResize() {
      const w = app.renderer.width;
      const h = app.renderer.height;
      drawBackground(w, h);
      drawBelt(w, h);
      rebuildRigs();
    }

    onResize();
    app.renderer.on("resize", onResize);
    // rebuild rigs whenever miner counts change (poll)
    let lastKey = stateRef.current.minerCounts.join(",");
    const rebuildTicker = new Ticker();
    rebuildTicker.add(() => {
      const key = stateRef.current.minerCounts.join(",");
      if (key !== lastKey) {
        lastKey = key;
        rebuildRigs();
      }
    });
    rebuildTicker.start();

    let ledTimer = 0;
    app.ticker.add((ticker) => {
      const dt = ticker.deltaTime;
      const { running } = stateRef.current;
      if (running) beltOffset += dt * 2;
      drawBelt(app.renderer.width, app.renderer.height);

      // fans
      rigNodes.forEach((n, i) => {
        if (running) n.fan.rotation += 0.15 * dt * (1 + (i % 3) * 0.15);
        if (running && Math.random() < 0.08) {
          spawnParticle(n.x + (Math.random() - 0.5) * 20, n.y - 40, n.color);
        }
      });

      // LED blink
      ledTimer += dt;
      if (ledTimer > 20) {
        ledTimer = 0;
        rigNodes.forEach((n) => {
          n.led.alpha = 0.4 + Math.random() * 0.6;
        });
      }

      // particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        p.g.x += p.vx * dt;
        p.g.y += p.vy * dt;
        p.g.alpha = 1 - p.life / p.max;
        if (p.life >= p.max) {
          fx.removeChild(p.g);
          p.g.destroy();
          particles.splice(i, 1);
        }
      }
    });
  }

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden rounded-2xl"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.15), transparent 60%), radial-gradient(ellipse at 50% 100%, rgba(249,115,22,0.12), transparent 60%), #050914",
      }}
    />
  );
}
