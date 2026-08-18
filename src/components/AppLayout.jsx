import React, { useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  GraduationCap,
  CalendarRange,
  UserCircle,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Github,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/progress", label: "Degree Progress", icon: GraduationCap },
  { to: "/planner", label: "Planner", icon: CalendarRange },
  { to: "/profile", label: "Profile", icon: UserCircle },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = (user?.full_name || user?.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = () => logout(true);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight">Degree Compass</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
        {user?.role === "admin" && (
          <NavLink
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`
            }
          >
            <ShieldCheck className="w-4 h-4" />
            Review discoveries
          </NavLink>
        )}
        {user?.role === "admin" && (
          <NavLink
            to="/github-issues"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`
            }
          >
            <Github className="w-4 h-4" />
            CIP import issues
          </NavLink>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent/50 transition-colors">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-sidebar-accent text-sm font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 text-left">
                <p className="text-sm font-medium truncate text-sidebar-foreground">
                  {user?.full_name || "Student"}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <UserCircle className="w-4 h-4 mr-2" />
              Profile & documents
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border">
        {SidebarContent}
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between h-16 px-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">Degree Compass</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-accent"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[80%] bg-sidebar border-r border-sidebar-border">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 p-1.5 rounded-lg hover:bg-sidebar-accent z-10"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
            {SidebarContent}
          </div>
        </div>
      )}

      <main className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}