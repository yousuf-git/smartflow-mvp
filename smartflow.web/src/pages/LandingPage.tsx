import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useScroll, useSpring } from "framer-motion";
import { 
  Maximize2, 
  ArrowRight, 
  Droplets, 
  ShieldCheck, 
  Zap,
  Globe,
  Database,
  ChevronDown,
  ExternalLink,
  Atom,
  Server,
  CloudCog
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const SECTIONS = [
  "hero",
  "intro",
  "solution",
  "crisis",
  "hardware",
  "loop",
  "architecture",
  "cta"
];

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  // Loading animation
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Fullscreen & Key Navigation
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const navigateToSection = useCallback((index: number) => {
    if (index < 0 || index >= SECTIONS.length) return;
    setActiveSection(index);
    const id = SECTIONS[index];
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateToSection(activeSection + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateToSection(activeSection - 1);
      } else if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    const handleFsChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFsChange);
    
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.body.style.overflow = "auto";
    };
  }, [isFullscreen, activeSection, navigateToSection]);

  const handleLaunch = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    navigate("/login");
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div ref={containerRef} className={`relative bg-white text-slate-900 font-sans selection:bg-pure-aqua/20 ${isFullscreen ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      
      {/* Global Water Surface Overlay */}
      <div className="fixed inset-0 pointer-events-none z-10 opacity-[0.03] mix-blend-multiply pointer-events-none">
        <svg className="w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <filter id="water-fx">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3">
              <animate attributeName="baseFrequency" dur="30s" values="0.01;0.02;0.01" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="30" />
          </filter>
          <rect width="100%" height="100%" filter="url(#water-fx)" fill="#00A3FF" />
        </svg>
      </div>

      {/* Nav - Hidden in Fullscreen */}
      <AnimatePresence>
        {!isFullscreen && (
          <motion.nav 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 left-0 w-full p-6 flex justify-between items-center z-[100] backdrop-blur-xl border-b border-slate-100 bg-white/70"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pure-aqua rounded-xl flex items-center justify-center shadow-lg shadow-pure-aqua/20">
                <Droplets className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-black tracking-tighter text-slate-900 uppercase">SmartFlow</span>
            </div>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleFullscreen}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-white transition-all hover:shadow-md"
              >
                <Maximize2 className="w-5 h-5 text-slate-600" />
              </button>
              <button 
                onClick={handleLaunch}
                className="px-6 py-2.5 bg-pure-aqua text-white rounded-xl font-bold hover:shadow-lg hover:shadow-pure-aqua/30 transition-all flex items-center gap-2"
              >
                Launch Platform <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Progress Bar */}
      {!isFullscreen && (
        <motion.div 
          className="fixed top-0 left-0 right-0 h-1.5 bg-pure-aqua z-[110] origin-left"
          style={{ scaleX: smoothProgress }}
        />
      )}

      {/* SECTION 1: HERO */}
      <section id="hero" className="relative h-screen flex items-center justify-center overflow-hidden px-6 shrink-0 bg-gradient-to-b from-white to-aqua-50/20">
        <div className="relative z-20 text-center max-w-5xl">
          <motion.h1 
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.1 } }
            }}
            className="text-7xl md:text-[9rem] font-black tracking-tighter leading-[0.8] mb-12 text-slate-900 uppercase"
          >
            {"EVERY DROP.".split(" ").map((word, i) => (
              <motion.span
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 100, rotateX: 90 },
                  visible: { opacity: 1, y: 0, rotateX: 0, transition: { type: "spring", stiffness: 50, damping: 10 } }
                }}
                className="inline-block mr-4 last:mr-0"
              >
                {word}
              </motion.span>
            ))}
            <br />
            <motion.span
              variants={{
                hidden: { opacity: 0, scale: 0.5 },
                visible: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 40, damping: 12 } }
              }}
              className="text-pure-aqua italic"
            >
              ACCOUNTED.
            </motion.span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="text-2xl md:text-3xl text-slate-500 max-w-4xl mx-auto leading-relaxed font-medium"
          >
            Millions of litres of clean water vanish at public filter plant taps every day. Negligence costs nothing, because it's free, and it's draining us dry.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-16 flex flex-col items-center gap-4 cursor-pointer group"
            onClick={() => navigateToSection(1)}
          >
            <span className="text-xs font-black uppercase tracking-[0.4em] text-slate-300 group-hover:text-pure-aqua transition-colors">Initialize Journey</span>
            <ChevronDown className="w-10 h-10 text-pure-aqua animate-bounce" />
          </motion.div>
        </div>
        
        {/* Animated Water Background */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <WaterRipples />
        </div>
      </section>

      {/* SECTION 2: INTRODUCTION */}
      <section id="intro" className="relative h-screen flex items-center justify-center bg-white shrink-0">
        <div className="max-w-6xl w-full text-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-100px" }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="space-y-10"
          >
            <h2 className="text-5xl md:text-7xl font-black text-slate-900 leading-none">
              Unattended taps. <br />
              <span className="text-red-500 italic">Unaccounted waste.</span>
            </h2>
            <p className="text-slate-500 text-xl max-w-4xl mx-auto leading-relaxed font-light">
              Every litre lost is a future denied. A nation already at the edge of scarcity can't afford negligence as the default.
            </p>
          </motion.div>
        </div>
      </section>

      {/* SECTION 3: SOLUTION INTRO */}
      <section id="solution" className="relative h-screen flex items-center justify-center bg-white shrink-0">
        <div className="max-w-6xl w-full text-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-100px" }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="space-y-10"
          >
            <span className="text-pure-aqua font-black text-sm tracking-[0.5em] uppercase block">The Answer</span>
            <h2 className="text-6xl md:text-8xl font-black text-slate-900 leading-none">
              IoT Based Smart Water <br />
              <span className="text-pure-aqua italic">Dispensing & Management Solution.</span>
            </h2>
            <p className="text-slate-500 text-2xl max-w-4xl mx-auto leading-relaxed font-light">
              A closed-loop system that puts humans back in control, before the tap opens, not after it's left running.
            </p>
          </motion.div>
        </div>
      </section>

      {/* SECTION 4: THE CRISIS */}
      <section id="crisis" className="relative h-screen flex items-center justify-center bg-white px-6 shrink-0">
        <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
          <div className="space-y-16">
            <motion.h2 
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              className="text-6xl md:text-7xl font-black text-slate-900 leading-[0.9]"
            >
              A Nation on the <br /><span className="text-red-500 italic">Edge of Scarcity.</span>
            </motion.h2>
            <div className="space-y-12">
              <StatCard 
                stat="2026"
                label="Absolute Scarcity"
                desc="Pakistan has officially entered 'absolute water scarcity' as per latest PCRWR monitoring."
                link="https://pcrwr.gov.pk/"
              />
              <StatCard 
                stat="800M"
                label="Daily Litres Wasted"
                desc="Daily wastage at public filter plants driven by unclosed taps and human negligence."
                link="https://www.undp.org/pakistan/water-security"
              />
            </div>
          </div>
          <div className="relative group">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              className="relative bg-white border border-slate-100 rounded-[60px] p-16 shadow-2xl shadow-slate-200/50"
            >
              <Globe className="w-24 h-24 text-red-500/20 mb-8" />
              <h3 className="text-3xl font-bold text-slate-900 leading-tight italic mb-6">"Negligence at public taps is turning safe water into waste."</h3>
              <p className="text-xl text-slate-500 font-medium">SmartFlow eliminates human oversight by automating the physical close-command.</p>
              <div className="mt-12 pt-8 border-t border-slate-100">
                 <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Data Source: PCRWR Pakistan 2026</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION 4: THE HARDWARE */}
      <section id="hardware" className="relative min-h-screen flex items-center justify-center bg-slate-50 px-6 py-24 shrink-0">
        <div className="max-w-screen-xl w-full">
          <div className="text-center mb-20">
            <h2 className="text-6xl md:text-7xl font-black text-slate-900 mb-8">Hardware Core.</h2>
            <p className="text-2xl text-slate-500 font-medium">Robust edge intelligence for zero-neglect dispensing.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-10">
            <HardwareCard img="/relay.png" name="RELAY" desc="Turns on/off the fluid engine based on ESP32 commands." color="bg-blue-50" />
            <HardwareCard img="/esp32.png" name="ESP32 MICROCONTROLLER" desc="High-performance processing hub for real-time edge intelligence." color="bg-orange-50" />
            <HardwareCard img="/watar_sensor.png" name="YF-S201 WATER FLOW SENSOR" desc="High-precision Hall-effect sensor for ±1ml accuracy." color="bg-aqua-50" />
            <HardwareCard img="/pump.png" name="FLUID ENGINE" desc="Ensures consistent delivery pressure and flow rate." color="bg-emerald-50" />
          </div>
        </div>
      </section>

      {/* SECTION 5: CONSERVATION LOOP */}
      <section id="loop" className="relative h-screen flex items-center justify-center bg-white px-6 shrink-0">
        <div className="max-w-6xl w-full">
          <h2 className="text-6xl font-black text-center mb-24 text-slate-900 tracking-tighter uppercase">Conservation Logic</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 text-center">
            <LoopStep icon={ShieldCheck} title="Set Volume" desc="Select your exact volume. Credit is reserved only for what you need." />
            <LoopStep icon={Zap} title="Smart Lock" desc="The IoT relay engages only for the committed litres, preventing over-dispensing." />
            <LoopStep icon={Droplets} title="Auto Shut-off" desc="The moment the limit is reached, the system snaps shut. Zero human negligence." />
          </div>
        </div>
      </section>

      {/* SECTION 6: ARCHITECTURE */}
      <section id="architecture" className="relative h-screen flex items-center justify-center bg-white shrink-0">
        <div className="max-w-7xl w-full px-12 relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-6xl font-black text-slate-900 mb-6">Communicating Architecture.</h2>
            <p className="text-xl text-slate-500 font-medium">A low-latency prototype built for real-world scalability.</p>
          </div>

          <div className="relative flex flex-col md:flex-row items-center justify-between gap-12 md:gap-4">
            <ArchNode icon={Atom} label="React 19" sub="PWA Web Client" iconColor="text-[#61DAFB]" imgSrc="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" />
            <ArchConnector delay={0.2} />
            <ArchNode icon={Server} label="FastAPI" sub="Logic & Auth Engine" iconColor="text-[#05998b]" imgSrc="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/fastapi/fastapi-original.svg" />
            <ArchConnector delay={0.4} />
            <ArchNode icon={Database} label="PostgreSQL" sub="Transactional Ledger" iconColor="text-[#336791]" imgSrc="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg" />
          </div>

          <div className="mt-32 flex justify-center">
             <div className="relative">
                <ArchNode icon={CloudCog} label="AWS IoT Core" sub="The MQTT Hub" iconColor="text-orange-500" imgSrc="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/amazonwebservices/amazonwebservices-plain-wordmark.svg" />
                <div className="hidden md:block absolute -top-24 left-1/2 -translate-x-1/2 w-[2px] h-24 bg-slate-100" />
             </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: CTA */}
      <section id="cta" className="relative h-screen flex items-center justify-center bg-gradient-to-t from-pure-aqua/10 to-white px-6 shrink-0">
        <div className="text-center max-w-5xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
          >
            <h2 className="text-7xl md:text-[10rem] font-black mb-12 tracking-tighter text-slate-900 leading-[0.85] uppercase">
              Save Water, <br />
              <span className="text-pure-aqua italic">Secure Future.</span>
            </h2>
            <p className="text-2xl md:text-3xl text-slate-500 mb-16 font-medium max-w-4xl mx-auto leading-relaxed">
              A conservation product built in Pakistan, for Pakistan. <br />Join us in creating a strictly accounted water ecosystem.
            </p>
            <button 
              onClick={handleLaunch}
              className="group px-16 py-8 bg-pure-aqua text-white rounded-[40px] font-black text-3xl hover:scale-110 transition-all shadow-2xl shadow-pure-aqua/40 flex items-center gap-6 mx-auto"
            >
              Launch the System <ArrowRight className="w-10 h-10 group-hover:translate-x-3 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[1000] bg-white flex flex-col items-center justify-center overflow-hidden">
      <div className="relative w-64 h-64 bg-slate-50 rounded-full flex items-center justify-center overflow-hidden border-8 border-slate-100 shadow-inner">
        <motion.div 
          initial={{ y: "100%" }}
          animate={{ y: "0%" }}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="absolute bottom-0 left-0 w-full bg-pure-aqua"
          style={{ height: "100%" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
           <Droplets className="w-24 h-24 text-white relative z-10 animate-pulse" />
        </div>
        {/* Bubbles */}
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.div 
            key={i}
            initial={{ y: 250, opacity: 0 }}
            animate={{ y: -50, opacity: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
            className="absolute left-1/2 w-4 h-4 bg-white/30 rounded-full blur-[2px]"
          />
        ))}
      </div>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 text-center"
      >
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Initializing Flow</h2>
        <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-sm italic">SmartFlow OS</p>
      </motion.div>
    </div>
  );
}

function StatCard({ stat, label, desc, link }: any) {
  return (
    <div className="group border-l-[6px] border-slate-100 pl-10 hover:border-pure-aqua transition-all duration-700 py-2">
      <div className="flex items-center gap-6 mb-4">
        <span className="text-7xl font-black text-slate-900 group-hover:text-pure-aqua transition-colors leading-none">{stat}</span>
        <a href={link} target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-white hover:shadow-xl">
          <ExternalLink className="w-5 h-5 text-slate-400" />
        </a>
      </div>
      <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 mb-3">{label}</p>
      <p className="text-xl text-slate-500 font-medium max-w-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function HardwareCard({ img, name, desc, color }: any) {
  return (
    <div className={`p-10 rounded-[60px] border border-slate-100 shadow-xl shadow-slate-200/40 hover:-translate-y-4 transition-all duration-700 flex flex-col items-center text-center ${color} group`}>
      <div className="w-full h-[320px] mb-8 p-4 overflow-hidden flex items-center justify-center">
        <img src={img} alt={name} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700" />
      </div>
      <h4 className="text-xl font-black text-slate-900 mb-3 uppercase tracking-tighter leading-tight">{name}</h4>
      <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">{desc}</p>
    </div>
  );
}

function LoopStep({ icon: Icon, title, desc }: any) {
  return (
    <div className="space-y-8 group">
      <div className="w-24 h-24 bg-white rounded-[40px] flex items-center justify-center mx-auto text-pure-aqua border border-slate-100 shadow-xl group-hover:shadow-pure-aqua/20 transition-all duration-700 group-hover:rotate-12 group-hover:scale-110">
        <Icon className="w-12 h-12" />
      </div>
      <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{title}</h3>
      <p className="text-xl text-slate-500 leading-relaxed font-medium px-4">{desc}</p>
    </div>
  );
}

function ArchNode({ icon: Icon, label, sub, iconColor, imgSrc }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      className={`p-10 rounded-[60px] border border-slate-100 bg-white shadow-xl shadow-slate-200/30 flex flex-col items-center text-center w-72 hover:shadow-2xl transition-all duration-700 hover:-translate-y-2`}
    >
      {imgSrc
        ? <img src={imgSrc} alt={label} className="w-16 h-16 mb-6 object-contain" />
        : <Icon className={`w-16 h-16 mb-6 ${iconColor}`} />
      }
      <h4 className="font-black text-2xl text-slate-900 mb-2 uppercase tracking-tighter">{label}</h4>
      <p className="text-xs text-slate-400 uppercase tracking-[0.3em] font-black">{sub}</p>
    </motion.div>
  );
}

function ArchConnector({ delay }: any) {
  return (
    <div className="hidden md:flex items-center justify-center w-24">
      <motion.div 
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        transition={{ delay, duration: 2, ease: "easeInOut" }}
        className="h-[3px] w-full bg-slate-100 origin-left rounded-full" 
      />
    </div>
  );
}

function WaterRipples() {
  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 6, repeat: Infinity, delay: i * 2, ease: "easeOut" }}
          className="absolute inset-0 m-auto w-[400px] h-[400px] border border-pure-aqua/20 rounded-full"
        />
      ))}
    </div>
  );
}
