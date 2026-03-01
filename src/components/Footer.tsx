import { Link } from "react-router-dom";
import { Video } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black py-12 text-white/60">
      <div className="container mx-auto px-4 grid gap-8 md:grid-cols-3">
        <div>
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tighter text-white mb-4">
            <Video className="h-6 w-6 text-emerald-400" />
            <span>wegonelive</span>
          </Link>
          <p className="text-sm">
            Bridging the gap between traditional retail and digital storytelling.
            Live shopping experiences that unlock your brand's potential.
          </p>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-4">Services</h3>
          <ul className="space-y-2 text-sm">
            <li>Unlocking Potential</li>
            <li>Strategic Web Presence</li>
            <li>Digital Storytelling & Partnerships</li>
          </ul>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-4">Contact</h3>
          <ul className="space-y-2 text-sm">
            <li>Mike "Tyke" Cirigliano</li>
            <li>Content Developer</li>
            <li><a href="mailto:tykecirigliano@gmail.com" className="hover:text-emerald-400 transition-colors">tykecirigliano@gmail.com</a></li>
            <li><a href="tel:5402088283" className="hover:text-emerald-400 transition-colors">540 208 8283</a></li>
          </ul>
        </div>
      </div>
      <div className="container mx-auto px-4 mt-12 pt-8 border-t border-white/10 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} wegonelive. All rights reserved.</p>
      </div>
    </footer>
  );
}
