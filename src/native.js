// Glue for the store builds (Capacitor). In the browser all of this does nothing.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Sfx } from './sfx.js';

export const isNative = Capacitor.isNativePlatform();

/** Full screen, quiet in the background, and the Android back button goes to the home screen. */
export function setupNative() {
  if (!isNative) return;
  StatusBar.hide().catch(() => {});
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) Sfx.resume();
    else Sfx.pause();
  });
  App.addListener('backButton', () => App.minimizeApp());
}

/** The first screen is drawn: the launch screen can go. */
export function nativeReady() {
  if (isNative) SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
}
