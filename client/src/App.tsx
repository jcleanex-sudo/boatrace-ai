import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import PredictPage from "./pages/PredictPage";
import DataPage from "./pages/DataPage";
import HistoryPage from "./pages/HistoryPage";
import DashboardLayout from "./components/DashboardLayout";
import BankrollPage from "./pages/BankrollPage";
import BatchPredictPage from "./pages/BatchPredictPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import SkipHistoryPage from "./pages/SkipHistoryPage";
import OddsMonitorPage from "@/pages/OddsMonitorPage";
import RecommendedRacesPage from "@/pages/RecommendedRacesPage";
import Gacha from "@/pages/Gacha";

type PublicStatus = "checking" | "enabled" | "disabled";

function MaintenanceScreen() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0b1220",
        color: "#f8fafc",
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>現在メンテナンス中です</h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.8, marginTop: 16 }}>
          BETAKO is temporarily unavailable
        </p>
      </section>
    </main>
  );
}

function PublicStatusGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PublicStatus>("checking");

  useEffect(() => {
    let active = true;

    const checkStatus = async () => {
      try {
        const response = await fetch("/api/public-status", { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        setStatus(data?.publicEnabled === false ? "disabled" : "enabled");
      } catch {
        if (active) setStatus("enabled");
      }
    };

    void checkStatus();
    const intervalId = window.setInterval(checkStatus, 30_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  if (status === "disabled") {
    return <MaintenanceScreen />;
  }

  if (status === "checking") {
    return null;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={PredictPage} />
        <Route path="/predict" component={PredictPage} />
        <Route path="/data" component={DataPage} />
        <Route path="/history" component={HistoryPage} />
        <Route path="/bankroll" component={BankrollPage} />
        <Route path="/batch" component={BatchPredictPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/skip-history" component={SkipHistoryPage} />
        <Route path="/odds-monitor" component={OddsMonitorPage} />
        <Route path="/recommended" component={RecommendedRacesPage} />
        <Route path="/gacha" component={Gacha} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <PublicStatusGate>
            <Router />
          </PublicStatusGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
