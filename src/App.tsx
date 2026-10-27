import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { setMonitoringUser } from "./lib/monitoring";
import { useQuery } from "@tanstack/react-query";
import { call, rpc } from "./lib/rpc";
import { homeFor, useMe } from "./lib/auth";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/kit";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Invite from "./pages/Invite";
import TwoFactorSetup from "./pages/TwoFactor";
import Apply from "./pages/Apply";
import Requests from "./pages/Requests";
import RequestForm from "./pages/RequestForm";
import RequestDetail from "./pages/RequestDetail";
import Roles from "./pages/Roles";
import RoleDetail from "./pages/RoleDetail";
import Outreach from "./pages/Outreach";
import LinkedinQueue from "./pages/LinkedinQueue";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Notifications from "./pages/Notifications";
import Outbox from "./pages/Outbox";

function Loading() {
  return <div className="grid h-full place-items-center text-muted-foreground"><Spinner /></div>;
}

export default function App() {
  const location = useLocation();
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => call(rpc.setup.$get()) });
  const me = useMe();
  const userId = me.data?.user?.id ?? null;
  useEffect(() => setMonitoringUser(userId), [userId]);

  if (location.pathname.startsWith("/apply/")) return <Routes><Route path="/apply/:token" element={<Apply />} /></Routes>;
  if (location.pathname.startsWith("/invite/")) return <Routes><Route path="/invite/:token" element={<Invite />} /></Routes>;
  if (setup.isLoading || me.isLoading) return <Loading />;
  if (setup.data?.needsSetup) return <Setup />;
  const user = me.data?.user;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />} />
      </Routes>
    );
  }
  if (user.twoFactorSetupRequired) return <TwoFactorSetup />;
  return (
    <Routes>
      <Route path="/login" element={<Navigate to={homeFor(user)} replace />} />
      <Route element={<AppShell me={user} />}>
        <Route path="/" element={<Navigate to={homeFor(user)} replace />} />
        <Route path="/approvals" element={<Requests scope="approvals" />} />
        <Route path="/requests" element={<Requests scope="all" />} />
        <Route path="/requests/new" element={<RequestForm />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/requests/:id/edit" element={<RequestForm />} />
        <Route path="/roles" element={<Roles />} />
        <Route path="/roles/:id" element={<RoleDetail />} />
        <Route path="/outreach" element={<Outreach />} />
        <Route path="/linkedin" element={<LinkedinQueue />} />
        <Route path="/outbox" element={<Outbox />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin/users" element={<Users />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to={homeFor(user)} replace />} />
      </Route>
    </Routes>
  );
}
