/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";
import { AdminRoute, LiveShoppingAccessRoute, PrivateMetricsRoute, ProtectedRoute } from "./components/RouteGuards";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import Home from "./pages/Home";
import LiveShopping from "./pages/LiveShopping";
import GetReadyToWin from "./pages/GetReadyToWin";
import ShopDate from "./pages/ShopDate";
import ShopDateInput from "./pages/ShopDateInput";
import About from "./pages/About";
import AdReports from "./pages/AdReports";
import EbayPriceGuard from "./pages/EbayPriceGuard";
import LotDecoderMetrics from "./pages/LotDecoderMetrics";

export default function App() {
  return (
    <Router>
      <div className="flex min-h-screen flex-col bg-zinc-950 text-slate-50 font-sans selection:bg-emerald-500/30">
        <Navbar />
        <div className="mx-auto flex w-full max-w-7xl justify-end px-4 py-3 sm:px-6 lg:px-8">
          <SignedOut>
            <div className="flex items-center gap-3">
              <SignInButton />
              <SignUpButton />
            </div>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/grtw" element={<GetReadyToWin />} />
            <Route path="/shop-date" element={<ShopDate />} />
            <Route
              path="/live"
              element={
                <ProtectedRoute>
                  <LiveShoppingAccessRoute>
                    <LiveShopping />
                  </LiveShoppingAccessRoute>
                </ProtectedRoute>
              }
            />
            <Route path="/about" element={<About />} />
            <Route
              path="/ebay-price-guard"
              element={
                <ProtectedRoute>
                  <EbayPriceGuard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <AdReports />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insights/live-ledger"
              element={
                <ProtectedRoute>
                  <PrivateMetricsRoute>
                    <LotDecoderMetrics />
                  </PrivateMetricsRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insights/shop-date-input"
              element={
                <ProtectedRoute>
                  <PrivateMetricsRoute>
                    <ShopDateInput />
                  </PrivateMetricsRoute>
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}
