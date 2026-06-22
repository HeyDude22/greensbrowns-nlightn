import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Leaf, Truck, Sprout, Building2, ShieldCheck, MapPin } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-beige">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-beige/80 border-b border-border/50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-forest">Greens</span>
            <span className="text-soil">Browns</span>
          </span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231F6F43' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-forest/10 px-4 py-1.5 text-sm font-medium text-forest mb-8">
              <MapPin className="h-3.5 w-3.5" />
              Bengaluru&apos;s Circular Waste Network
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] text-foreground">
              Every leaf has a{" "}
              <span className="relative">
                <span className="text-forest">second life</span>
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-accent-yellow/60" viewBox="0 0 200 12" preserveAspectRatio="none">
                  <path d="M0 8 Q50 0 100 8 Q150 16 200 8" stroke="currentColor" strokeWidth="3" fill="none" />
                </svg>
              </span>
            </h1>

            <p className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              We connect apartments and tech parks with processors who need organic waste for composting.
              Verified pickups, real-time tracking, and complete compliance — from your building&apos;s garden to the processor&apos;s facility.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="text-base px-8 h-12" asChild>
                <Link href="/register">
                  Schedule Your First Pickup
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-base px-8 h-12 border-forest/30 text-forest hover:bg-forest/5" asChild>
                <Link href="/login">I Already Have an Account</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Impact Strip */}
      <section className="bg-forest text-white py-6 border-y border-forest">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x md:divide-white/20">
            {[
              { value: "22+", label: "Partner Communities" },
              { value: "14", label: "Vehicles in Fleet" },
              { value: "3", label: "Active Processors" },
              { value: "100%", label: "Trackable Waste" },
            ].map((stat) => (
              <div key={stat.label} className="text-center px-4">
                <div className="text-3xl sm:text-4xl font-bold tracking-tight">{stat.value}</div>
                <div className="text-sm text-white/70 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              From waste to worth in{" "}
              <span className="text-forest">three steps</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
              A transparent, tracked process that benefits everyone in the chain.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-0">
            {[
              {
                step: "01",
                icon: Building2,
                title: "BWG Schedules Pickup",
                description: "Apartments and tech parks request a pickup with date, time slot, and waste photos. Our system verifies the request and estimates weight.",
                color: "bg-forest",
              },
              {
                step: "02",
                icon: Truck,
                title: "Collector Picks Up",
                description: "An assigned vehicle arrives at your location. The driver takes photos, confirms the load, and you get real-time WhatsApp updates with ETA.",
                color: "bg-soil",
              },
              {
                step: "03",
                icon: Sprout,
                title: "Processor Receives",
                description: "Organic waste is delivered directly to a verified processor. They accept delivery, and the waste becomes compost — closing the loop.",
                color: "bg-accent-yellow",
              },
            ].map((item, i) => (
              <div key={item.step} className="relative p-8 md:p-10">
                {/* Connector line */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-1/2 right-0 w-8 h-px bg-border z-10" />
                )}

                <div className="flex items-start gap-4">
                  <div className={`${item.color} text-white rounded-xl w-12 h-12 flex items-center justify-center shrink-0`}>
                    <item.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Step {item.step}</span>
                    <h3 className="text-xl font-semibold mt-1">{item.title}</h3>
                    <p className="mt-3 text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Stakeholders */}
      <section className="py-24 bg-white/60">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-16">
            Built for every part of the chain
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* BWG */}
            <div className="group rounded-2xl border bg-card p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-xl bg-forest/10 flex items-center justify-center mb-6">
                <Building2 className="h-7 w-7 text-forest" />
              </div>
              <h3 className="text-xl font-semibold">Bulk Waste Generators</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Apartments, RWAs, Tech Parks</p>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-forest shrink-0 mt-0.5" />
                  Schedule pickups with date, slot &amp; photos
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-forest shrink-0 mt-0.5" />
                  Prepaid packages for regular collections
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-forest shrink-0 mt-0.5" />
                  BBMP compliance documents auto-generated
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-forest shrink-0 mt-0.5" />
                  Email notifications at every stage
                </li>
              </ul>
              <Button variant="outline" size="sm" className="mt-6 w-full" asChild>
                <Link href="/register">Register as BWG <ArrowRight className="ml-2 h-3 w-3" /></Link>
              </Button>
            </div>

            {/* Collector */}
            <div className="group rounded-2xl border bg-card p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-xl bg-soil/10 flex items-center justify-center mb-6">
                <Truck className="h-7 w-7 text-soil" />
              </div>
              <h3 className="text-xl font-semibold">Transporters</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Licensed waste collectors</p>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-soil shrink-0 mt-0.5" />
                  Job assignments via WhatsApp with Maps link
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-soil shrink-0 mt-0.5" />
                  Photo-based pickup &amp; delivery confirmation
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-soil shrink-0 mt-0.5" />
                  Automated reminders before each slot
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-soil shrink-0 mt-0.5" />
                  Multi-vehicle fleet management
                </li>
              </ul>
              <Button variant="outline" size="sm" className="mt-6 w-full border-soil/30 text-soil hover:bg-soil/5" asChild>
                <Link href="/login">Transporter Login <ArrowRight className="ml-2 h-3 w-3" /></Link>
              </Button>
            </div>

            {/* Farmer */}
            <div className="group rounded-2xl border bg-card p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-xl bg-accent-yellow/10 flex items-center justify-center mb-6">
                <Sprout className="h-7 w-7 text-accent-yellow" />
              </div>
              <h3 className="text-xl font-semibold">Processors</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Organic compost producers</p>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent-yellow shrink-0 mt-0.5" />
                  Delivery notice with real-time ETA
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent-yellow shrink-0 mt-0.5" />
                  Accept deliveries via WhatsApp
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent-yellow shrink-0 mt-0.5" />
                  Auto-accept at midnight if no response
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent-yellow shrink-0 mt-0.5" />
                  Free organic waste supply for composting
                </li>
              </ul>
              <Button variant="outline" size="sm" className="mt-6 w-full border-accent-yellow/30 text-accent-yellow hover:bg-accent-yellow/5" asChild>
                <Link href="/login">Processor Login <ArrowRight className="ml-2 h-3 w-3" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                Bengaluru generates{" "}
                <span className="text-soil">5,000+ tonnes</span> of green waste daily
              </h2>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                Most of it ends up in landfills or is burned — polluting groundwater and air.
                Meanwhile, processors around the city spend money on chemical fertilizers when they could be using free organic compost.
              </p>
              <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
                GreensBrowns bridges this gap with technology — connecting the people who generate green waste with the people who need it most.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: "🏗️", label: "Reduces landfill burden", detail: "Every pickup diverts waste from already-overflowing landfills" },
                { icon: "🌱", label: "Free compost for processors", detail: "Quality organic input at zero cost for local agriculture" },
                { icon: "📋", label: "BBMP compliance", detail: "Automated manifests and reports for regulatory requirements" },
                { icon: "🔄", label: "Circular economy", detail: "Waste becomes a resource in a transparent, tracked loop" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-card p-5">
                  <span className="text-2xl">{item.icon}</span>
                  <h4 className="font-semibold text-sm mt-3">{item.label}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-forest" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E")`,
        }} />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <Leaf className="h-10 w-10 text-accent-yellow mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Ready to close the loop?
          </h2>
          <p className="mt-4 text-white/80 text-lg max-w-xl mx-auto">
            Join Bengaluru&apos;s growing network of responsible communities, collectors, and processors.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-base px-8 h-12 bg-white text-forest hover:bg-white/90" asChild>
              <Link href="/register">
                Create Your Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t py-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xl font-bold">
                <span className="text-forest">Greens</span>
                <span className="text-soil">Browns</span>
              </span>
              <p className="text-sm text-muted-foreground mt-1">
                A product by <a href="https://a-gain.in" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">A-Gain</a>
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} GreensBrowns. Powered by{" "}
              <a href="https://www.urbanmorph.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Urban Morph</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
