import { motion } from "motion/react";
import { Mail, Phone, MapPin, ExternalLink, Code2, PenTool, Lightbulb } from "lucide-react";

export default function About() {
  return (
    <div className="container mx-auto px-4 py-24 lg:py-32">
      <div className="grid gap-16 lg:grid-cols-12">
        
        {/* Left Column: Bio & Story */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-7"
        >
          <div className="mb-8 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-400">
            Content Developer & Entrepreneur
          </div>
          <h1 className="mb-6 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            Mike "Tyke" Cirigliano
          </h1>

          <div className="prose prose-invert prose-lg max-w-none text-zinc-300">
            <p className="lead text-xl text-white">
              I am a storyteller, a strategist, and an enabler. 
            </p>
            <p>
              My journey into React, Vite, and Tailwind wasn't born out of a desire to write code—it was born out of <strong>Tenacity</strong> and <strong>Invention</strong>. I realized that to truly push the boundaries of Live Shopping and create digital experiences that genuinely excite people, I needed to understand the canvas. I needed to build it myself.
            </p>
            <p>
              Having built five real-world React applications, I've proven that grit and a relentless drive to learn (my "Input" strength) can bridge the gap between creative vision and technical execution. 
            </p>
            <p>
              My working genius lies in the intersection of <strong>Wonder</strong> and <strong>Enablement</strong>. I don't just show up to write tickets; I help clients figure out what is possible—pondering the potential of their brand—and then I provide the strategic help and technical foundation to make it happen. 
            </p>
            <p>
              I look at the history and background of a problem (my "Context" strength) to build a better future. Whether you are a business owner looking for a proof of concept or a creator wanting to launch a live shopping channel, I am here to help you succeed.
            </p>
          </div>
        </motion.div>

        {/* Right Column: Contact & Quick Info */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-5"
        >
          <div className="sticky top-32 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 backdrop-blur-sm">
            <h3 className="mb-6 text-2xl font-bold text-white">Get in Touch</h3>
            
            <div className="space-y-6">
              <a href="mailto:tykecirigliano@gmail.com" className="group flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-emerald-500/50 hover:bg-zinc-800">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-zinc-950 transition-colors">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">Email</p>
                  <p className="text-lg font-medium text-white">tykecirigliano@gmail.com</p>
                </div>
              </a>

              <a href="tel:5402088283" className="group flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-emerald-500/50 hover:bg-zinc-800">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-zinc-950 transition-colors">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-500">Phone</p>
                  <p className="text-lg font-medium text-white">540 208 8283</p>
                </div>
              </a>
            </div>

            <hr className="my-8 border-zinc-800" />

            <h3 className="mb-6 text-xl font-bold text-white">Core Competencies</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Lightbulb className="mt-1 h-5 w-5 text-emerald-400" />
                <div>
                  <h4 className="font-medium text-white">Strategic Planning</h4>
                  <p className="text-sm text-zinc-400">Contextual analysis and roadmap development.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Code2 className="mt-1 h-5 w-5 text-cyan-400" />
                <div>
                  <h4 className="font-medium text-white">Technical Enablement</h4>
                  <p className="text-sm text-zinc-400">React, Vite, Tailwind, and full-stack integration.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <PenTool className="mt-1 h-5 w-5 text-purple-400" />
                <div>
                  <h4 className="font-medium text-white">Digital Storytelling</h4>
                  <p className="text-sm text-zinc-400">Narrative-driven UX and community building.</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
