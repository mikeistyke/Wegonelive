import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { BarChart3, TrendingUp, Clock, DollarSign, MousePointerClick, Eye, ArrowUpRight, ArrowDownRight, Calendar } from "lucide-react";

type TimeRange = "24h" | "7d" | "30d" | "All";

type AdSummary = {
  total_revenue: number;
  revenue_growth: number;
  total_impressions: number;
  impressions_growth: number;
  total_clicks: number;
  clicks_growth: number;
  avg_time_on_ad_ms: number;
  avg_time_growth: number;
};

type AdCampaign = {
  ad_id: string;
  campaign_name: string;
  sponsor: string;
  impressions: number;
  clicks: number;
  ctr_percentage: number;
  revenue: number;
};

const defaultSummary: AdSummary = {
  total_revenue: 0,
  revenue_growth: 0,
  total_impressions: 0,
  impressions_growth: 0,
  total_clicks: 0,
  clicks_growth: 0,
  avg_time_on_ad_ms: 0,
  avg_time_growth: 0,
};

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0s";
  }

  return `${Math.round(ms / 1000)}s`;
}

export default function AdReports() {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [summary, setSummary] = useState<AdSummary>(defaultSummary);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const range = encodeURIComponent(timeRange);
        const [summaryRes, campaignsRes] = await Promise.all([
          fetch(`/api/analytics/ad/summary?range=${range}`),
          fetch(`/api/analytics/ad/campaigns?range=${range}`),
        ]);

        if (!summaryRes.ok || !campaignsRes.ok) {
          throw new Error("Failed to load ad analytics data");
        }

        const summaryData = await summaryRes.json() as Partial<AdSummary>;
        const campaignsData = await campaignsRes.json() as AdCampaign[];

        if (cancelled) {
          return;
        }

        setSummary({
          total_revenue: Number(summaryData.total_revenue ?? 0),
          revenue_growth: Number(summaryData.revenue_growth ?? 0),
          total_impressions: Number(summaryData.total_impressions ?? 0),
          impressions_growth: Number(summaryData.impressions_growth ?? 0),
          total_clicks: Number(summaryData.total_clicks ?? 0),
          clicks_growth: Number(summaryData.clicks_growth ?? 0),
          avg_time_on_ad_ms: Number(summaryData.avg_time_on_ad_ms ?? 0),
          avg_time_growth: Number(summaryData.avg_time_growth ?? 0),
        });
        setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load ad analytics";
          setError(message);
          setSummary(defaultSummary);
          setCampaigns([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans pb-12">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-emerald-500" />
              Magical Billboard Analytics
            </h1>
            <p className="text-sm text-zinc-500 mt-1">Track your live shopping ad performance and revenue.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-zinc-100 rounded-lg p-1 border border-zinc-200">
              {["24h", "7d", "30d", "All"].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range as TimeRange)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    timeRange === range
                      ? "bg-white text-zinc-900 shadow-sm border border-zinc-200/50"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
              <Calendar className="h-4 w-4" />
              Custom Date
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 mt-8">
        {error ? (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        {/* Top Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard 
            title="Total Ad Revenue" 
            value={`$${summary.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            growth={summary.revenue_growth}
            icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
            color="emerald"
          />
          <StatCard 
            title="Total Impressions" 
            value={summary.total_impressions.toLocaleString()}
            growth={summary.impressions_growth}
            icon={<Eye className="h-5 w-5 text-blue-600" />}
            color="blue"
          />
          <StatCard 
            title="Total Clicks" 
            value={summary.total_clicks.toLocaleString()}
            growth={summary.clicks_growth}
            icon={<MousePointerClick className="h-5 w-5 text-violet-600" />}
            color="violet"
          />
          <StatCard 
            title="Avg. Time on Ad" 
            value={formatDuration(summary.avg_time_on_ad_ms)}
            growth={summary.avg_time_growth}
            icon={<Clock className="h-5 w-5 text-amber-600" />}
            color="amber"
          />
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Campaigns Table */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
              <h2 className="text-lg font-bold text-zinc-900">Active Campaigns</h2>
              <button className="text-sm font-medium text-emerald-600 hover:text-emerald-700">View All</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                    <th className="p-4 pl-6">Campaign</th>
                    <th className="p-4">Sponsor</th>
                    <th className="p-4 text-right">Impressions</th>
                    <th className="p-4 text-right">Clicks (CTR)</th>
                    <th className="p-4 text-right pr-6">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.ad_id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-medium text-zinc-900">{campaign.campaign_name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                          <span className={`inline-block w-2 h-2 rounded-full ${campaign.impressions > 0 ? 'bg-emerald-500' : 'bg-zinc-400'}`}></span>
                          {campaign.impressions > 0 ? 'Active' : 'Idle'}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-zinc-600">{campaign.sponsor}</td>
                      <td className="p-4 text-right text-sm font-medium text-zinc-700">{campaign.impressions.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <div className="text-sm font-medium text-zinc-700">{campaign.clicks.toLocaleString()}</div>
                        <div className="text-xs text-zinc-500">{campaign.ctr_percentage.toFixed(1)}%</div>
                      </td>
                      <td className="p-4 text-right pr-6 font-medium text-emerald-600">
                        ${campaign.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {!loading && campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-sm text-zinc-500">
                        No tracked ad events yet. Open `/live` and interact with ads to generate analytics.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Insights & Quick Actions */}
          <div className="space-y-8">
            {/* AI Insights Card */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-emerald-100 p-2 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="font-bold text-emerald-900">AI Performance Insights</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex gap-3 text-sm text-emerald-800">
                  <span className="mt-0.5 text-emerald-500">•</span>
                  <span><strong>Luxury Watches</strong> are performing 24% better than average during evening streams. Consider scheduling more watch ads after 6 PM.</span>
                </li>
                <li className="flex gap-3 text-sm text-emerald-800">
                  <span className="mt-0.5 text-emerald-500">•</span>
                  <span>Your audience engages most with ads that have a <strong>"Shop Now"</strong> CTA compared to "Learn More".</span>
                </li>
                <li className="flex gap-3 text-sm text-emerald-800">
                  <span className="mt-0.5 text-emerald-500">•</span>
                  <span>Ad revenue peaked yesterday during the <strong>Vintage Leather Jacket</strong> auction. High synergy between product and ad category detected.</span>
                </li>
              </ul>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
              <h3 className="font-bold text-zinc-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button className="w-full flex items-center justify-between p-3 rounded-xl border border-zinc-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group">
                  <span className="font-medium text-zinc-700 group-hover:text-emerald-700">Export CSV Report</span>
                  <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-emerald-500" />
                </button>
                <button className="w-full flex items-center justify-between p-3 rounded-xl border border-zinc-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group">
                  <span className="font-medium text-zinc-700 group-hover:text-emerald-700">Manage Sponsors</span>
                  <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-emerald-500" />
                </button>
                <button className="w-full flex items-center justify-between p-3 rounded-xl border border-zinc-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group">
                  <span className="font-medium text-zinc-700 group-hover:text-emerald-700">Ad Settings</span>
                  <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-emerald-500" />
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Helper component for stat cards
function StatCard({ title, value, growth, icon, color }: { title: string, value: string | number, growth: number, icon: React.ReactNode, color: 'emerald' | 'blue' | 'violet' | 'amber' }) {
  const isPositive = growth > 0;
  
  const colorStyles = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-zinc-500">{title}</h3>
        <div className={`p-2 rounded-lg border ${colorStyles[color]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-auto">
        <div className="text-3xl font-bold text-zinc-900 mb-2">{value}</div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className={`flex items-center font-medium ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isPositive ? <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> : <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />}
            {Math.abs(growth)}%
          </span>
          <span className="text-zinc-400">vs last period</span>
        </div>
      </div>
    </motion.div>
  );
}
