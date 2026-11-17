// Shared frame for the small signed-out screens (forgot password, reset
// password, invite link): logo on top, one card underneath.
export default function AuthCard({
  subtitle,
  children,
}: {
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-full bg-[#4ade80] flex items-center justify-center shadow-lg shadow-[#4ade80]/20">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M10 3C6.686 3 4 5.686 4 9c0 2.21 1.197 4.14 2.98 5.19L10 17l3.02-2.81A5.994 5.994 0 0 0 16 9c0-3.314-2.686-6-6-6Z"
                fill="#0f2018"
              />
              <circle cx="10" cy="9" r="2" fill="#4ade80" />
            </svg>
          </div>
          <h1
            className="text-3xl tracking-tight text-white"
            style={{ fontFamily: "var(--font-instrument-serif)" }}
          >
            GreenTime
          </h1>
          {subtitle && <p className="text-[#4d7a5d] text-sm">{subtitle}</p>}
        </div>
        <div className="bg-[#0f2018] border border-[#2d5040] rounded-2xl p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}

export const authInputCls =
  "w-full rounded-lg bg-[#1a3a2a] border border-[#2d5040] text-white placeholder-[#4d7a5d] px-4 py-3 text-base sm:text-sm outline-none focus:border-[#4ade80] focus:ring-1 focus:ring-[#4ade80] transition-colors";
export const authButtonCls =
  "w-full bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed";
export const authErrorCls =
  "text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2";
