"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { usePathname } from "next/navigation";
import { useState } from "react";
import styles from "./Navbar.module.css";

export default function Navbar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Hide Navbar completely on the login page
  if (pathname === "/login") return null;
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } 
    catch (error) {
      console.error("Error signing out:", error);
    }
  };
  
  const navLinks = user ? [
    { name: "Rankings", path: "/" },
    { name: "1v1 Draft", path: "/h2h" },
    { name: "Team Management", path: "/team" },
    { name: "Settings", path: "/settings" },
    ...(user.isAdmin ? [{ name: "Admin", path: "/admin" }] : [])] : [{ name: "Rankings", path: "/" }];
  
  return (
    <nav className={`glass ${styles.nav}`}>
      <div className={styles.brand}>
        <Link href="/"><span className={styles.brandHighlight}>Fantasy</span> FRC</Link>
      </div>
    
      {/* Desktop Navigation */}
      <div className={styles.desktopLinks}>
        {!loading && navLinks.map((link) => (
          <Link key={link.path} href={link.path} className={`${styles.navLink} ${pathname === link.path ? styles.navLinkActive : ""}`}>
            {link.name}
          </Link>
        ))}
      </div>
      
      <div className={styles.actions}>
        {!loading && (user ? (<button onClick={handleLogout} className="btn-secondary">Sign Out</button>) : 
          (<Link href="/login" className="btn-primary">Log In</Link>))}
      </div>
      
      {/* Mobile Menu Toggle */}
      <div className={styles.mobileToggle}>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>{isMobileMenuOpen ? "Close" : "Menu"}</button>
      </div>
      
      {/* Mobile Navigation Dropdown */}
      {isMobileMenuOpen && (<div className={`glass ${styles.mobileMenu}`}>
        {!loading && navLinks.map((link) => (
          <Link key={link.path} href={link.path} onClick={() => setIsMobileMenuOpen(false)}
            className={`${styles.navLink} ${pathname === link.path ? styles.navLinkActive : ""}`}>
            {link.name}
          </Link>
        ))}
        <hr className={styles.divider} />
        {!loading && (user ? (
          <button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} 
            className={`btn-secondary ${styles.mobileAction}`}>Sign Out</button>
          ) : (<Link href="/login" onClick={() => setIsMobileMenuOpen(false)} 
            className={`btn-primary ${styles.mobileAction}`}>Log In</Link>)
        )}
      </div>)}
    </nav>
  );
}
