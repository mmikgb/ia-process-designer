import { TopBar } from "@/components/shell/top-bar"

/** One screen: the top bar, then the content, on the page surface. */
export function Page({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1320px] min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <TopBar title={title} subtitle={subtitle} />
      {children}
    </main>
  )
}
