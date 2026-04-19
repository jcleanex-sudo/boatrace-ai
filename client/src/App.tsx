import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
