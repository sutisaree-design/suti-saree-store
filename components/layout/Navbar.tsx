"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ShoppingBag,
  Heart,
  User,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";

// ─── Category data ────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    label: "Silk Sarees",
    href: "/silk-sarees",
    tag: "Bestseller",
    img: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=300&q=80",
    desc: "Kanjivaram, Banarasi & more",
  },
  {
    label: "Banarasi Sarees",
    href: "/banarasi-sarees",
    img: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=300&q=80",
    desc: "Zari woven masterpieces",
  },
  {
    label: "Cotton Sarees",
    href: "/cotton-sarees",
    tag: "New",
    img: "https://images.unsplash.com/photo-1617137968427-85924c800a22?w=300&q=80",
    desc: "Breezy everyday elegance",
  },
  {
    label: "Cotton Silk",
    href: "/cotton-silk",
    img: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&q=80",
    desc: "Best of both worlds",
  },
  {
    label: "Cotton Blend",
    href: "/cotton-blend",
    img: "https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=300&q=80",
    desc: "Comfort meets style",
  },
  {
    label: "Georgette Sarees",
    href: "/georgette-sarees",
    img: "https://images.unsplash.com/photo-1609206879246-82b38e5f7e28?w=300&q=80",
    desc: "Flowy & party-ready",
  },
  {
    label: "Mulmul Cotton",
    href: "/mulmul-cotton",
    img: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=300&q=80",
    desc: "Ultra-soft summer drapes",
  },
  {
    label: "Maheshwari Sarees",
    href: "/maheshwari-sarees",
    img: "https://images.unsplash.com/photo-1536766768598-e09213fdcf22?w=300&q=80",
    desc: "Heritage of Madhya Pradesh",
  },
  {
    label: "Linen Sarees",
    href: "/linen-sarees",
    img: "https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=300&q=80",
    desc: "Sophisticated texture",
  },
  {
    label: "Tissue Sarees",
    href: "/tissue-sarees",
    img: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=300&q=80",
    desc: "Sheer & luminous drapes",
  },
  {
    label: "Jamdani Sarees",
    href: "/jamdani-sarees",
    tag: "Heritage",
    img: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=300&q=80",
    desc: "UNESCO heritage weave",
  },
];

const ETHNIC_WEAR = [
  {
    label: "Anarkali Suits",
    href: "/anarkali-suits",
    img: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&q=80",
    desc: "Regal floor-length silhouettes",
  },
  {
    label: "Kurta Sets",
    href: "/kurta-sets",
    img: "https://images.unsplash.com/photo-1617137968427-85924c800a22?w=300&q=80",
    desc: "Coordinated ethnic comfort",
  },
  {
    label: "Kurti",
    href: "/kurti",
    img: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=300&q=80",
    desc: "Casual to festive",
  },
  {
    label: "Lehenga",
    href: "/lehenga",
    tag: "Festive",
    img: "https://images.unsplash.com/photo-1609206879246-82b38e5f7e28?w=300&q=80",
    desc: "Celebration-worthy ensembles",
  },
];

const NAV_LINKS = [
  { label: "Blog", href: "/blog" },
  { label: "About Us", href: "/about-us" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopMegaOpen, setDesktopMegaOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<null | "sarees" | "ethnic">(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const megaRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mega menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) {
        setDesktopMegaOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setSearchOpen(false);
    }
  };

  return (
    <>
      {/* ── Announcement Bar ── */}
      <div className="bg-[#7B1C2E] text-white text-center text-xs py-2 px-4 tracking-widest font-medium">
        ✦ FREE SHIPPING ON ORDERS ABOVE ₹999 &nbsp;|&nbsp; HANDCRAFTED WITH LOVE ✦
      </div>

      {/* ── Main Navbar ── */}
      <header
        className={`sticky top-0 z-50 bg-white transition-shadow duration-300 ${
          scrolled ? "shadow-md" : "shadow-sm"
        }`}
      >
        {/* Brand bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          {/* Mobile: Hamburger */}
          <button
            className="lg:hidden p-2 -ml-2 text-[#7B1C2E]"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>

          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <span className="font-serif text-xl sm:text-2xl font-bold text-[#7B1C2E] tracking-tight">
              Aruhi<span className="text-[#C9A86C] font-light">Handlooms</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center" ref={megaRef}>
            <Link
              href="/shop-all"
              className="nav-link px-3 py-2 text-sm font-medium text-gray-700 hover:text-[#7B1C2E] transition-colors rounded-md hover:bg-rose-50"
            >
              Shop All
            </Link>

            {/* Sarees Mega */}
            <div className="relative">
              <button
                onClick={() => setDesktopMegaOpen(d => !d)}
                className={`flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                  desktopMegaOpen
                    ? "text-[#7B1C2E] bg-rose-50"
                    : "text-gray-700 hover:text-[#7B1C2E] hover:bg-rose-50"
                }`}
              >
                Sarees
                <ChevronDown
                  size={14}
                  className={`transition-transform ${desktopMegaOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Mega Menu Panel */}
              {desktopMegaOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[820px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50">
                  <div className="grid grid-cols-12">
                    {/* Left column: Sarees grid */}
                    <div className="col-span-8 p-6">
                      <p className="text-xs font-semibold tracking-widest text-[#C9A86C] uppercase mb-4">
                        Sarees
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {CATEGORIES.map((cat) => (
                          <Link
                            key={cat.href}
                            href={cat.href}
                            onClick={() => setDesktopMegaOpen(false)}
                            className="group flex items-center gap-3 p-2 rounded-xl hover:bg-rose-50 transition-colors"
                          >
                            <img
                              src={cat.img}
                              alt={cat.label}
                              className="w-12 h-12 rounded-lg object-cover flex-shrink-0 group-hover:scale-105 transition-transform"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-medium text-gray-800 group-hover:text-[#7B1C2E] truncate">
                                  {cat.label}
                                </span>
                                {cat.tag && (
                                  <span className="text-[10px] bg-[#7B1C2E] text-white px-1.5 py-0.5 rounded-full flex-shrink-0">
                                    {cat.tag}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 truncate">{cat.desc}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>

                    {/* Right column: Ethnic wear + featured */}
                    <div className="col-span-4 bg-[#FDF6EE] p-6 flex flex-col gap-5">
                      <div>
                        <p className="text-xs font-semibold tracking-widest text-[#C9A86C] uppercase mb-3">
                          Ethnic Wear
                        </p>
                        <div className="flex flex-col gap-2">
                          {ETHNIC_WEAR.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setDesktopMegaOpen(false)}
                              className="group flex items-center gap-3 p-2 rounded-xl hover:bg-white transition-colors"
                            >
                              <img
                                src={item.img}
                                alt={item.label}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                              />
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-medium text-gray-800 group-hover:text-[#7B1C2E]">
                                    {item.label}
                                  </span>
                                  {item.tag && (
                                    <span className="text-[10px] bg-[#C9A86C] text-white px-1.5 py-0.5 rounded-full">
                                      {item.tag}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{item.desc}</p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>

                      {/* Featured banner */}
                      <div className="mt-auto rounded-xl overflow-hidden relative h-28">
                        <img
                          src="https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&q=80"
                          alt="New Collection"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#7B1C2E]/80 to-transparent flex items-end p-3">
                          <div>
                            <p className="text-white text-xs font-semibold">New Arrivals</p>
                            <p className="text-[#C9A86C] text-xs">Explore the collection →</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Static links */}
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-[#7B1C2E] transition-colors rounded-md hover:bg-rose-50"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Right icons */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Search */}
            <button
              onClick={() => setSearchOpen(s => !s)}
              className="p-2 text-gray-600 hover:text-[#7B1C2E] transition-colors"
              aria-label="Search"
            >
              <Search size={20} />
            </button>

            {/* Wishlist */}
            <Link href="/wishlist" className="p-2 text-gray-600 hover:text-[#7B1C2E] transition-colors hidden sm:inline-flex">
              <Heart size={20} />
            </Link>

            {/* Account */}
            <Link href="/account" className="p-2 text-gray-600 hover:text-[#7B1C2E] transition-colors hidden sm:inline-flex">
              <User size={20} />
            </Link>

            {/* Cart */}
            <Link
              href="/cart"
              className="relative p-2 text-gray-600 hover:text-[#7B1C2E] transition-colors"
              aria-label="Cart"
            >
              <ShoppingBag size={20} />
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-[#7B1C2E] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                0
              </span>
            </Link>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="border-t border-gray-100 bg-white px-4 py-3">
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto flex gap-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sarees, suits, lehenga…"
                className="flex-1 border border-gray-200 rounded-full px-5 py-2.5 text-sm focus:outline-none focus:border-[#7B1C2E] focus:ring-1 focus:ring-[#7B1C2E]"
              />
              <button
                type="submit"
                className="bg-[#7B1C2E] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-[#6a1727] transition-colors"
              >
                Search
              </button>
            </form>
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════════════
          MOBILE DRAWER
      ══════════════════════════════════════════════════════════════ */}
      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => { setMobileOpen(false); setMobileSection(null); }}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[320px] bg-white flex flex-col lg:hidden transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#7B1C2E]">
          <span className="font-serif text-xl font-bold text-white tracking-tight">
            Aruhi<span className="text-[#C9A86C] font-light">Handlooms</span>
          </span>
          <button
            onClick={() => { setMobileOpen(false); setMobileSection(null); }}
            className="p-1.5 text-white/80 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>

        {/* Search inside drawer */}
        <div className="px-4 py-3 border-b border-gray-100 bg-[#FDF6EE]">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sarees, suits…"
              className="flex-1 border border-gray-200 bg-white rounded-full px-4 py-2 text-sm focus:outline-none focus:border-[#7B1C2E]"
            />
            <button type="submit" className="p-2 text-[#7B1C2E]">
              <Search size={18} />
            </button>
          </form>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Default view ── */}
          {mobileSection === null && (
            <div className="py-3">
              {/* Shop All */}
              <Link
                href="/shop-all"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 text-gray-800 font-medium hover:bg-rose-50 hover:text-[#7B1C2E] transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Sparkles size={17} className="text-[#C9A86C]" />
                  Shop All
                </span>
              </Link>

              <div className="my-2 mx-5 border-t border-dashed border-gray-100" />

              {/* Sarees accordion trigger */}
              <button
                onClick={() => setMobileSection("sarees")}
                className="w-full flex items-center justify-between px-5 py-3.5 text-gray-800 font-medium hover:bg-rose-50 hover:text-[#7B1C2E] transition-colors"
              >
                <span className="flex items-center gap-3">
                  {/* mini icon */}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-[#C9A86C]">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity=".2"/>
                    <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Sarees
                </span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>

              {/* Ethnic Wear */}
              <button
                onClick={() => setMobileSection("ethnic")}
                className="w-full flex items-center justify-between px-5 py-3.5 text-gray-800 font-medium hover:bg-rose-50 hover:text-[#7B1C2E] transition-colors"
              >
                <span className="flex items-center gap-3">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-[#C9A86C]">
                    <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity=".2"/>
                    <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Ethnic Wear
                </span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>

              <div className="my-2 mx-5 border-t border-dashed border-gray-100" />

              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-5 py-3.5 text-gray-700 hover:bg-rose-50 hover:text-[#7B1C2E] transition-colors"
                >
                  {l.label}
                </Link>
              ))}

              <div className="my-2 mx-5 border-t border-dashed border-gray-100" />

              {/* Account links */}
              <Link href="/account" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-5 py-3 text-gray-600 hover:text-[#7B1C2E]">
                <User size={17} /> My Account
              </Link>
              <Link href="/wishlist" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-5 py-3 text-gray-600 hover:text-[#7B1C2E]">
                <Heart size={17} /> Wishlist
              </Link>
              <Link href="/cart" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-5 py-3 text-gray-600 hover:text-[#7B1C2E]">
                <ShoppingBag size={17} /> My Cart
              </Link>
            </div>
          )}

          {/* ── Sarees sub-menu ── */}
          {mobileSection === "sarees" && (
            <div>
              {/* Back button */}
              <button
                onClick={() => setMobileSection(null)}
                className="flex items-center gap-2 px-4 py-3 text-sm text-[#7B1C2E] font-medium border-b border-gray-100 w-full hover:bg-rose-50"
              >
                <ChevronRight size={14} className="rotate-180" /> Back
              </button>
              <p className="px-5 py-3 text-xs font-semibold tracking-widest text-[#C9A86C] uppercase bg-[#FDF6EE]">
                Sarees
              </p>
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat.href}
                  href={cat.href}
                  onClick={() => { setMobileOpen(false); setMobileSection(null); }}
                  className="flex items-center gap-4 px-4 py-3 border-b border-gray-50 hover:bg-rose-50 transition-colors"
                >
                  <img
                    src={cat.img}
                    alt={cat.label}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{cat.label}</span>
                      {cat.tag && (
                        <span className="text-[10px] bg-[#7B1C2E] text-white px-1.5 py-0.5 rounded-full">
                          {cat.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{cat.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* ── Ethnic Wear sub-menu ── */}
          {mobileSection === "ethnic" && (
            <div>
              <button
                onClick={() => setMobileSection(null)}
                className="flex items-center gap-2 px-4 py-3 text-sm text-[#7B1C2E] font-medium border-b border-gray-100 w-full hover:bg-rose-50"
              >
                <ChevronRight size={14} className="rotate-180" /> Back
              </button>
              <p className="px-5 py-3 text-xs font-semibold tracking-widest text-[#C9A86C] uppercase bg-[#FDF6EE]">
                Ethnic Wear
              </p>
              {ETHNIC_WEAR.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => { setMobileOpen(false); setMobileSection(null); }}
                  className="flex items-center gap-4 px-4 py-3 border-b border-gray-50 hover:bg-rose-50 transition-colors"
                >
                  <img
                    src={item.img}
                    alt={item.label}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{item.label}</span>
                      {item.tag && (
                        <span className="text-[10px] bg-[#C9A86C] text-white px-1.5 py-0.5 rounded-full">
                          {item.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-gray-100 px-5 py-4 bg-[#FDF6EE]">
          <p className="text-center text-xs text-gray-400 font-medium tracking-wide">
            ✦ Where Craft Meets Culture ✦
          </p>
        </div>
      </div>
    </>
  );
}
