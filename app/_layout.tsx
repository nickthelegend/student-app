"use client"

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native"
import { useFonts } from "expo-font"
import { Stack, router } from "expo-router"; // Added router
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import { useEffect } from "react"
import "react-native-reanimated"
// Removed AsyncStorage and createClient as Supabase is initialized in lib/supabase.ts
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { createClient } from "@supabase/supabase-js";

import { useColorScheme } from "@/hooks/useColorScheme"
import { supabase } from "@/lib/supabase"; // Import supabase client

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const colorScheme = useColorScheme()
  const [loaded, error] = useFonts({
    // Added error handling for useFonts
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  })

  useEffect(() => {
    if (error) throw error // Throw error if font loading fails
  }, [error])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])

  useEffect(() => {
    // Listen for auth state changes to redirect
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        // If there's a session, ensure user is on a main app screen
        // This might need adjustment based on your navigation structure
        // For now, if a session exists, we assume they should be in '(tabs)'
        // router.replace("/(tabs)"); // This might cause issues if already navigating, login.tsx handles initial redirect
      } else {
        // If no session, redirect to login
        router.replace("/login")
      }
    })

    // Check initial session state
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && loaded) {
        // Ensure fonts are loaded before redirecting
        router.replace("/login")
      } else if (session && loaded) {
        // If session exists and app is loaded, potentially redirect to (tabs)
        // This is mainly handled by login.tsx's initial check, but can be a fallback
        // router.replace("/(tabs)");
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [loaded]) // Depend on loaded to ensure router is ready

  if (!loaded) {
    return null
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="class" options={{ headerShown: false }} />
        <Stack.Screen name="automatic" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  )
}
