import Image from 'next/image'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0D1B2A] px-4 text-center">
      <Image
        src="/LotMonster_Logo_Transparent.png"
        alt="Lotmonster"
        width={640}
        height={427}
        priority
        className="h-auto w-[min(80vw,640px)]"
      />
      <p className="mt-4 max-w-2xl text-lg text-white/70 sm:text-xl">
        The Alternative Solution for CPG Inventory and Replenishment
      </p>
      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="w-48 rounded-lg bg-teal-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-400"
        >
          Sign Up
        </Link>
        <Link
          href="/login"
          className="w-48 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          Log In
        </Link>
      </div>
    </main>
  )
}
