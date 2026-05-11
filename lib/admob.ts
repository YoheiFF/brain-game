"use client";
import { Capacitor } from "@capacitor/core";
import { AdMob, RewardAdPluginEvents } from "@capacitor-community/admob";

// テスト用ID（本番リリース時は実際のIDに差し替え）
const TEST_APP_ID = "ca-app-pub-3940256099942544~3347511713";
const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917";

export const REWARDED_AD_UNIT_ID = TEST_REWARDED_ID;

export async function initAdMob(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AdMob.initialize({
      testingDevices: [],
      initializeForTesting: true,
    });
  } catch (e) {
    console.warn("[AdMob] initialize failed:", e);
  }
}

export async function showRewardedAd(): Promise<boolean> {
  // Web環境: 広告をスキップしてリワードを付与（開発用）
  if (!Capacitor.isNativePlatform()) return true;

  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID });

    return new Promise<boolean>((resolve) => {
      let settled = false;

      const done = (result: boolean) => {
        if (settled) return;
        settled = true;
        rewardHandle.then((h) => h.remove());
        dismissHandle.then((h) => h.remove());
        resolve(result);
      };

      const rewardHandle = AdMob.addListener(
        RewardAdPluginEvents.Rewarded,
        () => done(true)
      );
      const dismissHandle = AdMob.addListener(
        RewardAdPluginEvents.Dismissed,
        () => done(false)
      );

      AdMob.showRewardVideoAd();
    });
  } catch (e) {
    console.warn("[AdMob] showRewardedAd failed:", e);
    return false;
  }
}
