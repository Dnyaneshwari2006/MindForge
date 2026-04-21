import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LiveScore() {
  const navigate = useNavigate();

  // Inject Spline 3D Viewer script
  useEffect(() => {
    if (!document.querySelector('script[src*="spline-viewer"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@splinetool/viewer@1.12.70/build/spline-viewer.js';
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="relative w-full min-h-screen flex flex-col md:flex-row bg-black overflow-hidden group font-sans">
      
      {/* LEFT PANE - MOTIVATION & CONTROLS */}
      <div className="absolute top-0 left-0 w-full h-full flex flex-col justify-center z-10 pointer-events-none md:w-[65%] pl-12 md:pl-[15%] lg:pl-[22%] xl:pl-[28%]">
        <div className="max-w-xl pointer-events-auto">
         
         {/* EXACTLY matching the sleek landing page reference */}
         <div className="animate-fade-in w-full mt-12 pb-16">
           <h1 className="text-[4.5rem] lg:text-[6rem] font-bold tracking-tighter text-white leading-[1.05] mb-6 drop-shadow-2xl">
             Design your<br/>own focus
           </h1>
           <p className="text-zinc-400 text-lg lg:text-[22px] leading-[1.6] mb-10 font-light">
             We build systems that process data at the speed of thought. Fast, adaptive, and built to scale with the world.
           </p>

           <button 
             onClick={() => navigate('/session')} 
             className="flex items-center justify-center bg-white text-black text-[17px] font-bold px-10 py-4 rounded-full hover:scale-105 hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] border-none outline-none"
             style={{ width: 'fit-content' }}
           >
             Get Started
           </button>
         </div>

        </div>
      </div>

      {/* RIGHT HALF — Spline 3D Viewer */}
      <div className="absolute right-0 top-0 w-full md:w-[60%] h-full z-0 pointer-events-auto overflow-hidden">
         <spline-viewer url="https://prod.spline.design/Nv3Hgrs9DL1kFEb1/scene.splinecode" style={{ width: '100%', height: '100%' }}></spline-viewer>

         {/* WATERMARK BLUR / BLOCK — perfectly hides the spline logo in bottom right overlay */}
         <div className="absolute bottom-3 md:bottom-6 right-3 md:right-6 w-[200px] h-[60px] bg-black z-50 pointer-events-none rounded-xl" />
      </div>

    </div>
  );
}
