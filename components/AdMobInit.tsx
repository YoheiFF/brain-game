"use client";
import { useEffect } from "react";
import { initAdMob } from "@/lib/admob";

export default function AdMobInit() {
  useEffect(() => {
    initAdMob();
  }, []);
  return null;
}
