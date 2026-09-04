import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import ClientDetail from "@/pages/client-detail";
import Reports from "@/pages/reports";
import Growth from "@/pages/growth";
import ClassAnalytics from "@/pages/class-analytics";
import Leads from "@/pages/leads";
import Ads from "@/pages/ads";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/clients/:id" component={ClientDetail} />
      <Route path="/reports" component={Reports} />
      <Route path="/growth" component={Growth} />
      <Route path="/class-analytics" component={ClassAnalytics} />
      <Route path="/leads" component={Leads} />
      <Route path="/ads" component={Ads} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="dark min-h-screen bg-background text-foreground font-sans">
            <Router />
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
