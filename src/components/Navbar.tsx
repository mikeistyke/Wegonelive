import { Link } from "react-router-dom";
import { Video, ShoppingBag, User, ArrowLeft, BarChart3, ShieldAlert, CalendarDays } from "lucide-react";

export function Navbar() {
  return (
    <div className="w-full">
      {/* Top Banner */}
      <div className="bg-[#0a0a0a] border-b border-white/5 py-3 px-4 flex justify-center items-center">
        <a 
          href="https://wegonelive.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-[#3b82f6] hover:text-blue-400 transition-colors font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          wegonelive.com
        </a>
      </div>
      <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/50 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tighter text-white">
            <Video className="h-6 w-6 text-emerald-400" />
            <span>wegonelive</span>
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium text-white/80">
            <Link to="/" className="hover:text-emerald-400 transition-colors">Home</Link>
            <Link to="/grtw" className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
              <ShoppingBag className="h-4 w-4" />
              Live Shopping
            </Link>
            <Link to="/shop-date" className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
              <CalendarDays className="h-4 w-4" />
              Shop Date
            </Link>
            <Link to="/reports" className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
              <BarChart3 className="h-4 w-4" />
              Ad Reports
            </Link>
            <Link to="/ebay-price-guard" className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
              <ShieldAlert className="h-4 w-4" />
              eBay Guard
            </Link>
            <Link to="/about" className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
              <User className="h-4 w-4" />
              About Tyke
            </Link>
          </div>
        </div>
      </nav>
    </div>
  );
}
