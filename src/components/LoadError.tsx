import Link from "next/link";

// Full-page error for when a screen's data could not be loaded.
// retryHref is a plain link on purpose: a full page load re-runs the server fetch.
export default function LoadError({
  title,
  message,
  retryHref,
  backHref,
  backLabel,
}: {
  title: string;
  message: string;
  retryHref: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="min-h-screen bg-[#1a3a2a] flex items-center justify-center px-4">
      <div
        role="alert"
        className="w-full max-w-sm bg-[#0f2018] border border-[#2d5040] rounded-2xl p-7 text-center"
      >
        <h1 className="text-white font-semibold text-lg mb-2">{title}</h1>
        <p className="text-red-400 text-sm mb-6 break-words">{message}</p>
        <div className="flex flex-col gap-3">
          <a
            href={retryHref}
            className="bg-[#4ade80] text-[#0f2018] font-semibold text-sm py-3 rounded-lg hover:bg-[#6ee7a0] transition-colors"
          >
            Try again
          </a>
          {backHref && (
            <Link
              href={backHref}
              className="text-sm text-white/60 hover:text-white/80 transition-colors py-2"
            >
              {backLabel ?? "Back"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
