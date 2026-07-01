import { Route, Routes } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import Index from "@/routes/index";
import Dashboard from "@/routes/dashboard";
import Shop from "@/routes/shop";
import Leaderboard from "@/routes/leaderboard";
import Admin from "@/routes/admin";

function NotFound() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <h1 className="font-display text-6xl font-bold neon-blue">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This shaft leads nowhere.</p>
        <a href="/" className="btn-neon mt-6 inline-flex rounded-xl px-4 py-2 text-sm">
          Back to mine
        </a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
